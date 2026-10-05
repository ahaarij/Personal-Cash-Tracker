import { useState, useEffect } from 'react'
import { isAuthenticated, onAuthChange, currentUser, refreshSession } from '@/lib/api'
import type { AuthUser } from '@/types'

interface AuthState {
  authenticated: boolean
  user: AuthUser | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    authenticated: isAuthenticated(),
    user: currentUser() as AuthUser | null,
    loading: true,
  })

  useEffect(() => {
    let mounted = true

    // Try to restore session from HttpOnly cookie on first load
    refreshSession().then((ok) => {
      if (mounted) {
        setState({
          authenticated: ok && isAuthenticated(),
          user: currentUser() as AuthUser | null,
          loading: false,
        })
      }
    })

    const unsubscribe = onAuthChange((token, model) => {
      if (mounted) {
        setState({
          authenticated: !!token,
          user: model as AuthUser | null,
          loading: false,
        })
      }
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return state
}
