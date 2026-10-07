import { describe, expect, it } from 'vitest';
import {
  columnNames,
  csvSignature,
  detectHeader,
  guessMapping,
  parseCsv,
  parseCsvAmount,
  parseCsvDate,
  planCsvImport,
} from './csv';
import {
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
  WrongPassphraseError,
  type EncryptedEnvelope,
} from './encryptedBackup';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines', () => {
    const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","line1\nline2"\n\n1,2,3\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
      ['1', '2', '3'],
    ]);
  });

  it('detects semicolon and tab delimiters and strips a BOM', () => {
    expect(parseCsv('﻿Date;Amount\n2026-10-01;-4,50')).toEqual([
      ['Date', 'Amount'],
      ['2026-10-01', '-4,50'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseCsvDate', () => {
  it.each([
    ['2026-10-07', 'YMD', '2026-10-07'],
    ['2026/10/07 14:02', 'YMD', '2026-10-07'],
    ['10/07/2026', 'MDY', '2026-10-07'],
    ['07/10/2026', 'DMY', '2026-10-07'],
    ['7.10.26', 'DMY', '2026-10-07'],
    ['20261007', 'YMD', '2026-10-07'],
    ['Oct 7, 2026', 'MDY', '2026-10-07'],
  ] as const)('%s (%s)', (value, format, expected) => {
    expect(parseCsvDate(value, format)).toBe(expected);
  });

  it('rejects impossible or missing dates', () => {
    expect(parseCsvDate('13/40/2026', 'MDY')).toBeNull();
    expect(parseCsvDate('', 'YMD')).toBeNull();
    expect(parseCsvDate('pending', 'YMD')).toBeNull();
  });
});

describe('parseCsvAmount', () => {
  it.each([
    ['-4.50', -450],
    ['$1,234.56', 123456],
    ['(12.00)', -1200],
    ['12.00-', -1200],
    ['45.10 CR', 4510],
    ['45.10 DR', -4510],
  ])('%s -> %i', (value, cents) => {
    expect(parseCsvAmount(value)).toBe(cents);
  });

  it('rejects blanks and text', () => {
    expect(parseCsvAmount('')).toBeNull();
    expect(parseCsvAmount('n/a')).toBeNull();
  });
});

const BANK = parseCsv(`Date,Description,Amount,Balance
10/01/2026,SQ *JOES COFFEE 4412,-4.75,1000.00
10/02/2026,PAYROLL DEPOSIT ACME,2150.00,3150.00
10/13/2026,COSTCO WHOLESALE W1234,-182.34,2967.66`);

const CARD = parseCsv(`Transaction Date,Details,Debit,Credit
2026-10-01,TIM HORTONS #1234 TORONTO ON,3.20,
2026-10-05,PAYMENT - THANK YOU,,250.00`);

const HEADERLESS = parseCsv(`07/10/2026,"LOBLAWS 1042",-54.20
25/10/2026,"TTC PRESTO RELOAD",-20.00`);

describe('guessMapping', () => {
  it('reads a single-amount layout from its header', () => {
    expect(detectHeader(BANK)).toBe(true);
    expect(guessMapping(BANK)).toEqual({
      hasHeader: true,
      dateColumn: 0,
      dateFormat: 'MDY',
      descriptionColumn: 1,
      amountColumn: 2,
      debitColumn: -1,
      creditColumn: -1,
      invertAmount: false,
    });
  });

  it('reads a debit/credit layout', () => {
    expect(guessMapping(CARD)).toMatchObject({
      dateFormat: 'YMD',
      descriptionColumn: 1,
      amountColumn: -1,
      debitColumn: 2,
      creditColumn: 3,
    });
  });

  it('falls back to cell contents without a header', () => {
    expect(detectHeader(HEADERLESS)).toBe(false);
    expect(guessMapping(HEADERLESS)).toMatchObject({
      hasHeader: false,
      dateColumn: 0,
      dateFormat: 'DMY',
      descriptionColumn: 1,
      amountColumn: 2,
    });
    expect(columnNames(HEADERLESS, false)).toEqual(['Column 1', 'Column 2', 'Column 3']);
  });

  it('gives each layout a stable signature', () => {
    expect(csvSignature(BANK, true)).toBe('h:date|description|amount|balance');
    expect(csvSignature(HEADERLESS, false)).toBe('n:3');
  });
});

describe('planCsvImport', () => {
  const rules = [
    { pattern: 'joes coffee', cleanName: "Joe's Coffee", categoryId: 'dining', updatedAt: 't' },
  ];
  const plan = (over: Partial<Parameters<typeof planCsvImport>[0]> = {}) =>
    planCsvImport({
      rows: BANK,
      mapping: guessMapping(BANK),
      accountId: 'acc',
      rules,
      existing: [],
      ...over,
    });

  it('cleans merchants, applies rules and flags uncategorised spend', () => {
    const { ready, duplicates, errors } = plan();
    expect(duplicates).toBe(0);
    expect(errors).toEqual([]);
    expect(ready).toEqual([
      {
        date: '2026-10-01',
        amountCents: -475,
        accountId: 'acc',
        categoryId: 'dining',
        merchant: "Joe's Coffee",
        rawDescriptor: 'SQ *JOES COFFEE 4412',
        note: '',
        needsReview: false,
      },
      expect.objectContaining({
        merchant: 'Payroll Deposit Acme',
        amountCents: 215000,
        needsReview: false,
      }),
      expect.objectContaining({
        merchant: 'Costco Wholesale',
        amountCents: -18234,
        needsReview: true,
      }),
    ]);
  });

  it('turns debit/credit columns into signed amounts', () => {
    const { ready } = plan({ rows: CARD, mapping: guessMapping(CARD) });
    expect(ready.map((t) => [t.merchant, t.amountCents])).toEqual([
      ['Tim Hortons', -320],
      ['Payment - Thank You', 25000],
    ]);
  });

  it('inverts the sign for cards that list purchases as positive', () => {
    const { ready } = plan({ mapping: { ...guessMapping(BANK), invertAmount: true } });
    expect(ready[0]?.amountCents).toBe(475);
  });

  it('skips rows that already exist, counting copies', () => {
    const twice = [...BANK, BANK[1]!];
    const existing = [
      { date: '2026-10-01', amountCents: -475, rawDescriptor: 'sq *joes coffee 4412' },
    ];
    const result = plan({ rows: twice, existing });
    expect(result.duplicates).toBe(1);
    expect(result.ready).toHaveLength(3);
    expect(result.ready.filter((t) => t.merchant === "Joe's Coffee")).toHaveLength(1);
  });

  it('is idempotent: importing the same file twice adds nothing', () => {
    const first = plan();
    expect(plan({ existing: first.ready }).ready).toEqual([]);
  });

  it('reports unreadable rows without failing the rest', () => {
    const rows = [...BANK, ['pending', 'HOLD', '-1.00', ''], ['10/20/2026', 'FEE', 'n/a', '']];
    const result = plan({ rows });
    expect(result.ready).toHaveLength(3);
    expect(result.errors).toEqual([
      { row: 5, reason: 'Unreadable date' },
      { row: 6, reason: 'Unreadable amount' },
    ]);
  });
});

describe('encrypted backup', () => {
  const secret = JSON.stringify({ app: 'tameru', data: { note: 'café ☕ $4.75' } });
  const FAST = 1_000; // keep tests quick; production uses PBKDF2_ITERATIONS

  it('round-trips with the right passphrase', async () => {
    const text = await encryptBackup(secret, 'correct horse battery', FAST);
    const envelope = JSON.parse(text) as EncryptedEnvelope;
    expect(isEncryptedBackup(envelope)).toBe(true);
    expect(text).not.toContain('café');
    expect(await decryptBackup(envelope, 'correct horse battery')).toBe(secret);
  });

  it('rejects a wrong passphrase', async () => {
    const envelope = JSON.parse(
      await encryptBackup(secret, 'right one', FAST),
    ) as EncryptedEnvelope;
    await expect(decryptBackup(envelope, 'wrong one')).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('rejects tampered ciphertext', async () => {
    const envelope = JSON.parse(
      await encryptBackup(secret, 'pass phrase', FAST),
    ) as EncryptedEnvelope;
    const flipped = envelope.data.startsWith('A') ? 'B' : 'A';
    await expect(
      decryptBackup({ ...envelope, data: flipped + envelope.data.slice(1) }, 'pass phrase'),
    ).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('uses a fresh salt and IV every time', async () => {
    const a = JSON.parse(await encryptBackup(secret, 'p', FAST)) as EncryptedEnvelope;
    const b = JSON.parse(await encryptBackup(secret, 'p', FAST)) as EncryptedEnvelope;
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('defaults to a strong iteration count and recognises only its own envelopes', async () => {
    const envelope = JSON.parse(await encryptBackup('{}', 'p')) as EncryptedEnvelope;
    expect(envelope.kdf.iterations).toBe(600_000);
    expect(isEncryptedBackup({ app: 'tameru' })).toBe(false);
    expect(isEncryptedBackup(null)).toBe(false);
  });
});
