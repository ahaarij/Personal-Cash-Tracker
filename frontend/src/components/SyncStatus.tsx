import { WifiOff, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import { useSyncState } from '@/hooks/useSync'
import { syncEngine } from '@/lib/sync'

export function SyncStatus() {
  const sync = useSyncState()

  const handleRetry = () => syncEngine.retry()

  if (sync.status === 'synced') {
    return (
      <div className="sync-status sync-status--ok" aria-live="polite" aria-atomic="true">
        <CheckCircle size={13} strokeWidth={1.5} aria-hidden="true" />
        <span>Synced</span>
      </div>
    )
  }

  if (sync.status === 'syncing') {
    return (
      <div className="sync-status sync-status--syncing" aria-live="polite" aria-atomic="true">
        <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" className="spin" />
        <span>Syncing…</span>
      </div>
    )
  }

  if (sync.status === 'offline') {
    return (
      <div className="sync-status sync-status--offline" aria-live="polite" aria-atomic="true">
        <WifiOff size={13} strokeWidth={1.5} aria-hidden="true" />
        <span>
          Offline{sync.pendingCount > 0 ? `, ${sync.pendingCount} pending` : ''}
        </span>
      </div>
    )
  }

  // error state
  return (
    <button
      className="sync-status sync-status--error"
      onClick={handleRetry}
      aria-live="assertive"
      aria-atomic="true"
    >
      <AlertTriangle size={13} strokeWidth={1.5} aria-hidden="true" />
      <span>Sync failed — tap to retry</span>
    </button>
  )
}
