import type { AppSettings } from './types';

export const DEFAULT_CURRENCY = 'CAD';

export const DEFAULT_CATEGORIES = ['Groceries', 'Dining out', 'Transport', 'Fun', 'Health'];

export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'CAD', label: 'Canadian dollar' },
  { code: 'USD', label: 'US dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British pound' },
  { code: 'AUD', label: 'Australian dollar' },
  { code: 'NZD', label: 'New Zealand dollar' },
  { code: 'JPY', label: 'Japanese yen' },
  { code: 'INR', label: 'Indian rupee' },
  { code: 'MXN', label: 'Mexican peso' },
  { code: 'CHF', label: 'Swiss franc' },
];

export const DEFAULT_SETTINGS: AppSettings = {
  currency: DEFAULT_CURRENCY,
  onboardedAt: null,
  defaultAccountId: null,
};
