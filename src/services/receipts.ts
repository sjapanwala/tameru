// Receipt scanning: read the photo on the device, pull out the vendor, total,
// card and date, and match them to the user's own accounts and merchants.
// The image is only held in memory while it's read; it's never stored or sent.

import { recognise, type OcrProgress } from '../data/ocr';
import { bestMatch, merchantKey } from '../domain/merchant';
import { RECEIPT_MAX_BYTES, type ReceiptDraft } from '../domain/receipt';
import { mergeDrafts, parseReceipt } from '../domain/receiptParse';
import type { Account } from '../domain/types';
import { updateAccount } from './accounts';
import type { AppContext } from './context';

export type ReceiptResult =
  | { status: 'read'; draft: ReceiptDraft; account?: Account }
  | { status: 'unreadable' } // no total found: the photo was too blurry/dark, or not a receipt
  | { status: 'too_large' }
  | { status: 'failed' }; // the reader couldn't start (e.g. very old browser)

/** Every last four a card can show on a receipt: the card's own and its Apple Pay / Google Pay ones. */
export const cardNumbers = (a: Account): string[] => [...(a.face?.last4 ? [a.face.last4] : []), ...(a.face?.deviceLast4 ?? [])];

/** Remember a tap-to-pay number on a card, so its next receipt is matched. */
export async function rememberDeviceNumber(ctx: AppContext, accountId: string, last4: string): Promise<void> {
  const a = await ctx.repos.accounts.get(accountId);
  if (!a || cardNumbers(a).includes(last4)) return;
  await updateAccount(ctx, accountId, { face: { ...a.face, deviceLast4: [...(a.face?.deviceLast4 ?? []), last4] } });
}

export async function readReceipt(ctx: AppContext, file: File, onProgress?: OcrProgress): Promise<ReceiptResult> {
  if (file.size > RECEIPT_MAX_BYTES) return { status: 'too_large' };
  const today = ctx.clock.today();
  let draft: ReceiptDraft;
  try {
    draft = parseReceipt(await recognise(file, onProgress), today);
    // Missed something: look again in sharp black and white (shadows, glare, faded print).
    if (draft.amountCents === undefined || (draft.confidence ?? 0) < 1) {
      const second = parseReceipt(await recognise(file, onProgress, 'sharp'), today);
      draft = mergeDrafts(draft, second);
    }
  } catch {
    return { status: 'failed' };
  }
  if (draft.amountCents === undefined) return { status: 'unreadable' };

  const [accounts, txs] = await Promise.all([ctx.repos.accounts.all(), ctx.repos.transactions.all()]);
  // The card's last four matches an account the user set up with the same digits.
  const live = accounts.filter((a) => !a.archived);
  const byLast4 = draft.last4 ? live.filter((a) => cardNumbers(a).includes(draft.last4!)) : [];
  const account = byLast4.length === 1 ? byLast4[0] : undefined;

  // Use the user's own spelling of a merchant they've bought from before.
  if (draft.merchant) {
    const seen = [...new Map(txs.filter((t) => t.merchant && t.merchantKey).map((t) => [t.merchantKey!, t.merchant!])).entries()];
    const match = bestMatch(merchantKey(draft.merchant), seen, ([key]) => key);
    if (match) draft.merchant = match.item[1];
  }
  return { status: 'read', draft, ...(account ? { account } : {}) };
}
