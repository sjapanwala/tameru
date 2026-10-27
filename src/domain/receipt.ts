// What reading a receipt produces (see receiptParse.ts). Every field is optional
// because a photo may be partly unreadable.

import type { CardNetwork } from './cardCatalog';
import type { Cents, LocalDate } from './types';

export interface ReceiptDraft {
  amountCents?: Cents; // total paid
  merchant?: string;
  date?: LocalDate;
  last4?: string; // card used, as printed (masked) on the receipt
  network?: CardNetwork;
  wallet?: 'apple_pay' | 'google_pay' | 'device'; // paid by phone/watch: last4 is a device number
  confidence?: number; // 0..1: share of the main fields that were found
}

export const RECEIPT_TYPES = 'image/*'; // the on-device reader works on images (photos, screenshots)
export const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;
