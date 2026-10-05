import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { ToastProvider } from '@/components/ui/Toast'
import { router } from './router'

// Apply saved theme before first render to avoid flash
;(() => {
  try {
    const t = localStorage.getItem('cf-theme')
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
  } catch { /* ignore */ }
})()
import '@/styles/global.css'
import '@/components/ui/Button.css'
import '@/components/ui/Input.css'
import '@/components/ui/Select.css'
import '@/components/ui/Dialog.css'
import '@/components/ui/Toast.css'
import '@/components/ui/EmptyState.css'
import '@/components/ui/Table.css'
import '@/components/AccountTile.css'
import '@/components/UtilizationBar.css'
import '@/components/SyncStatus.css'
import '@/components/Navigation.css'
import '@/components/AddTransaction.css'
import '@/views/MasterSheet.css'
import '@/views/ExpensesSheet.css'
import '@/views/TravellingSheet.css'
import '@/views/Auth/SignIn.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,           // 30s — data goes stale quickly so focus-refetch kicks in
      gcTime: 15 * 60_000,         // keep unused queries cached 15 min
      retry: 1,
      refetchOnWindowFocus: true,  // refetch when app comes to foreground on any device
      refetchOnReconnect: true,
      refetchInterval: 5_000,      // poll every 5s so all open devices stay in sync
    },
    mutations: {
      retry: 0,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
