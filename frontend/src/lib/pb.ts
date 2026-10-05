import PocketBase, { type RecordModel, type RecordService } from 'pocketbase'
import type { Account, Transaction, Category, Trip, UserSettings, AuditLogEntry } from '@/types'

/**
 * PocketBase client configuration.
 *
 * The session token is kept in memory only (authStore uses a custom store
 * that does NOT persist to localStorage). On page reload, the token is
 * re-fetched via a secure HttpOnly cookie set by the custom auth endpoint
 * implemented in pocketbase/pb_hooks/auth.pb.js.
 *
 * This prevents XSS from stealing tokens out of localStorage/sessionStorage.
 */

class MemoryAuthStore {
  private _token = ''
  private _model: RecordModel | null = null
  private _onChange: ((token: string, model: RecordModel | null) => void)[] = []

  get token() { return this._token }
  get model() { return this._model }
  get isValid() {
    if (!this._token) return false
    try {
      const payload = JSON.parse(atob(this._token.split('.')[1]))
      return payload.exp * 1000 > Date.now()
    } catch {
      return false
    }
  }

  save(token: string, model: RecordModel | null) {
    this._token = token
    this._model = model
    this._onChange.forEach((fn) => fn(token, model))
  }

  clear() {
    this._token = ''
    this._model = null
    this._onChange.forEach((fn) => fn('', null))
  }

  onChange(fn: (token: string, model: RecordModel | null) => void) {
    this._onChange.push(fn)
    return () => {
      this._onChange = this._onChange.filter((f) => f !== fn)
    }
  }

  exportToCookie() { /* no-op — we never persist the token to browser storage */ }
  loadFromCookie() { /* no-op */ }
}

const authStore = new MemoryAuthStore()

export const pb = new PocketBase(
  import.meta.env.VITE_PB_URL ?? '/api',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authStore as any,
)

// Always attach CSRF header for state-changing requests
pb.beforeSend = (url, options) => {
  const method = (options.method ?? 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    options.headers = {
      ...options.headers,
      'X-CF-App-Request': '1', // custom header CSRF check
    }
  }
  return { url, options }
}

/* ─── Typed collection accessors ─────────────────────────────────────────── */

export const accounts = pb.collection('accounts') as RecordService<Account & RecordModel>
export const transactions = pb.collection('transactions') as RecordService<Transaction & RecordModel>
export const categories = pb.collection('categories') as RecordService<Category & RecordModel>
export const trips = pb.collection('trips') as RecordService<Trip & RecordModel>
export const settings = pb.collection('settings') as RecordService<UserSettings & RecordModel>
export const auditLog = pb.collection('audit_log') as RecordService<AuditLogEntry & RecordModel>

/* ─── Auth helpers ───────────────────────────────────────────────────────── */

/** Sign in via the custom cookie-setting endpoint */
export async function signIn(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/sign-in', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CF-App-Request': '1',
    },
    credentials: 'include', // send/receive HttpOnly cookie
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? 'Sign in failed')
  }

  const { token, user } = await res.json()
  // Store in-memory only — never in localStorage
  authStore.save(token, user)
}

/** Refresh the in-memory token using the HttpOnly session cookie */
export async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'X-CF-App-Request': '1' },
      credentials: 'include',
    })
    if (!res.ok) return false
    const { token, user } = await res.json()
    authStore.save(token, user)
    return true
  } catch {
    return false
  }
}

/** Sign out — clears cookie and in-memory token */
export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'X-CF-App-Request': '1' },
      credentials: 'include',
    })
  } finally {
    authStore.clear()
  }
}

/** Verify re-authentication within the last 5 minutes for sensitive actions */
export async function requireRecentAuth(): Promise<boolean> {
  const res = await fetch('/api/auth/reauth-check', {
    headers: { 'X-CF-App-Request': '1' },
    credentials: 'include',
  })
  return res.ok
}

export function currentUser() {
  return authStore.model
}

export function isAuthenticated(): boolean {
  return authStore.isValid
}

export function onAuthChange(fn: (token: string, model: RecordModel | null) => void) {
  return authStore.onChange(fn)
}
