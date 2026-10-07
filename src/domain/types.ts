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

export type AccountType = 'chequing' | 'savings' | 'cash' | 'investing' | 'credit';

export interface Account extends BaseRecord {
  name: string;
  type: AccountType;
  /**
   * Balance when the account was added. For a credit card this is negative:
   * the amount owed.
   */
  startingBalanceCents: number;
  /** Swatch used wherever the account is shown. */
  color?: string;
  /** Savings: annual interest rate in percent; null when the user doesn't know. */
  interestRatePct?: number | null;
  /** Investing: money put in so far (net contributions, not returns). */
  contributedCents?: number | null;
  // Credit cards (type 'credit') only:
  /** Day of the month the statement closes, 1–31. */
  statementDay?: number | null;
  /** Day of the month payment is due, 1–31. */
  dueDay?: number | null;
  limitCents?: number | null;
  aprPct?: number | null;
  /** Account the card is paid from. */
  payFromAccountId?: string | null;
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
  /** semimonthly: twice a month, on the anchor's day and 15 days from it. */
  freq: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'yearly';
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
  /** Account or card this is charged to (bills) or deposited into (income). */
  accountId?: string | null;
  /** Income that changes month to month; amountCents is a cautious monthly estimate. */
  variable?: boolean;
  /**
   * Stable key for items created by a flow ("bill:rent", "fee:<accountId>"),
   * so saving again updates the same record instead of adding another.
   */
  origin?: string | null;
}

export type GoalKind = 'emergency' | 'debt' | 'trip' | 'purchase' | 'invest' | 'custom';

/** What a goal looked like before an edit. */
export interface GoalRevision {
  at: ISOTimestamp;
  targetCents: number;
  monthlyContributionCents: number;
  targetDate: ISODate | null;
}

export interface Goal extends BaseRecord {
  name: string;
  kind?: GoalKind;
  /** For "pay off a card": the card. */
  linkedAccountId?: string | null;
  /** Earlier versions, oldest first. Appended whenever the numbers change. */
  revisions?: GoalRevision[];
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
  /** What to call the user. Optional, never leaves the device. */
  userName: string;
  /** Where the user is in onboarding (see src/onboarding/machine.ts); null once not in a flow. */
  onboarding: unknown;
  debtStrategy: 'avalanche' | 'snowball';
}

/** Fields the caller supplies when creating a record. */
export type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord>;
