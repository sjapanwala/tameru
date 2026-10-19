// Receipt scanning: read the photo on the device, pull out the vendor, total,
// card and date, and match them to the user's own accounts and merchants.
// The image is only held in memory while it's read; it's never stored or sent.

import { recognise, type OcrProgress } from '../data/ocr';
import { bestMatch, merchantKey } from '../domain/merchant';
import { RECEIPT_MAX_BYTES, type ReceiptDraft } from '../domain/receipt';
import { parseReceipt } from '../domain/receiptParse';
import type { Account } from '../domain/types';
import type { AppContext } from './context';

export type ReceiptResult =
  | { status: 'read'; draft: ReceiptDraft; account?: Account }
  | { status: 'unreadable' } // no total found: the photo was too blurry/dark, or not a receipt
  | { status: 'too_large' }
  | { status: 'failed' }; // the reader couldn't start (e.g. very old browser)

export async function readReceipt(ctx: AppContext, file: File, onProgress?: OcrProgress): Promise<ReceiptResult> {
  if (file.size > RECEIPT_MAX_BYTES) return { status: 'too_large' };
  let text: string;
  try {
    text = await recognise(file, onProgress);
  } catch {
    return { status: 'failed' };
  }
  const draft = parseReceipt(text, ctx.clock.today());
  if (draft.amountCents === undefined) return { status: 'unreadable' };

  const [accounts, txs] = await Promise.all([ctx.repos.accounts.all(), ctx.repos.transactions.all()]);
  // The card's last four matches an account the user set up with the same digits.
  const live = accounts.filter((a) => !a.archived);
  const byLast4 = draft.last4 ? live.filter((a) => a.face?.last4 === draft.last4) : [];
  const account = byLast4.length === 1 ? byLast4[0] : undefined;

  // Use the user's own spelling of a merchant they've bought from before.
  if (draft.merchant) {
    const seen = [...new Map(txs.filter((t) => t.merchant && t.merchantKey).map((t) => [t.merchantKey!, t.merchant!])).entries()];
    const match = bestMatch(merchantKey(draft.merchant), seen, ([key]) => key);
    if (match) draft.merchant = match.item[1];
  }
  return { status: 'read', draft, ...(account ? { account } : {}) };
}
