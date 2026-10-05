/**
 * IndexedDB store for offline-first operation.
 * Stores a local cache of records and a queue of unsynced changes.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Account, Transaction, Category, Trip, UserSettings, QueuedChange } from '@/types'

interface CashFlowDB extends DBSchema {
  accounts: {
    key: string
    value: Account
    indexes: { by_owner: string; by_currency: string }
  }
  transactions: {
    key: string
    value: Transaction
    indexes: { by_owner: string; by_account: string; by_date: string; by_trip: string }
  }
  categories: {
    key: string
    value: Category
    indexes: { by_owner: string }
  }
  trips: {
    key: string
    value: Trip
    indexes: { by_owner: string }
  }
  settings: {
    key: string
    value: UserSettings
  }
  sync_queue: {
    key: string
    value: QueuedChange
    indexes: { by_timestamp: number }
  }
  sync_meta: {
    key: string
    value: { collection: string; lastFetched: string }
  }
}

let dbInstance: IDBPDatabase<CashFlowDB> | null = null

export async function getDb(): Promise<IDBPDatabase<CashFlowDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<CashFlowDB>('cashflow', 1, {
    upgrade(db) {
      const accountStore = db.createObjectStore('accounts', { keyPath: 'id' })
      accountStore.createIndex('by_owner', 'owner')
      accountStore.createIndex('by_currency', 'currency')

      const txStore = db.createObjectStore('transactions', { keyPath: 'id' })
      txStore.createIndex('by_owner', 'owner')
      txStore.createIndex('by_account', 'account')
      txStore.createIndex('by_date', 'date')
      txStore.createIndex('by_trip', 'trip')

      const catStore = db.createObjectStore('categories', { keyPath: 'id' })
      catStore.createIndex('by_owner', 'owner')

      const tripStore = db.createObjectStore('trips', { keyPath: 'id' })
      tripStore.createIndex('by_owner', 'owner')

      db.createObjectStore('settings', { keyPath: 'id' })

      const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' })
      queueStore.createIndex('by_timestamp', 'timestamp')

      db.createObjectStore('sync_meta', { keyPath: 'collection' })
    },
  })

  return dbInstance
}

/* ─── Cache helpers ──────────────────────────────────────────────────────── */

export async function cacheRecords<T extends { id: string }>(
  store: keyof Pick<CashFlowDB, 'accounts' | 'transactions' | 'categories' | 'trips'>,
  records: T[],
): Promise<void> {
  type DataStore = 'accounts' | 'transactions' | 'categories' | 'trips'
  const db = await getDb()
  const tx = db.transaction(store as DataStore, 'readwrite')
  for (const record of records) {
    await (tx.store as unknown as { put: (r: T) => Promise<string> }).put(record)
  }
  await tx.done
}

export async function getCachedRecords<T>(
  store: keyof Pick<CashFlowDB, 'accounts' | 'transactions' | 'categories' | 'trips'>,
): Promise<T[]> {
  type DataStore = 'accounts' | 'transactions' | 'categories' | 'trips'
  const db = await getDb()
  return (db.getAll(store as DataStore)) as Promise<T[]>
}

export async function deleteCachedRecord(
  store: keyof Pick<CashFlowDB, 'accounts' | 'transactions' | 'categories' | 'trips'>,
  id: string,
): Promise<void> {
  type DataStore = 'accounts' | 'transactions' | 'categories' | 'trips'
  const db = await getDb()
  await db.delete(store as DataStore, id)
}

/* ─── Sync queue ─────────────────────────────────────────────────────────── */

export async function enqueueChange(change: QueuedChange): Promise<void> {
  const db = await getDb()
  await db.put('sync_queue', change)
}

export async function getQueuedChanges(): Promise<QueuedChange[]> {
  const db = await getDb()
  return db.getAllFromIndex('sync_queue', 'by_timestamp')
}

export async function removeQueuedChange(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('sync_queue', id)
}

export async function getQueuedCount(): Promise<number> {
  const db = await getDb()
  return db.count('sync_queue')
}

/* ─── Clear on sign-out (security requirement) ───────────────────────────── */

export async function clearAllCachedData(): Promise<void> {
  const db = await getDb()
  const stores: Array<keyof CashFlowDB> = [
    'accounts',
    'transactions',
    'categories',
    'trips',
    'settings',
    'sync_queue',
    'sync_meta',
  ]
  type AllStore = 'accounts' | 'transactions' | 'categories' | 'trips' | 'settings' | 'sync_queue' | 'sync_meta'
  const tx = db.transaction(stores as AllStore[], 'readwrite')
  for (const store of stores) {
    await (tx.objectStore(store as AllStore) as unknown as { clear: () => Promise<void> }).clear()
  }
  await tx.done
}
