// RFC 4180 CSV parsing/serialising plus the transaction CSV format.

import { centsToDecimal, parseCents } from './money';
import { isLocalDate } from './dates';
import type { Account, Category, Split, Transaction, TransactionType } from './types';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const esc = (f: string) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f);
export const toCsv = (rows: readonly (readonly string[])[]): string => rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';

export const TX_CSV_HEADER = ['date', 'type', 'amount', 'account', 'to_account', 'category', 'splits', 'merchant', 'note', 'status'];

export function transactionsToCsv(txs: readonly Transaction[], accounts: readonly Account[], categories: readonly Category[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const rows = [...txs]
    .filter((t) => t.status !== 'skipped')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [
      t.date,
      t.type,
      centsToDecimal(t.amountCents),
      acc.get(t.accountId) ?? '',
      t.toAccountId ? (acc.get(t.toAccountId) ?? '') : '',
      t.categoryId ? (cat.get(t.categoryId) ?? '') : '',
      (t.splits ?? []).map((s) => `${cat.get(s.categoryId) ?? ''}:${centsToDecimal(s.amountCents)}`).join('|'),
      t.merchant ?? '',
      t.note ?? '',
      t.status,
    ]);
  return toCsv([TX_CSV_HEADER, ...rows]);
}

export type CsvDraft = Pick<Transaction, 'type' | 'amountCents' | 'date' | 'accountId' | 'status'> &
  Partial<Pick<Transaction, 'toAccountId' | 'categoryId' | 'splits' | 'merchant' | 'note'>>;

export interface CsvImportResult {
  drafts: CsvDraft[];
  skipped: { line: number; reason: string }[];
}

const TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'refund'];

/**
 * Read transactions from CSV. Accepts Tameru's own export, or a simple bank-style
 * file with date, amount (negative = money out) and description/merchant columns.
 * Account and category are matched by name; unknown categories are left blank for review.
 */
export function csvToTransactions(
  text: string,
  accounts: readonly Account[],
  categories: readonly Category[],
  defaultAccountId?: string,
): CsvImportResult {
  const rows = parseCsv(text);
  const out: CsvImportResult = { drafts: [], skipped: [] };
  if (rows.length === 0) return out;
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const ix = {
    date: col('date', 'transaction date', 'posted date'),
    type: col('type'),
    amount: col('amount', 'amt'),
    account: col('account'),
    to: col('to_account'),
    category: col('category'),
    splits: col('splits'),
    merchant: col('merchant', 'description', 'payee', 'name'),
    note: col('note', 'memo'),
    status: col('status'),
  };
  const byName = <T extends { name: string; id: string }>(xs: readonly T[], n: string) =>
    xs.find((x) => x.name.trim().toLowerCase() === n.trim().toLowerCase())?.id;

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    const date = get(ix.date);
    if (!isLocalDate(date)) return out.skipped.push({ line, reason: 'date' });
    const raw = parseCents(get(ix.amount));
    if (raw === null || raw === 0) return out.skipped.push({ line, reason: 'amount' });
    const typeCol = get(ix.type).toLowerCase() as TransactionType;
    const type: TransactionType = TYPES.includes(typeCol) ? typeCol : raw < 0 ? 'expense' : 'income';
    const accountId = (get(ix.account) && byName(accounts, get(ix.account))) || defaultAccountId;
    if (!accountId) return out.skipped.push({ line, reason: 'account' });
    const draft: CsvDraft = { type, amountCents: Math.abs(raw), date, accountId, status: get(ix.status) === 'pending' ? 'pending' : 'posted' };
    if (type === 'transfer') {
      const to = byName(accounts, get(ix.to));
      if (!to) return out.skipped.push({ line, reason: 'to_account' });
      draft.toAccountId = to;
    }
    const catId = get(ix.category) ? byName(categories, get(ix.category)) : undefined;
    if (catId && type !== 'transfer') draft.categoryId = catId;
    if (get(ix.splits)) {
      const splits: Split[] = [];
      for (const part of get(ix.splits).split('|')) {
        const at = part.lastIndexOf(':');
        const cid = byName(categories, part.slice(0, at));
        const amt = parseCents(part.slice(at + 1));
        if (cid && amt) splits.push({ categoryId: cid, amountCents: amt });
      }
      if (splits.reduce((a, s) => a + s.amountCents, 0) === draft.amountCents) draft.splits = splits;
    }
    if (get(ix.merchant)) draft.merchant = get(ix.merchant);
    if (get(ix.note)) draft.note = get(ix.note);
    out.drafts.push(draft);
  });
  return out;
}
