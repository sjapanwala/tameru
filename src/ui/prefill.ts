// Hands a draft to the Add sheet (e.g. from a scanned receipt). Kept in memory,
// not the URL, so amounts and vendors never end up in the address bar or history.

import type { Cents, Id, LocalDate } from '../domain/types';

export interface AddPrefill {
  amountCents?: Cents;
  merchant?: string;
  date?: LocalDate;
  accountId?: Id;
  note?: string;
}

let pending: AddPrefill | null = null;

export const setAddPrefill = (p: AddPrefill) => {
  pending = p;
};

/** Read once: the next Add sheet takes it. */
export function takeAddPrefill(): AddPrefill | null {
  const p = pending;
  pending = null;
  return p;
}
