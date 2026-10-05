import { createRouter, createRoute, createRootRoute, Outlet, redirect } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Sidebar, MobileNav } from '@/components/Navigation'
import { AddTransaction } from '@/components/AddTransaction'
import { AddAccount } from '@/components/AddAccount'
import { MasterSheet } from '@/views/MasterSheet'
import { ExpensesSheet } from '@/views/ExpensesSheet'
import { TravellingSheet } from '@/views/TravellingSheet'
import { Settings } from '@/views/Settings'
import { SignIn } from '@/views/Auth/SignIn'
import { isAuthenticated, refreshSession } from '@/lib/api'
import { syncEngine } from '@/lib/sync'
import { AppContext, useAppContext } from '@/lib/appContext'
import type { AccountType, Currency } from '@/types'

/* ─── Root layout ─────────────────────────────────────────────────────────── */

function RootLayout() {
  const [addTxOpen, setAddTxOpen] = useState(false)
  const [addAccState, setAddAccState] = useState<{ open: boolean; currency: Currency; type: AccountType }>({
    open: false, currency: 'AED', type: 'cash',
  })

  // Global keyboard shortcut N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
        e.preventDefault()
        setAddTxOpen(true)
      }
      if (e.key === 'Escape') { setAddTxOpen(false); setAddAccState((s) => ({ ...s, open: false })) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Init sync engine
  useEffect(() => {
    syncEngine.init()
    return () => syncEngine.teardown()
  }, [])

  return (
    <AppContext.Provider value={{
      openAddTransaction: () => setAddTxOpen(true),
      openAddAccount: (currency, type) => setAddAccState({ open: true, currency, type }),
    }}>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
        <MobileNav />
        <AddTransaction open={addTxOpen} onClose={() => setAddTxOpen(false)} />
        <AddAccount
          open={addAccState.open}
          onClose={() => setAddAccState((s) => ({ ...s, open: false }))}
          initialCurrency={addAccState.currency}
          initialType={addAccState.type}
        />
      </div>
    </AppContext.Provider>
  )
}

/* ─── Auth guard ──────────────────────────────────────────────────────────── */

async function authGuard() {
  if (!isAuthenticated()) {
    const refreshed = await refreshSession()
    if (!refreshed) {
      throw redirect({ to: '/sign-in' })
    }
  }
  return null
}

/* ─── Routes ──────────────────────────────────────────────────────────────── */

const rootRoute = createRootRoute()

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: RootLayout,
  beforeLoad: authGuard,
})

function IndexPage() {
  const { openAddTransaction, openAddAccount } = useAppContext()
  return (
    <MasterSheet
      onAddTransaction={openAddTransaction}
      onAddAccount={openAddAccount}
    />
  )
}

const indexRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/',
  component: IndexPage,
})

const expensesRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/expenses',
  component: () => <ExpensesSheet />,
})

const travellingRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/travelling',
  component: TravellingSheet,
})

const settingsRoute = createRoute({
  getParentRoute: () => authRoute,
  path: '/settings',
  component: Settings,
})

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
})

function SignInPage() {
  const navigate = signInRoute.useNavigate()
  return (
    <SignIn onSuccess={() => navigate({ to: '/' })} />
  )
}

const routeTree = rootRoute.addChildren([
  authRoute.addChildren([indexRoute, expensesRoute, travellingRoute, settingsRoute]),
  signInRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
