import { useState, useEffect } from 'react'

const KEY = 'cf-hide-balances'

export function useHideBalances() {
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-hide-balances', hidden.toString())
    try {
      localStorage.setItem(KEY, hidden.toString())
    } catch {
      // Storage unavailable — preference not persisted
    }
  }, [hidden])

  return { hidden, toggle: () => setHidden((h) => !h) }
}
