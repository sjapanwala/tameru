// Core entity types. Money is always integer cents; day-level dates are LocalDate strings.

import type { OnboardingState } from './onboarding';

export type LocalDate = string; // 'YYYY-MM-DD', a calendar day with no timezone
export type Cents = number; // integer minor units
export type Id = string;

export interface BaseRecord {
  id: Id;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string;
}

// ---------- Accounts ----------

// 'other': anything else that holds money (PayPal, a gift card, a prepaid card). It isn't
// counted as spendable, so safe-to-spend never leans on money that may be hard to use.
export type AccountType = 'chequing' | 'savings' | 'credit_card' | 'investing' | 'cash' | 'other';
export type Compounding = 'daily' | 'monthly' | 'quarterly' | 'annually';

export interface InterestConfig {
  rateBps: number; // annual rate in basis points: 425 = 4.25%
  kind: 'apy' | 'apr';
  compounding: Compounding; // also the posting frequency
}

export interface CardConfig {
  monthlyFeeCents: Cents; // 0 = no fee
  statementDay: number; // 1–31
  dueDay: number; // 1–31
  limitCents?: Cents;
  aprBps?: number; // purchase interest rate, basis points: 2099 = 20.99%
  statements?: CardStatement[]; // from the user's bank statements, any order
}

/** One statement as the bank showed it. Owing is positive. History only: never moves the balance. */
export interface CardStatement {
  closingDate: LocalDate;
  balanceCents: Cents;
  minimumCents?: Cents;
  paidCents?: Cents; // what the user paid toward it
}

export interface Account extends BaseRecord {
  name: string;
  type: AccountType;
  currency: string; // ISO 4217, default CAD
  // Asset-signed: a card that starts with $200 owing has openingBalanceCents = -20000.
  openingBalanceCents: Cents;
  openingDate: LocalDate;
  archived: boolean;
  interest?: InterestConfig; // savings only
  card?: CardConfig; // credit_card only
  holdings?: Holding[]; // investing only: what's held, for the experimental market prices
  face?: CardFace; // how the account's card looks (credit or debit)
  sortOrder?: number; // user's order (wallet, carousel, pickers); unset until they reorder
}

/**
 * Card appearance. Display only; never used in any calculation.
 * - artId: a card from the bundled art catalog (its image is the face)
 * - institutionId without artId: drawn in the institution's colour with its badge
 * - cardName / color: the user's own card when it isn't in the catalog
 */
export interface CardFace {
  artId?: string;
  institutionId?: string; // catalog bank folder, or "custom/<slug>"
  cardName?: string;
  color?: string; // #rrggbb, overrides the institution colour
  last4?: string; // shown as •••• 1234; never the full number
  // Apple Pay / Google Pay pay with a device account number (DAN), so a receipt shows
  // its last four instead of the card's. One per phone or watch.
  deviceLast4?: string[];
}

/** An institution the user created because it isn't in the catalog. */
export interface CustomInstitution {
  id: string; // "custom/<slug>"
  name: string;
  color: string; // #rrggbb
}

// ---------- Recurring ----------

export type Schedule =
  | { freq: 'weekly'; anchor: LocalDate }
  | { freq: 'biweekly'; anchor: LocalDate }
  | { freq: 'semimonthly'; days: [number, number] }
  | { freq: 'monthly'; day: number } // 29–31 clamp to the last day of short months
  | { freq: 'yearly'; month: number; day: number }
  | { freq: 'irregular' };

export type Frequency = Schedule['freq'];

export type RecurringAmount = { fixedCents: Cents } | { minCents: Cents; maxCents: Cents };

export type RecurringKind = 'bill' | 'subscription' | 'income';

export interface RecurringItem extends BaseRecord {
  name: string;
  kind: RecurringKind;
  amount: RecurringAmount;
  schedule: Schedule;
  startDate: LocalDate; // no occurrences before this
  endDate?: LocalDate; // inclusive
  categoryId: Id;
  accountIds: Id[]; // accounts/cards this can be paid from or deposited to
  defaultAccountId: Id;
  autoPost: boolean | null; // null = follow settings.autoPostRecurring
  // Estimated monthly amount for 'irregular' income, used by forecasts only.
  irregularMonthlyCents?: Cents;
  merchant?: string;
  system?: { kind: 'card_fee'; accountId: Id };
  archived: boolean;
}

/** IncomeSource is a RecurringItem of kind 'income'; one engine handles both. */
export type IncomeSource = RecurringItem & { kind: 'income' };

// ---------- Transactions ----------

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund';
// 'skipped' keeps a generated occurrence's originKey so it is never regenerated, but it counts for nothing.
export type TransactionStatus = 'posted' | 'pending' | 'skipped';

export interface Split {
  categoryId: Id;
  amountCents: Cents; // positive; splits sum to the transaction amount
}

export interface Transaction extends BaseRecord {
  type: TransactionType;
  amountCents: Cents; // positive magnitude; direction comes from type
  date: LocalDate;
  accountId: Id; // source account for transfers
  toAccountId?: Id; // transfers only
  categoryId?: Id; // absent for transfers
  splits?: Split[];
  merchant?: string;
  merchantKey?: string;
  note?: string;
  status: TransactionStatus;
  needsReview: boolean; // auto-categorised and not yet confirmed
  // Unique key for generated transactions, so generation is idempotent:
  // 'rec:<recurringId>:<date>' or 'int:<accountId>:<date>'.
  originKey?: string;
  recurringId?: Id;
  goalId?: Id; // transfers that count toward a goal
  enteredAt?: string; // ISO timestamp of manual entry (for time-of-day suggestions)
}

// ---------- Categories & plan ----------

export type CategoryGroup = 'essentials' | 'lifestyle' | 'savings' | 'system';
export type BudgetBehaviour = 'reset' | 'rollover' | 'fund';

export interface Category extends BaseRecord {
  name: string;
  group: CategoryGroup;
  behaviour: BudgetBehaviour;
  isBuffer: boolean;
  sortOrder: number;
  archived: boolean;
  systemKey?: 'income' | 'interest' | 'transfer' | 'fees';
  color?: string; // #rrggbb for the Plan dial; assigned on creation, changeable
}

export type PeriodConfig =
  | { kind: 'monthly'; startDay: number } // 1–28
  | { kind: 'payday'; recurringId: Id };

export interface Plan extends BaseRecord {
  period: PeriodConfig;
  startDate: LocalDate; // first day budgets are tracked from
  templateAllocations: Record<Id, Cents>; // categoryId → per-period amount
  goalContributions: Record<Id, Cents>; // goalId → per-period amount
  reasons?: Record<string, PlanReason[]>; // from the generator, keyed by categoryId/goalId
}

export interface PlanReason {
  code: string;
  params?: Record<string, string | number>;
}

/** Per-period allocation; overrides the plan template for that period. */
export interface Allocation extends BaseRecord {
  periodStart: LocalDate;
  categoryId: Id;
  amountCents: Cents;
}

/** Money moved to cover an overspend. from 'next_period' borrows from the next allocation. */
export interface BudgetMove extends BaseRecord {
  periodStart: LocalDate;
  fromCategoryId: Id | 'next_period';
  toCategoryId: Id;
  amountCents: Cents;
}

/** A fresh start restarts budgeting part-way through a period. */
export interface PeriodSegment extends BaseRecord {
  periodStart: LocalDate;
  segmentStart: LocalDate;
}

// ---------- Goals ----------

export interface Goal extends BaseRecord {
  name: string;
  targetCents: Cents;
  targetDate?: LocalDate;
  accountId?: Id;
  startingProgressCents: Cents;
  archived: boolean;
}

// ---------- Learning ----------

export interface MerchantRule extends BaseRecord {
  merchantKey: string;
  categoryId: Id;
  confirmations: number;
  pendingCategoryId?: Id;
  pendingCount: number;
}

// ---------- History ----------

export type EventType =
  | 'plan_changed'
  | 'goal_changed'
  | 'fresh_start'
  | 'onboarding_complete'
  | 'period_closed'
  | 'data_imported';

export interface EventLogEntry {
  id: Id;
  at: string;
  date: LocalDate;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface PeriodSnapshot extends BaseRecord {
  periodStart: LocalDate;
  periodEnd: LocalDate;
  perCategory: Record<Id, { allocatedCents: Cents; spentCents: Cents; remainingCents: Cents }>;
}

// ---------- Quick transactions ----------

/** A one-tap preset for something bought often but not on a schedule (coffee, parking). */
export interface QuickAction extends BaseRecord {
  slot: number; // position on Home, 0-based
  type?: 'expense' | 'income'; // absent = expense (older presets)
  label: string;
  icon: string; // key into the app's icon set
  amountCents: Cents;
  categoryId?: Id;
  merchant?: string;
  accountId: Id | 'ask'; // 'ask' = choose the account each time
}

// ---------- Settings ----------

export interface Settings {
  id: 'settings';
  autoPostRecurring: boolean;
  subtractCardBalances: boolean;
  bufferCents: Cents;
  freshStartDays: number;
  freshStartBacklog: number;
  lastOpenedDate?: LocalDate;
  onboardedAt?: string;
  debugToday?: LocalDate;
  defaultCurrency: string;
  // Rough weekly spending per category from onboarding; seeds forecasts with no history.
  habitWeeklyCents?: Record<Id, Cents>;
  dismissedDetections: string[]; // merchantKeys the user declined
  onboarding?: OnboardingState; // in-progress answers, so quitting resumes on the same question
  userName?: string;
  customInstitutions?: CustomInstitution[]; // optional, only used for the initials avatar
  notificationsEnabled: boolean;
  sentNoticeIds: string[]; // most recent first, capped
  attentionSeen?: string[]; // what needed attention when Upcoming was last opened (Home's bell dot)
  // "periodStart|categoryId" → overspend the user already dealt with (covered part, or left as is).
  // The cover prompt only returns if that category goes further over.
  coversHandled?: Record<string, Cents>;
  lock?: AppLock; // absent = no passcode
  theme?: ThemeId; // absent = blue
  tourPending?: boolean; // show the app tour on the next Home: after onboarding, or "Take a tour"
  markets?: MarketSettings; // experimental: daily closing prices for investing holdings
}

/** One position in an investing account. Shares can be fractional. */
export interface Holding {
  symbol: string; // Yahoo's form: XEQT.TO for the TSX, AAPL for US
  shares: number;
  avgCostCents?: Cents; // entry price per share, in the holding's currency
  costCadCents?: Cents; // what it cost in all, in CAD (a broker's book value); wins over avgCostCents
  name?: string; // the security's name, from a broker's file
  currency: 'CAD' | 'USD';
}

/** A day's closing price. Cents may be fractional (sub-cent prices). */
export interface Quote {
  symbol: string;
  priceCents: number;
  prevCloseCents: number;
  tradingDay: LocalDate;
  closeKey: LocalDate; // the market close this fetch covered (see lastCloseKey)
  name?: string; // the security's short name, as Yahoo gives it
  from?: 'file' | 'entry'; // not a fetched close: a broker file's price, or the entry price standing in until the close
  at?: number; // ms: a price taken during the day by a refresh, not a close (when it last traded)
}

export interface MarketSettings {
  enabled: boolean;
  quotes?: Record<string, Quote>;
  usdCad?: { rate: number; closeKey: LocalDate };
  lastError?: 'network' | 'service';
  unknown?: string[]; // symbols Yahoo had no price for
  usage?: { day: LocalDate; count: number }; // lookups made on a UTC day, to stay under the free 25
  refreshes?: { day: LocalDate; count: number }; // refreshes asked for by hand on a local day (see REFRESHES_PER_DAY)
}

/** Accent colours over one neutral light and dark base. */
export const THEME_IDS = ['blue', 'green', 'orange'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** The optional app lock. Only a salted hash of the passcode is kept. */
export interface AppLock {
  digits: 4 | 6;
  salt: string;
  hash: string;
  passkeyId?: string; // base64url credential id, when Face ID / Touch ID unlock is on
  relockAfterMs: number; // lock again after the app has been away this long
}
