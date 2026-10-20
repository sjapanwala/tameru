// Every user-facing string lives here so tone stays consistent and reviewable.
// Rules: show what's left, no failure language, every negative state offers one way forward,
// forward-looking notices only, positive acknowledgements, no streaks.
// Domain code returns codes and numbers; this file turns them into words.

import { formatCents } from '../domain/money';
import type { Cents, Frequency, PlanReason } from '../domain/types';

const $ = (c: Cents) => formatCents(c);
const dollars = (c: Cents) => `$${Math.round(c / 100).toLocaleString('en-CA')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const weekday = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

export const S = {
  appName: 'Tameru',

  gate: {
    name: 'Tameru',
    tagline: 'A calm budget that lives on your phone.',
    points: [
      ['Know what’s safe to spend', 'One number for today, after bills, goals and a buffer.'],
      ['Private by design', 'No account and no bank login. Everything stays on this device.'],
      ['Works offline', 'Log a coffee on the subway; it’s all there when you’re back.'],
    ] as [string, string][],
    installButton: 'Install Tameru',
    installDescription: 'Add it to your home screen. It opens full screen and works offline.',
    fine: 'Free. Takes a few seconds. Nothing to sign up for.',
  },

  nav: {
    tabs: 'Main',
    home: 'Home',
    activity: 'Activity',
    more: 'More',
    add: 'Add',
    transactions: 'Transactions',
    accounts: 'Accounts',
    recurring: 'Recurring',
    plan: 'Plan',
    forecast: 'Forecast',
    settings: 'Settings',
    debug: 'Debug',
  },

  common: {
    monthlyOn: (d: number) => `Every month on the ${ordinal(d)}`,
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    skip: 'Skip',
    next: 'Next',
    back: 'Back',
    done: 'Done',
    add: 'Add',
    remove: 'Remove',
    confirm: 'Confirm',
    undo: 'Undo',
    loading: 'Loading…',
    none: 'Nothing here yet.',
    optional: '(optional)',
    amount: 'Amount',
    date: 'Date',
    name: 'Name',
    account: 'Account',
    category: 'Category',
    merchant: 'Merchant',
    note: 'Note',
    uncategorised: 'No category',
  },

  freq: {
    weekly: 'Weekly',
    biweekly: 'Every two weeks',
    semimonthly: 'Twice a month',
    monthly: 'Monthly',
    yearly: 'Yearly',
    irregular: 'It varies',
  } satisfies Record<Frequency, string>,

  accountType: { chequing: 'Chequing', savings: 'Savings', credit_card: 'Credit card', investing: 'Investing', cash: 'Cash' },
  behaviour: {
    reset: 'Resets each period',
    rollover: 'Rolls over',
    fund: 'Builds up (fund)',
  },
  txType: { expense: 'Spent', income: 'Income', transfer: 'Transfer', refund: 'Refund' },
  status: { posted: '', pending: 'Pending', skipped: 'Skipped' },

  home: {
    safeToSpend: 'Safe to spend',
    perDay: (c: Cents, days: number) => `${$(c)} a day for ${plural(days, 'day')}`,
    perDayShort: 'a day',
    recent: 'Recent',
    profile: 'Your profile and settings',
    viewAll: 'View all',
    actions: { spent: 'Spent', income: 'Income' },
    today: 'Today',
    yesterday: 'Yesterday',
    daysLeft: (n: number) => `${plural(n, 'day')} left`,
    overShort: (c: Cents) => `${$(c)} over`,
    untilEnd: (d: string) => `until ${shortDate(d)}`,
    showBreakdown: 'Where this comes from',
    breakdown: {
      spendable: 'In chequing and cash',
      cardsOwing: 'Card balances',
      income: 'Pay still coming',
      bills: 'Bills still to come',
      goals: 'Goal contributions left',
      buffer: 'Buffer',
    },
    categories: 'Left this period',
    leftOf: (left: Cents, of: Cents) => `${$(left)} left of ${$(of)}`,
    over: (name: string, c: Cents) => `${$(c)} over in ${name}.`,
    upcoming: 'Coming up this week',
    noUpcoming: 'No bills in the next 7 days.',
    pending: (n: number) => `${plural(n, 'item')} waiting to be confirmed`,
    review: (n: number) => `${plural(n, 'auto-categorised entry', 'auto-categorised entries')} you can check any time`,
    add: 'Add',
  },

  recovery: {
    pause_goal: (goal: string, c: Cents) => `${$(c)} short this period. Pause ${goal} this period to cover it?`,
    move_bill: (bill: string, d: string) => `${bill} on ${shortDate(d)} is the biggest thing still to come. Could it move to after payday?`,
    ease_category: (c: Cents, cat?: string) => `${$(c)} short this period. Easing off ${cat ?? 'flexible spending'} by that much covers it.`,
  },

  cover: {
    title: (name: string, c: Cents) => `${$(c)} over in ${name}. Cover it from:`,
    category: (from: string, c: Cents, all: boolean) => `${from} (${$(c)}${all ? '' : ', part of it'})`,
    fund: (from: string, c: Cents, all: boolean) => `${from} fund (${$(c)}${all ? '' : ', part of it'})`,
    next_period: (c: Cents) => `Next period (${$(c)} less then)`,
    leave: 'Leave it as is',
    applied: 'Covered.',
  },

  quick: {
    title: 'Quick add',
    setUp: 'Set up a quick add',
    hint: 'One tap logs it. Hold (or right-click) to edit.',
    edit: (label: string) => `Edit ${label}`,
    logged: (label: string, c: Cents) => `${label} · ${$(c)} added`,
    undone: 'Removed.',
    icon: 'Icon',
    label: 'Label',
    labelHint: 'e.g. Coffee',
    vendor: 'Vendor',
    vendorHint: 'e.g. Tim Hortons',
    price: 'Price',
    from: 'Pay from',
    ask: 'Ask each time',
    whichAccount: (label: string) => `Pay for ${label} from…`,
    clear: 'Remove',
    errors: {
      amount_invalid: 'Set a price above zero.',
      label_missing: 'Give it a label or a vendor.',
      account_missing: 'Pick an account, or “Ask each time”.',
      slot_invalid: 'That slot isn’t available.',
    } as Record<string, string>,
    icons: {
      coffee: 'Coffee', food: 'Food', groceries: 'Groceries', bag: 'Shopping', car: 'Car', parking: 'Parking',
      fuel: 'Fuel', bus: 'Transit', ticket: 'Tickets', drink: 'Drinks', gym: 'Gym', health: 'Health',
      book: 'Books', gift: 'Gift', laundry: 'Laundry', haircut: 'Haircut',
    } as Record<string, string>,
  },

  receipt: {
    title: 'Receipt',
    preparing: 'Getting the reader ready…',
    reading: 'Reading your receipt…',
    found: 'Found on the receipt',
    noVendor: 'Vendor not found',
    card: 'Card',
    date: 'Date',
    notShown: 'not shown',
    noCardMatch: (last4: string) => `No account ends in ${last4} yet. Add the last four to a card in Accounts and it’ll be picked automatically next time.`,
    add: 'Review and add',
    retake: 'Try another photo',
    enter: 'Enter it manually',
    problem: {
      unreadable: 'Couldn’t make out a total',
      too_large: 'That photo is too large',
      failed: 'The receipt reader couldn’t start',
    } as Record<string, string>,
    problemHint: {
      unreadable: 'Try a flat, well-lit photo with the whole receipt in frame.',
      too_large: 'Try a smaller photo or a screenshot.',
      failed: 'This browser may be too old for it. You can still add it yourself.',
    } as Record<string, string>,
  },

  wallet: {
    open: 'Show all cards',
    close: 'Put cards away',
  },

  cards: {
    institution: 'Bank or institution',
    chooseInstitution: 'Choose…',
    newInstitution: '+ Add a new institution',
    institutionName: 'Institution name',
    institutionHint: 'e.g. Koho',
    addInstitution: 'Add institution',
    card: 'Card',
    chooseCard: 'Choose your card…',
    creditCards: 'Credit cards',
    debitCards: 'Debit cards',
    notListed: 'My card isn’t listed',
    cardName: 'Card name',
    colour: 'Colour',
    bankColour: 'Bank colour',
    customColour: 'Pick any colour',
    last4: 'Last 4 digits (optional)',
    last4Short: 'Card',
  },

  more: {
    colophon: 'Tameru · stays on this device',
    updated: (v: string) => `Updated to v${v}`,
  },

  freshStart: {
    awayTitle: (days: number) => `Welcome back. It’s been ${plural(days, 'day')}.`,
    backlogTitle: (n: number) => `${plural(n, 'entry', 'entries')} could use a look.`,
    body: 'Want a fresh start? We’ll accept the suggested categories, sum up what happened, and restart this period from today’s real balances. Your history stays.',
    accept: 'Fresh start',
    later: 'Not now',
    summary: (n: number, c: Cents, from?: string, to?: string) =>
      n === 0 ? 'All caught up.' : `${plural(n, 'entry', 'entries')} accepted${from && to ? ` from ${shortDate(from)} to ${shortDate(to)}` : ''}, ${$(c)} in spending.`,
  },

  add: {
    title: 'Add',
    amountLabel: 'Amount',
    type: 'Type',
    suggested: (source: string) => (source === 'rule' ? 'from your past choices' : source === 'none' || source === 'default' ? '' : 'suggested'),
    moreOptions: 'Merchant, note, date, split',
    backspace: 'Delete last digit',
    split: 'Split across categories',
    addSplit: 'Add a split',
    saved: (c: Cents) => `Saved ${$(c)}.`,
    toAccount: 'To account',
    goal: 'Counts toward goal',
  },

  transactions: {
    chart: {
      open: 'Show spending breakdown',
      close: 'Hide spending breakdown',
      average: (c: Cents) => `avg ${$(c)}/day`,
      other: 'Other',
      empty: 'No spending in the last two weeks.',
    },
    title: 'Activity',
    search: 'Search',
    filters: { all: 'All', spent: 'Spent', income: 'Income', transfer: 'Transfers' },
    periodSpent: 'Spent this period',
    periodIn: 'Received',
    noMatch: 'Nothing matches that.',
    details: 'Details',
    upload: 'Upload a receipt',
    photo: 'Take a photo of a receipt',
    date: 'Date',
    account: 'Account',
    category: 'Category',
    status: 'Status',
    note: 'Note',
    splitInto: 'Split',
    dayTotal: (spent: Cents, inc: Cents) => [spent ? `${$(spent)} spent` : '', inc ? `${$(inc)} in` : ''].filter(Boolean).join(' · ') || 'No spending',
    recategorise: 'Change category',
    confirm: 'Confirm',
    skip: 'Skip this one',
    split: 'Split',
    review: 'Check category',
    deleted: 'Removed.',
    skipped: 'Skipped.',
    showEarlier: 'Show earlier',
  },

  accounts: {
    title: 'Accounts',
    add: 'Add an account',
    addTitle: 'New account',
    balance: 'Balance',
    remove: 'Remove',
    holdHint: 'Hold a card for options',
    comingUp: 'Coming up',
    days: (n: number) => `${n} days`,
    trendLabel: (n: number) => `Last ${n} days`,
    dueIn: (n: number) => (n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `in ${n} days`),
    tiles: {
      due: 'Payment due',
      statement: 'Statement',
      statementSub: 'next closes',
      creditUsed: 'Credit used',
      perMonth: 'each month',
      thisMonth: 'This month',
      building: 'building up',
      nextInterest: 'Next interest',
      paidIn: 'paid into this account',
      soFar: 'so far',
      in: 'In',
      out: 'Out',
      thisMonthSub: 'this month',
      thisYear: 'This year',
      contributed: 'contributed',
      awaiting: 'waiting to be confirmed',
    },
    menu: { edit: 'Edit Card', rearrange: 'Rearrange Cards', remove: 'Remove Card' },
    rearrangeTitle: 'Rearrange',
    rearrangeHint: 'Drag cards into the order you like.',
    removeTitle: (name: string) => `Remove ${name}?`,
    removeBody: 'It disappears from your accounts and safe-to-spend. Past transactions stay in your history, and any bills or quick adds using it will ask for another account.',
    removeBalance: (c: Cents, owing: boolean) => (owing ? `It still shows ${$(c)} owing.` : `It still holds ${$(c)}.`),
    removeConfirm: 'Remove account',
    keep: 'Keep it',
    removed: (name: string) => `${name} removed`,
    prev: 'Previous account',
    next: 'Next account',
    dayOfMonth: (d: number) => `Day ${d}`,
    interestEarned: 'Interest earned',
    interestBuilding: 'Building this month',
    owing: (c: Cents) => `${$(c)} owing`,
    owingLabel: 'owing',
    inCreditLabel: 'nothing owing',
    contributedLabel: 'contributed',
    inCredit: (c: Cents) => `${$(c)} in credit`,
    fee: (c: Cents) => `${$(c)} monthly fee`,
    netContributed: (c: Cents) => `${$(c)} contributed`,
    interest: (earned: Cents, accrued: Cents) => `${$(earned)} interest earned · ${$(accrued)} building this month`,
    pending: (c: Cents) => `${$(c)} pending`,
    rate: 'Annual rate (%)',
    rateKind: 'Rate type',
    apy: 'APY (most banks show this)',
    apr: 'APR',
    compounding: 'Interest paid',
    compoundingOpt: { daily: 'Daily (paid monthly)', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Yearly' },
    monthlyFee: 'Monthly fee',
    statementDay: 'Next statement date',
    dueDay: 'Next payment due',
    openingBalance: 'Current balance',
    openingOwing: 'Current amount owing',
    transfer: 'Move money',
    from: 'From',
    to: 'To',
  },

  recurring: {
    title: 'Recurring',
    bills: 'Bills and subscriptions',
    income: 'Income',
    add: 'Add a recurring item',
    next: (d?: string) => (d ? `next ${shortDate(d)}` : 'no upcoming date'),
    detected: 'Looks like these repeat',
    detectedLine: (name: string, c: Cents, freq: string, n: number) => `${name}: ${$(c)} ${freq.toLowerCase()}, seen ${plural(n, 'time')}`,
    track: 'Track it',
    notRecurring: 'Not recurring',
    pending: 'Waiting to be confirmed',
    kind: { bill: 'Bill', subscription: 'Subscription', income: 'Income' },
    range: 'It varies (estimate a range)',
    min: 'Low',
    max: 'High',
    nextDate: 'Next date',
    payFrom: 'Paid from (first is the default)',
    howOften: 'How often',
    defaultMark: '(default)',
    stop: 'Stop tracking',
    feeNote: 'Set from the card’s settings',
  },

  plan: {
    title: 'Plan',
    period: (from: string, to: string) => `${shortDate(from)} – ${shortDate(to)}`,
    allocation: 'Planned',
    behaviour: 'When the period ends',
    regenerate: 'Suggest a new plan',
    accept: 'Use this plan',
    adjust: 'Adjust',
    keep: 'Keep my current plan',
    addCategory: 'Add a category',
    goals: 'Goals',
    addGoal: 'Add a goal',
    goalLine: (saved: Cents, target: Cents) => `${$(saved)} saved of ${$(target)}`,
    goalOpen: (saved: Cents) => `${$(saved)} saved`,
    perPeriod: (c: Cents) => `${$(c)} each period`,
    contribute: 'Add money',
    target: 'Target amount',
    targetDate: 'Target date',
    linked: 'Kept in',
    summary: (income: Cents, fixed: Cents, flex: Cents, goals: Cents, free: Cents) =>
      `Income ${$(income)} · bills ${$(fixed)} · everyday ${$(flex)} · goals ${$(goals)} · unassigned ${$(free)}`,
  },

  milestone: (goal: string, m: number) => (m >= 100 ? `${goal} is fully funded. Nicely done.` : `${goal} is ${m}% of the way there.`),

  goalFlag: {
    date_unrealistic: (goal: string, date: string, reachable?: Cents) =>
      `${goal} fits better by ${shortDate(date)}${reachable !== undefined ? `, or aim for ${$(reachable)} by your date` : ''}.`,
    no_room_now: (goal: string) => `There isn’t room for ${goal} right now. It’ll pick up once bills and everyday costs are covered.`,
  },

  forecast: {
    title: 'Forecast',
    horizon: (d: number) => `${d} days`,
    lowest: (name: string, c: Cents, d: string) => `${name} is lowest at ${$(c)} on ${shortDate(d)}.`,
    lowestSpendable: (c: Cents, d: string) => `Spendable money is lowest at ${$(c)} on ${shortDate(d)}.`,
    dips: (name: string, d: string, c: Cents) => `${name} may dip to ${$(c)} on ${shortDate(d)}. Moving money in before then keeps it above zero.`,
    noDips: 'Every account stays above zero.',
    onTrack: (c: Cents) => (c >= 0 ? `On track to save ${$(c)} this period.` : `Heading ${$(-c)} past income this period. Trimming a flexible category closes the gap.`),
    projected: (name: string, c: Cents) => `Projected to spend ${$(c)} in ${name}.`,
    estimate: (c: number, source: string) =>
      `Everyday spending estimated at ${$(Math.round(c))} a day (${({ history: 'from the last 8 weeks', plan: 'from your plan', habits: 'from what you told us', default: 'a starting guess' } as Record<string, string>)[source]}).`,
    date: 'Date',
    spendable: 'Spendable',
  },

  settings: {
    title: 'Settings',
    name: 'Your name (for your initials on Home)',
    period: 'Budget period',
    month: 'Calendar month',
    monthFrom: 'Month starting on day',
    payday: 'From payday to payday',
    buffer: 'Buffer kept aside',
    cards: 'Subtract credit card balances from safe-to-spend',
    autoPost: 'Record recurring items automatically (otherwise they wait for you to confirm)',
    freshDays: 'Offer a fresh start after this many days away',
    freshBacklog: 'Or when this many entries need a look',
    notifications: 'Forward-looking reminders (bills, paydays, low balances)',
    data: 'Your data',
    exportJson: 'Export full backup (JSON)',
    exportCsv: 'Export transactions (CSV)',
    importJson: 'Restore from backup (JSON)',
    importCsv: 'Import transactions (CSV)',
    reset: 'Erase all data on this device',
    resetConfirm: 'Type ERASE to confirm',
  },

  debug: {
    title: 'Debug',
    today: (d: string, pinned: boolean) => `Today is ${weekday(d)}${pinned ? ' (pinned)' : ''}`,
    setToday: 'Pin today to',
    useReal: 'Use the real date',
    jump: (n: number) => `Jump ${plural(n, 'day')}`,
    seed: 'Replace with sample data (student)',
    wipe: 'Wipe all data',
    notices: 'Notices scheduled',
    events: 'Event log',
  },

  onboarding: {
    continue: 'Continue',
    section: {
      income: 'Income',
      accounts: 'Accounts',
      bills: 'Bills',
      habits: 'Spending',
      goals: 'Goals',
      period: 'Your budget',
      review: 'Your plan',
    },
    welcomeTitle: 'Welcome to Tameru',
    welcomeBody: 'A few quick questions and you’ll have a plan that fits. Skip anything you’re unsure of; it can all change later.',
    nameQ: 'Your full name',
    namePlaceholder: 'First and last name',
    start: 'Get started',
    incomeQ: 'How do you get paid?',
    incomeSub: 'Your main income. You can add more after this.',
    howOften: 'How often',
    incomeName: 'Name',
    incomeNamePlaceholder: 'Paycheque',
    defaultIncomeName: 'Pay',
    incomeAmountQ: 'About how much each time',
    incomeVaries: 'The amount varies',
    incomeTo: 'to',
    nextPaydayQ: 'Next payday',
    moreIncomeQ: 'Any other regular income?',
    moreIncomeSub: 'A side job, tutoring, an allowance…',
    noMore: 'That’s everything',
    addAnother: 'Add income',
    add: 'Add',
    accountsQ: 'Which accounts do you use?',
    accountsSub: 'Pick all that apply.',
    accountHint: {
      chequing: 'Everyday spending',
      savings: 'Money set aside',
      credit_card: 'Cards you pay off',
      investing: 'TFSA, RRSP, brokerage',
      cash: 'Cash on hand',
    },
    accountQ: (type: string) => `Your ${type.toLowerCase()} account`,
    accountSub: 'A rough balance is fine.',
    rateQ: 'Interest rate (%)',
    feeQ: 'Monthly fee',
    billsQ: 'Which bills come out every month?',
    billsHint: 'Rent, phone, internet, insurance, subscriptions.',
    billsEmpty: 'Nothing added yet. Tap a suggestion, or add your own.',
    billSuggestions: ['Rent', 'Phone', 'Internet', 'Insurance', 'Spotify', 'Netflix', 'Gym'],
    addBill: 'Add a bill',
    editBill: 'Edit bill',
    billDay: 'Next due date',
    billMeta: (c: Cents, day: number) => `${$(c)} · monthly on the ${ordinal(day)}`,
    habitQ: {
      groceries: 'How much goes on groceries in a week?',
      eating_out: 'And eating out or coffee?',
      transport: 'Getting around: transit, gas, rides?',
      fun: 'Fun and shopping?',
      personal: 'Personal care and health?',
    },
    habitSub: 'A rough guess is fine. It sets your first budget.',
    habitOther: 'Or type an amount a week',
    pickRange: (lo: Cents, hi: Cents) => (lo === 0 ? `Under ${dollars(hi)}` : `${dollars(lo)} – ${dollars(hi)}`),
    goalsQ: 'What are you saving for?',
    goalsHint: 'Up to three. A target and a date are optional.',
    goalsEmpty: 'No goals yet. Tap a suggestion, or add your own.',
    goalSuggestions: ['Emergency fund', 'Trip', 'New laptop', 'Car'],
    goalNamePlaceholder: 'Trip to Japan',
    goalMeta: (c?: Cents, d?: string) => [c ? $(c) : '', d ? `by ${shortDate(d)}` : ''].filter(Boolean).join(' · ') || 'No target yet',
    addGoal: 'Add a goal',
    editGoal: 'Edit goal',
    periodQ: 'How should your budget run?',
    periodMonth: 'Calendar month',
    periodMonthSub: 'From the 1st to the end of each month.',
    periodPayday: 'Payday to payday',
    periodPaydaySub: 'Starts fresh each time you’re paid.',
    reviewTitle: 'Here’s a plan that fits',
    adjustHint: 'Change any number before you start. Everything stays editable later.',
    reviewIncome: 'Planned income each month',
    reviewParts: { fixed: 'Bills', flex: 'Everyday', goals: 'Goals', free: 'Unassigned' },
    accept: 'Start using Tameru',
    regenerate: 'Reset the numbers',
    complete: 'You’re all set. Your plan is ready.',
  },

  notices: {
    bill_soon: (p: Record<string, string | number>) => `${p.name} comes out in ${p.days} days (${$(Number(p.amountCents))}).`,
    card_due_soon: (p: Record<string, string | number>) => `${p.name} payment is due in ${p.days} days. ${$(Number(p.amountCents))} owing.`,
    payday: (p: Record<string, string | number>) => `Payday: ${p.name} should land today.`,
    low_balance_ahead: (p: Record<string, string | number>) =>
      `${p.name} may run ${$(Number(p.amountCents))} short on ${shortDate(String(p.date))}.${p.coverFrom ? ` Moving that from ${p.coverFrom} would cover it.` : ''}`,
    goal_milestone: (p: Record<string, string | number>) => S.milestone(String(p.name), Number(p.milestone)),
  },

  errors: {
    amountNeeded: 'Enter an amount to save this.',
    amountInvalid: 'That amount doesn’t look right. Try something like 12.50.',
    tx: {
      amount_invalid: 'Enter an amount above zero.',
      account_missing: 'Pick an account.',
      transfer_needs_to: 'Pick where the money goes.',
      transfer_same: 'Choose two different accounts.',
      split_mismatch: 'Splits need to add up to the total.',
      investing_transfer_only: 'Investing accounts track money moved in and out. Use “Move money”.',
      date_invalid: 'Pick a date.',
    } as Record<string, string>,
    importInvalid: (why: string) => `This file couldn’t be read: ${why}.`,
  },

  backup: {
    imported: (n: number) => `Restored ${plural(n, 'record')}.`,
    csvImported: (ok: number, skipped: number) => `Imported ${plural(ok, 'transaction')}${skipped ? `. ${plural(skipped, 'row')} left out` : ''}.`,
    wipeConfirm: 'This removes everything on this device. Export a backup first if you want to keep it.',
    wiped: 'All data cleared.',
  },
} as const;

/** Plain-language reasoning for a generated plan number. */
export function reasonText(r: PlanReason): string {
  const p = r.params ?? {};
  const n = (k: string) => Number(p[k] ?? 0);
  switch (r.code) {
    case 'fixed_bills':
      return `Covers your ${plural(n('count'), 'bill')} (${$(n('total'))}).`;
    case 'from_habit':
      return `You said about ${$(n('weekly'))} a week.`;
    case 'default_habit':
      return `A typical ${$(n('weekly'))} a week. Change it if yours is different.`;
    case 'nudged_for_goals':
      return `Trimmed ${n('percent')}% to help your goals along.`;
    case 'trimmed_for_goals':
      return `Trimmed ${n('percent')}% so your goals fit.`;
    case 'at_floor':
      return `Kept at ${n('percent')}% of your usual, so it stays realistic.`;
    case 'income_tight':
      return 'Income is tight right now, so what there is goes to everyday costs first.';
    case 'surplus_to_fund':
      return `${n('percent')}% of what’s left, for the irregular things (gifts, repairs, renewals).`;
    case 'fund_no_room':
      return 'Nothing spare this time. It fills up once there’s room.';
    case 'goal_needed':
      return `${$(n('remaining'))} to go over ${plural(n('months'), 'month')}.`;
    case 'goal_one_year':
      return `No date set, so this gets there in about a year.`;
    case 'goal_open':
      return 'No target set: it takes a share of what’s left.';
    case 'goal_reached':
      return 'Already there.';
    case 'goal_capped':
      return `It would need ${$(n('needed'))} a month; ${$(n('given'))} fits right now.`;
    case 'surplus_to_goal':
      return `Plus ${$(n('extra'))} from money left over.`;
    default:
      return '';
  }
}

/** Words the product never uses (checked by a test). */
export const BANNED_WORDS = ['exceed', 'failed', 'failure', 'warning', 'bad', 'overspent', 'missed', 'behind', 'late', 'streak', 'penalty', 'guilt', 'overdue'];

export const money = $;
export const pluralise = plural;
export const fmtDate = shortDate;
export const fmtWeekday = weekday;
