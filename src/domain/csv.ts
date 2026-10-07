// CSV import: parsing, per-bank column mapping, and turning rows into
// transactions. Pure; the UI and db layers decide what to do with the result.

import { isISODate } from './dates';
import { resolveMerchant } from './merchant';
import { parseMoneyInput } from './money';
import type { CsvMapping, ISODate, MerchantRule, NewRecord, Transaction } from './types';

// ---- parsing -----------------------------------------------------------

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t', '|']) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180-style parser: quoted fields, escaped quotes, newlines inside quotes. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .map((cells) => cells.map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ''));
}

// ---- dates & amounts ---------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export function parseCsvDate(value: string, format: CsvMapping['dateFormat']): ISODate | null {
  const parts = value.trim().match(/^(\d{1,4})[/.\- ](\d{1,2})[/.\- ](\d{1,4})/);
  if (parts) {
    const [a, b, c] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    let [y, m, d] = format === 'YMD' ? [a, b, c] : format === 'MDY' ? [c, a, b] : [c, b, a];
    if (y < 100) y += 2000;
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return isISODate(iso) ? iso : null;
  }
  const compact = value.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const iso = `${compact[1]}-${compact[2]}-${compact[3]}`;
    return isISODate(iso) ? iso : null;
  }
  // Month names ("Oct 7, 2026", "7 Oct 2026").
  if (/[a-z]{3}/i.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }
  }
  return null;
}

/** Bank-style amounts: "$1,234.56", "(12.00)", "12.00-", "12.00 CR". */
export function parseCsvAmount(value: string, currency?: string): number | null {
  let text = value.trim();
  if (text === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text) || /-$/.test(text) || /\bDR$/i.test(text)) negative = true;
  text = text
    .replace(/[()]/g, '')
    .replace(/-$/, '')
    .replace(/\s*(CR|DR)$/i, '');
  // Anything else with letters in it is text that happens to contain digits.
  if (/\p{L}/u.test(text)) return null;
  const cents = parseMoneyInput(text, currency);
  if (cents === null) return null;
  return negative ? -Math.abs(cents) : cents;
}

// ---- mapping -----------------------------------------------------------

const HEADER_HINTS = {
  date: /date|posted/i,
  description: /desc|merchant|payee|name|memo|detail|narrat|transaction$/i,
  amount: /^amount|amt|value/i,
  debit: /debit|withdraw|paid out|money out|charge/i,
  credit: /credit|deposit|paid in|money in/i,
};

const looksLikeDate = (cell: string) =>
  (['YMD', 'MDY', 'DMY'] as const).some((format) => parseCsvDate(cell, format) !== null);

/** A first row with no dates or amounts in it is a header. */
export function detectHeader(rows: readonly string[][]): boolean {
  const first = rows[0];
  if (!first) return false;
  return !first.some((cell) => looksLikeDate(cell) || /^[-($]?\$?\d[\d,]*\.\d{2}\)?$/.test(cell));
}

function guessDateFormat(values: readonly string[]): CsvMapping['dateFormat'] {
  let dmy = false;
  for (const value of values) {
    const parts = value.match(/^(\d{1,4})[/.\- ](\d{1,2})[/.\- ](\d{1,4})/);
    if (!parts) continue;
    if (parts[1]!.length === 4) return 'YMD';
    if (Number(parts[1]) > 12) dmy = true;
    if (Number(parts[2]) > 12) return 'MDY';
  }
  return dmy ? 'DMY' : 'MDY';
}

/** Column names for the mapping UI. */
export function columnNames(rows: readonly string[][], hasHeader: boolean): string[] {
  const width = Math.max(0, ...rows.slice(0, 20).map((row) => row.length));
  return Array.from({ length: width }, (_, i) =>
    hasHeader && rows[0]?.[i] ? rows[0][i]! : `Column ${i + 1}`,
  );
}

/** Stable identifier for a file layout, used to remember a bank's mapping. */
export function csvSignature(rows: readonly string[][], hasHeader: boolean): string {
  if (hasHeader) return `h:${(rows[0] ?? []).map((cell) => cell.toLowerCase()).join('|')}`;
  return `n:${Math.max(0, ...rows.slice(0, 20).map((row) => row.length))}`;
}

/** Best-effort mapping from header names, falling back to the cell contents. */
export function guessMapping(rows: readonly string[][]): CsvMapping {
  const hasHeader = detectHeader(rows);
  const names = columnNames(rows, hasHeader);
  const body = rows.slice(hasHeader ? 1 : 0, 25);
  const column = (i: number) => body.map((row) => row[i] ?? '').filter((cell) => cell !== '');
  const share = (i: number, test: (cell: string) => boolean) => {
    const cells = column(i);
    return cells.length === 0 ? 0 : cells.filter(test).length / cells.length;
  };
  const byHint = (hint: RegExp, taken: number[] = []) =>
    hasHeader ? names.findIndex((name, i) => hint.test(name) && !taken.includes(i)) : -1;
  const indexes = names.map((_, i) => i);

  let dateColumn = byHint(HEADER_HINTS.date);
  if (dateColumn < 0) dateColumn = indexes.find((i) => share(i, looksLikeDate) > 0.8) ?? 0;

  const isAmount = (cell: string) => /\d/.test(cell) && parseCsvAmount(cell) !== null;
  const debitColumn = byHint(HEADER_HINTS.debit, [dateColumn]);
  const creditColumn = byHint(HEADER_HINTS.credit, [dateColumn, debitColumn]);
  let amountColumn = byHint(HEADER_HINTS.amount, [dateColumn]);
  const split = debitColumn >= 0 && creditColumn >= 0;
  if (amountColumn < 0 && !split) {
    amountColumn = indexes.find((i) => i !== dateColumn && share(i, isAmount) > 0.8) ?? -1;
  }

  const taken = [dateColumn, amountColumn, debitColumn, creditColumn];
  let descriptionColumn = byHint(HEADER_HINTS.description, taken);
  if (descriptionColumn < 0) {
    // The wordiest remaining column.
    const length = (i: number) => column(i).reduce((sum, cell) => sum + cell.length, 0);
    descriptionColumn =
      indexes
        .filter((i) => !taken.includes(i) && share(i, isAmount) < 0.5)
        .sort((a, b) => length(b) - length(a))[0] ?? 0;
  }

  return {
    hasHeader,
    dateColumn,
    dateFormat: guessDateFormat(column(dateColumn)),
    descriptionColumn,
    amountColumn: amountColumn >= 0 || !split ? Math.max(amountColumn, 0) : -1,
    debitColumn: amountColumn >= 0 || !split ? -1 : debitColumn,
    creditColumn: amountColumn >= 0 || !split ? -1 : creditColumn,
    invertAmount: false,
  };
}

// ---- rows -> transactions ----------------------------------------------

export interface CsvRowError {
  /** 1-based line in the file's data rows (header included in the count). */
  row: number;
  reason: string;
}

export interface CsvImportPlan {
  ready: NewRecord<Transaction>[];
  /** Rows skipped because an identical transaction already exists. */
  duplicates: number;
  errors: CsvRowError[];
}

const dedupeKey = (tx: Pick<Transaction, 'date' | 'amountCents' | 'rawDescriptor'>) =>
  `${tx.date}|${tx.amountCents}|${tx.rawDescriptor.trim().toLowerCase()}`;

/**
 * Apply a mapping to parsed rows. Merchants are cleaned and categorised by
 * rule; uncategorised expenses are flagged for review. A row is a duplicate
 * when a transaction with the same date, amount and descriptor already
 * exists (counted, so two identical coffees in one day both survive unless
 * both are already there).
 */
export function planCsvImport(input: {
  rows: readonly string[][];
  mapping: CsvMapping;
  accountId: string;
  currency?: string;
  rules: readonly Pick<MerchantRule, 'pattern' | 'cleanName' | 'categoryId' | 'updatedAt'>[];
  existing: readonly Pick<Transaction, 'date' | 'amountCents' | 'rawDescriptor'>[];
}): CsvImportPlan {
  const { rows, mapping, accountId, currency, rules } = input;
  const seen = new Map<string, number>();
  for (const tx of input.existing) seen.set(dedupeKey(tx), (seen.get(dedupeKey(tx)) ?? 0) + 1);

  const plan: CsvImportPlan = { ready: [], duplicates: 0, errors: [] };
  rows.forEach((cells, index) => {
    if (mapping.hasHeader && index === 0) return;
    const row = index + 1;

    const date = parseCsvDate(cells[mapping.dateColumn] ?? '', mapping.dateFormat);
    if (!date) return void plan.errors.push({ row, reason: 'Unreadable date' });

    let amountCents: number | null;
    if (mapping.amountColumn >= 0) {
      amountCents = parseCsvAmount(cells[mapping.amountColumn] ?? '', currency);
      if (amountCents !== null && mapping.invertAmount) amountCents = -amountCents;
    } else {
      const debit = parseCsvAmount(cells[mapping.debitColumn] ?? '', currency);
      const credit = parseCsvAmount(cells[mapping.creditColumn] ?? '', currency);
      amountCents =
        debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (amountCents === null) return void plan.errors.push({ row, reason: 'Unreadable amount' });
    if (amountCents === 0) return void plan.errors.push({ row, reason: 'Zero amount' });

    const rawDescriptor = (cells[mapping.descriptionColumn] ?? '').replace(/\s+/g, ' ').trim();
    const { merchant, categoryId } = resolveMerchant(rawDescriptor, rules);
    const tx: NewRecord<Transaction> = {
      date,
      amountCents,
      accountId,
      categoryId,
      merchant,
      rawDescriptor,
      note: '',
      needsReview: amountCents < 0 && categoryId === null,
    };

    const key = dedupeKey(tx);
    const remaining = seen.get(key) ?? 0;
    if (remaining > 0) {
      seen.set(key, remaining - 1);
      plan.duplicates++;
    } else plan.ready.push(tx);
  });
  return plan;
}
