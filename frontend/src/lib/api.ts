/**
 * API client for the Hono + PostgreSQL backend.
 * Drop-in replacement for pb.ts — same exports, same interface shapes.
 *
 * Token is kept in memory only (never localStorage).
 * HttpOnly cookie is set server-side for session restore on reload.
 */

import type { RecordModel } from 'pocketbase'
import type { AuthUser } from '@/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api'

// ── In-memory auth store ──────────────────────────────────────────────────

type AuthListener = (token: string, model: AuthUser | null) => void

class AuthStore {
  private _token = ''
  private _model: AuthUser | null = null
  private _listeners: AuthListener[] = []

  get token() { return this._token }
  get model() { return this._model }
  get isValid() {
    if (!this._token) return false
    try {
      const payload = JSON.parse(atob(this._token.split('.')[1]))
      return payload.exp * 1000 > Date.now()
    } catch { return false }
  }

  save(token: string, model: AuthUser | null) {
    this._token = token
    this._model = model
    this._listeners.forEach((fn) => fn(token, model))
  }

  clear() {
    this._token = ''
    this._model = null
    this._listeners.forEach((fn) => fn('', null))
  }

  onChange(fn: AuthListener) {
    this._listeners.push(fn)
    return () => { this._listeners = this._listeners.filter((f) => f !== fn) }
  }
}

const store = new AuthStore()

// ── Fetch helper with CSRF header ─────────────────────────────────────────

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-CF-App-Request'] = '1'
  }
  if (store.token) {
    headers['Authorization'] = `Bearer ${store.token}`
  }
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' })
}

// ── Auth ─────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<void> {
  const res = await apiFetch('/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? 'Sign in failed')
  }
  const { token, user } = await res.json()
  store.save(token, user)
}

export async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'X-CF-App-Request': '1' },
      credentials: 'include',
    })
    if (!res.ok) return false
    const { token, user } = await res.json()
    store.save(token, user)
    return true
  } catch { return false }
}

export async function signOut(): Promise<void> {
  try {
    await apiFetch('/auth/sign-out', { method: 'POST' })
  } finally {
    store.clear()
  }
}

export async function requireRecentAuth(): Promise<boolean> {
  const res = await apiFetch('/auth/reauth-check')
  return res.ok
}

export function currentUser() { return store.model }
export function isAuthenticated() { return store.isValid }
export function onAuthChange(fn: AuthListener) { return store.onChange(fn) }

// ── Collection service ────────────────────────────────────────────────────

interface ListOptions {
  filter?: string
  sort?: string
  page?: number
  perPage?: number
}

interface ListResult<T> {
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  items: T[]
}

// Minimal type compatibility shim for code that uses RecordModel
type WithRecord<T> = T & Partial<RecordModel>

class CollectionService<T extends { id: string } = Record<string, unknown> & { id: string }> {
  constructor(private name: string) {}

  private url(id?: string) {
    const base = `/collections/${this.name}/records`
    return id ? `${base}/${id}` : base
  }

  async getFullList<U = T>(options: ListOptions = {}): Promise<WithRecord<U>[]> {
    const params = new URLSearchParams()
    if (options.filter) params.set('filter', options.filter)
    if (options.sort) params.set('sort', options.sort)
    const query = params.toString() ? `?${params}` : ''
    const res = await apiFetch(`${this.url()}${query}`)
    if (!res.ok) throw Object.assign(new Error('Fetch failed'), { status: res.status })
    const data: ListResult<U> = await res.json()
    return data.items as WithRecord<U>[]
  }

  async getList(page = 1, perPage = 50, options: ListOptions = {}): Promise<ListResult<WithRecord<T>>> {
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) })
    if (options.filter) params.set('filter', options.filter)
    if (options.sort) params.set('sort', options.sort)
    const res = await apiFetch(`${this.url()}?${params}`)
    if (!res.ok) throw Object.assign(new Error('Fetch failed'), { status: res.status })
    const data: ListResult<T> = await res.json()
    return data as ListResult<WithRecord<T>>
  }

  async getOne(id: string): Promise<WithRecord<T>> {
    const res = await apiFetch(this.url(id))
    if (!res.ok) throw Object.assign(new Error('Not found'), { status: res.status })
    return res.json()
  }

  async create(data: Partial<T> | Record<string, unknown>): Promise<WithRecord<T>> {
    const res = await apiFetch(this.url(), {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw Object.assign(new Error(body.message ?? 'Create failed'), { status: res.status, data: body })
    }
    return res.json()
  }

  async update(id: string, data: Partial<T> | Record<string, unknown>): Promise<WithRecord<T>> {
    const res = await apiFetch(this.url(id), {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw Object.assign(new Error(body.message ?? 'Update failed'), { status: res.status, data: body })
    }
    return res.json()
  }

  async delete(id: string): Promise<void> {
    const res = await apiFetch(this.url(id), { method: 'DELETE' })
    if (!res.ok) throw Object.assign(new Error('Delete failed'), { status: res.status })
  }

  // Polling-based replacement for PocketBase realtime subscribe
  subscribe(
    _target: string,
    callback: (event: { action: string; record: WithRecord<T> }) => void,
  ): () => void {
    let running = true
    let lastUpdated = new Date().toISOString()

    const poll = async () => {
      if (!running) return
      try {
        const res = await apiFetch(`${this.url()}?filter=updated>'${lastUpdated}'&sort=-updated`)
        if (res.ok) {
          const data: ListResult<T> = await res.json()
          for (const record of data.items) {
            callback({ action: 'update', record: record as WithRecord<T> })
          }
          if (data.items.length > 0) lastUpdated = new Date().toISOString()
        }
      } catch { /* ignore polling errors */ }
      if (running) setTimeout(poll, 30_000)
    }

    setTimeout(poll, 30_000) // first poll after 30s
    return () => { running = false }
  }
}

// ── Typed collection accessors ────────────────────────────────────────────
// Import types inline to avoid circular deps

import type { Account, Transaction, Category, Trip, UserSettings, AuditLogEntry } from '@/types'

export const accounts = new CollectionService<Account>('accounts')
export const transactions = new CollectionService<Transaction>('transactions')
export const categories = new CollectionService<Category>('categories')
export const trips = new CollectionService<Trip>('trips')
export const settings = new CollectionService<UserSettings>('settings')
export const auditLog = new CollectionService<AuditLogEntry>('audit_log')

// Legacy pb shim — sync.ts calls pb.collection('name')
export const pb = {
  collection: <T extends { id: string }>(name: string) => new CollectionService<T>(name),
}
