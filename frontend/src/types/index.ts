/* ─── Core domain types ──────────────────────────────────────────────────── */

export type Currency = string; // ISO 4217, e.g. 'AED', 'USD'

export type AccountType = 'credit_card' | 'cash' | 'debit_card';

export type TransactionType = 'expense' | 'income' | 'transfer';

export type TransferDirection = 'out' | 'in';

export interface Account {
  id: string;
  owner: string;
  name: string;
  type: AccountType;
  currency: Currency;
  /** Opening balance in integer minor units */
  opening_balance: number;
  /** Credit limit in minor units — credit_card only */
  credit_limit?: number;
  /** For credit cards: initial utilized amount at account creation (minor units) */
  opening_utilized?: number;
  archived: boolean;
  sort_order: number;
  created: string;
  updated: string;
}

export interface Transaction {
  id: string;
  owner: string;
  /** ISO date string, e.g. '2024-01-15' */
  date: string;
  /** Positive integer in minor units */
  amount: number;
  /** FK to Account.id */
  account: string;
  type: TransactionType;
  /** FK to Category.id — null for transfers */
  category?: string;
  note: string;
  /** FK to Trip.id — null for non-travel */
  trip?: string;
  /** Links two transfer legs together */
  transfer_pair_id?: string;
  /** Direction this leg flows relative to its account */
  transfer_direction?: TransferDirection;
  /** Client-generated UUID for offline idempotency */
  client_id: string;
  /** Soft delete */
  deleted: boolean;
  created: string;
  updated: string;
}

export interface Category {
  id: string;
  owner: string;
  name: string;
  /** CSS custom property name, e.g. '--cat-food' */
  colour: string;
  archived: boolean;
}

export interface Trip {
  id: string;
  owner: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface UserSettings {
  id: string;
  owner: string;
  enabled_currencies: Currency[];
  default_currency: Currency;
  default_account?: string;
  date_format: string;
  number_format: string;
  currency_order?: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  session_id: string;
  ip: string;
  action: AuditAction;
  target_record?: string;
  result: 'success' | 'failure';
}

export type AuditAction =
  | 'sign_in'
  | 'sign_in_failure'
  | 'sign_out'
  | 'mfa_challenge'
  | 'mfa_failure'
  | 'session_create'
  | 'session_revoke'
  | 'password_change'
  | 'mfa_change'
  | 'role_change'
  | 'export'
  | 'import'
  | 'permission_denied'
  | 'record_delete';

/* ─── Balance types ──────────────────────────────────────────────────────── */

export interface AccountBalance {
  account: Account;
  /** Cash/debit: current balance. Credit: utilized amount. All in minor units. */
  balance: number;
  /** Credit only: remaining limit (limit - utilized) */
  remaining?: number;
}

export interface CurrencyGroup {
  currency: Currency;
  credit_cards: AccountBalance[];
  cash: AccountBalance[];
  debit_cards: AccountBalance[];
}

/* ─── Filter types ───────────────────────────────────────────────────────── */

export interface DateRange {
  from: string;
  to: string;
}

export type DatePreset = 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export interface TransactionFilters {
  dateRange?: DateRange;
  datePreset?: DatePreset;
  category?: string;
  account?: string;
  trip?: string;
  search?: string;
}

/* ─── Offline queue ──────────────────────────────────────────────────────── */

export type QueuedAction =
  | { type: 'create'; collection: string; data: Record<string, unknown>; clientId: string }
  | { type: 'update'; collection: string; id: string; data: Record<string, unknown> }
  | { type: 'delete'; collection: string; id: string };

export interface QueuedChange {
  id: string;
  action: QueuedAction;
  timestamp: number;
  retries: number;
}

/* ─── Auth / session types ───────────────────────────────────────────────── */

export interface SessionInfo {
  id: string;
  device: string;
  created: string;
  last_active: string;
  current: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  verified: boolean;
  mfaEnabled: boolean;
  created: string;
  updated: string;
}

/* ─── Sync state ─────────────────────────────────────────────────────────── */

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt?: string;
  error?: string;
}

/* ─── Form types ─────────────────────────────────────────────────────────── */

export interface AddTransactionForm {
  type: TransactionType;
  amount: string;
  currency: Currency;
  account: string;
  category?: string;
  date: string;
  note: string;
  trip?: string;
  isTravel: boolean;
  transferDestinationAccount?: string;
  receivedAmount?: string; // for cross-currency transfers
  exchangeRate?: string;   // rate applied when cross-currency
}
