import { useState, useEffect } from 'react'

const KEY = 'cf-confirm-delete'

export function useConfirmDelete() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(KEY)
      return stored === null ? true : stored === 'true'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, enabled.toString())
    } catch { /* storage unavailable */ }
  }, [enabled])

  return { enabled, toggle: () => setEnabled((e) => !e) }
}
