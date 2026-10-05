import { useState, useEffect } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'cf-theme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(KEY)
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    } catch { /* ignore */ }
    return 'system'
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, theme)
    } catch { /* ignore */ }

    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  return { theme, setTheme }
}
