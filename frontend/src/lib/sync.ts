/**
 * Sync engine — synchronises the offline queue and real-time updates.
 * Uses PocketBase's SSE subscription for live updates.
 * On reconnect, drains the queued changes and refreshes stale data.
 */

import { pb } from './api'
import {
  enqueueChange,
  getQueuedChanges,
  removeQueuedChange,
} from './db'
import type { QueuedChange, SyncState } from '@/types'
import { v4 as uuidv4 } from 'uuid'

type SyncListener = (state: SyncState) => void

class SyncEngine {
  private listeners: SyncListener[] = []
  private state: SyncState = { status: 'offline', pendingCount: 0 }
  private draining = false

  getState(): SyncState { return this.state }

  subscribe(fn: SyncListener): () => void {
    this.listeners.push(fn)
    fn(this.state)
    return () => { this.listeners = this.listeners.filter((l) => l !== fn) }
  }

  private setState(next: Partial<SyncState>) {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((fn) => fn(this.state))
  }

  async init() {
    window.addEventListener('online', () => this.onOnline())
    window.addEventListener('offline', () => this.setState({ status: 'offline' }))

    if (navigator.onLine) {
      await this.onOnline()
    } else {
      const pending = await getQueuedChanges()
      this.setState({ status: 'offline', pendingCount: pending.length })
    }
  }

  private async onOnline() {
    this.setState({ status: 'syncing' })
    try {
      await this.drainQueue()
      this.setState({
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
        error: undefined,
      })
    } catch (e) {
      this.setState({
        status: 'error',
        error: 'Sync failed. Tap to retry.',
      })
    }
  }

  async retry() {
    await this.onOnline()
  }

  private async drainQueue() {
    if (this.draining) return
    this.draining = true
    try {
      const queue = await getQueuedChanges()
      for (const change of queue) {
        await this.applyChange(change)
      }
    } finally {
      this.draining = false
    }
  }

  private async applyChange(change: QueuedChange): Promise<void> {
    const { action } = change
    try {
      if (action.type === 'create') {
        await pb.collection(action.collection).create({
          ...action.data,
          client_id: action.clientId,
        })
      } else if (action.type === 'update') {
        await pb.collection(action.collection).update(action.id, action.data)
      } else if (action.type === 'delete') {
        await pb.collection(action.collection).update(action.id, { deleted: true })
      }
      await removeQueuedChange(change.id)
      const pending = await getQueuedChanges()
      this.setState({ pendingCount: pending.length })
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      if (status === 404 || status === 400) {
        // Non-retryable — remove from queue
        await removeQueuedChange(change.id)
      } else {
        throw e
      }
    }
  }

  async queueCreate(
    collection: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const clientId = uuidv4()
    const change: QueuedChange = {
      id: uuidv4(),
      action: { type: 'create', collection, data, clientId },
      timestamp: Date.now(),
      retries: 0,
    }
    await enqueueChange(change)
    const pending = await getQueuedChanges()
    this.setState({ pendingCount: pending.length })

    if (navigator.onLine && !this.draining) {
      // Attempt immediate sync
      this.drainQueue().catch(() => {
        this.setState({ status: 'error', error: 'Sync failed. Tap to retry.' })
      })
    } else {
      this.setState({ status: 'offline' })
    }

    return clientId
  }

  async queueUpdate(collection: string, id: string, data: Record<string, unknown>) {
    const change: QueuedChange = {
      id: uuidv4(),
      action: { type: 'update', collection, id, data },
      timestamp: Date.now(),
      retries: 0,
    }
    await enqueueChange(change)
    const pending = await getQueuedChanges()
    this.setState({ pendingCount: pending.length })
    if (navigator.onLine && !this.draining) this.drainQueue().catch(() => {})
  }

  async queueDelete(collection: string, id: string) {
    const change: QueuedChange = {
      id: uuidv4(),
      action: { type: 'delete', collection, id },
      timestamp: Date.now(),
      retries: 0,
    }
    await enqueueChange(change)
    const pending = await getQueuedChanges()
    this.setState({ pendingCount: pending.length })
    if (navigator.onLine && !this.draining) this.drainQueue().catch(() => {})
  }

  teardown() {
    window.removeEventListener('online', () => this.onOnline())
    window.removeEventListener('offline', () => this.setState({ status: 'offline' }))
  }
}

export const syncEngine = new SyncEngine()
