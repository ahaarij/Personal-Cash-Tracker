import { useState, useEffect } from 'react'
import { syncEngine } from '@/lib/sync'
import type { SyncState } from '@/types'

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(() => syncEngine.getState())

  useEffect(() => {
    return syncEngine.subscribe(setState)
  }, [])

  return state
}
