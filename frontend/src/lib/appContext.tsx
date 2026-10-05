import { createContext, useContext } from 'react'
import type { AccountType, Currency } from '@/types'

interface AppContextValue {
  openAddTransaction: () => void
  openAddAccount: (currency: Currency, type: AccountType) => void
}

export const AppContext = createContext<AppContextValue>({
  openAddTransaction: () => {},
  openAddAccount: () => {},
})

export function useAppContext() {
  return useContext(AppContext)
}
