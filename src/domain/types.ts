/** Local calendar date, `YYYY-MM-DD`. No timezone. */
export type ISODate = string;
/** ISO 8601 UTC timestamp. */
export type ISOTimestamp = string;

/** Fields every stored record carries. Soft delete keeps future sync possible. */
export interface BaseRecord {
  id: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

export type AccountType = 'chequing' | 'savings' | 'credit' | 'cash';

export interface Account extends BaseRecord {
  name: string;
  type: AccountType;
  startingBalanceCents: number;
}

export interface Category extends BaseRecord {
  name: string;
  sortOrder: number;
}

export interface Transaction extends BaseRecord {
  date: ISODate;
  /** Signed minor units: negative = expense, positive = income. */
  amountCents: number;
  accountId: string;
  categoryId: string | null;
  /** Cleaned display name. */
  merchant: string;
  /** What was originally typed or imported, before cleanup. */
  rawDescriptor: string;
  note: string;
  needsReview: boolean;
  /**
   * Set when this transaction pays (or receives) one occurrence of a
   * recurring item. Such transactions are not "variable spend".
   */
  recurringId?: string | null;
  recurringDate?: ISODate | null;
}

export interface MerchantRule extends BaseRecord {
  /** A `merchantKey`; see domain/merchant.ts for matching semantics. */
  pattern: string;
  cleanName: string;
  categoryId: string;
}

export interface Budget extends BaseRecord {
  categoryId: string;
  monthlyCents: number;
}

export interface Schedule {
  freq: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  /** A date the item is known to fall on; occurrences repeat from here. */
  anchorDate: ISODate;
}

export interface Recurring extends BaseRecord {
  name: string;
  /** Positive magnitude; `kind` gives the direction. */
  amountCents: number;
  schedule: Schedule;
  kind: 'bill' | 'income';
  categoryId: string | null;
}

export interface Goal extends BaseRecord {
  name: string;
  targetCents: number;
  savedCents: number;
  monthlyContributionCents: number;
  targetDate: ISODate | null;
}

/** How the columns of one bank's CSV export map onto transactions. */
export interface CsvMapping {
  hasHeader: boolean;
  dateColumn: number;
  dateFormat: 'YMD' | 'MDY' | 'DMY';
  descriptionColumn: number;
  /** Single signed amount column, or -1 when using debit/credit columns. */
  amountColumn: number;
  debitColumn: number;
  creditColumn: number;
  /** Flip the sign of the amount column (cards that list purchases as positive). */
  invertAmount: boolean;
}

export interface ImportProfile extends BaseRecord {
  name: string;
  /** Identifies the file layout; see csvSignature. */
  signature: string;
  mapping: CsvMapping;
}

export interface Setting extends BaseRecord {
  key: string;
  value: unknown;
}

/** Settings rows assembled into one object, with defaults applied. */
export interface AppSettings {
  currency: string;
  onboardedAt: ISOTimestamp | null;
  defaultAccountId: string | null;
}

/** Fields the caller supplies when creating a record. */
export type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord>;
