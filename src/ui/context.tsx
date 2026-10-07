import { createContext, useContext } from 'react';
import type { Account, AppSettings, Category, Transaction } from '../domain/types';

export interface ToastInput {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  /** Stay until dismissed or acted on (default: auto-dismiss). */
  sticky?: boolean;
}

export interface AppContextValue {
  settings: AppSettings;
  accounts: Account[];
  categories: Category[];
  openAdd(): void;
  openEdit(tx: Transaction): void;
  showToast(toast: ToastInput): void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside the app shell');
  return value;
}
