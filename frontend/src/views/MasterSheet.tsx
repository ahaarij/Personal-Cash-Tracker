
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Settings, Eye, EyeOff, Plus } from 'lucide-react'
import { AccountTile } from '@/components/AccountTile'
import { WalletCard } from '@/components/WalletCard'
import { AccountDetailModal } from '@/components/AccountDetailModal'
import '@/components/AccountDetailModal.css'
import { Button } from '@/components/ui/Button'
import { accounts as accountsCollection, transactions as txCollection, getFxRates } from '@/lib/api'
import { buildCurrencyGroups, buildWalletGroups } from '@/lib/balance'
import { useHideBalances } from '@/hooks/useHideBalances'
import { useCurrencyOrder } from '@/hooks/useCurrencyOrder'
import type { Account, AccountType, Currency } from '@/types'

interface MasterSheetProps {
  onAddTransaction?: () => void
  onAddAccount: (currency: Currency, type: AccountType) => void
}

export function MasterSheet({ onAddTransaction, onAddAccount }: MasterSheetProps) {
  const { hidden: hideBalances, toggle: toggleHide } = useHideBalances()
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsCollection.getFullList<Account>({ filter: 'archived=false', sort: 'sort_order' }),
  })

  const { data: txs } = useQuery({
    queryKey: ['transactions', 'balance'],
    queryFn: () => txCollection.getFullList({ filter: 'deleted=false', sort: '-date' }),
  })

  const { data: fxRates } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: getFxRates,
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  })

  // Derive currencies from non-wallet accounts only (wallet pockets excluded from grid)
  const nonWalletAccounts = (accounts ?? []).filter((a) => !a.wallet)
  const knownCurrencies: string[] = [...new Set(nonWalletAccounts.map((a) => a.currency))]
  const { orderedCurrencies } = useCurrencyOrder(knownCurrencies)

  const currencyGroups = buildCurrencyGroups(accounts ?? [], txs ?? [], orderedCurrencies)
  const walletGroups = buildWalletGroups(accounts ?? [], txs ?? [], fxRates ?? null)

  const isLoading = accountsLoading

  return (
    <div className="master-sheet">
      <header className="master-sheet__header">
        <div>
          <h1 className="master-sheet__title">Personal Cash Flow</h1>
          <p className="master-sheet__subtitle">Daily Cash Flow</p>
        </div>
        <div className="master-sheet__actions">
          <button
            className="master-sheet__icon-btn"
            onClick={toggleHide}
            aria-label={hideBalances ? 'Show balances' : 'Hide balances'}
            aria-pressed={hideBalances}
          >
            {hideBalances ? (
              <EyeOff size={18} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Eye size={18} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
          <Link to="/settings" aria-label="Settings">
            <button className="master-sheet__icon-btn">
              <Settings size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </Link>
        </div>
      </header>

      {/* Empty state */}
      {!isLoading && orderedCurrencies.length === 0 && walletGroups.length === 0 && (
        <div className="master-sheet__empty">
          <p>No accounts yet.</p>
          <p className="master-sheet__empty-hint">Go to Settings to add your bank cards and cash wallets.</p>
        </div>
      )}

      {/* Currency grid + wallet column side by side */}
      {(isLoading || orderedCurrencies.length > 0 || walletGroups.length > 0) && (
      <div className="master-sheet__grid-wrapper">

        {/* Scrollable currency × type grid */}
        {(isLoading || orderedCurrencies.length > 0) && (
        <div className="master-sheet__grid-scroll">
          <div className="master-sheet__grid" role="table" aria-label="Cash flow overview">
            <div className="master-sheet__col-headers" role="row">
              <div className="master-sheet__currency-col" role="columnheader">
                <span className="sr-only">Currency</span>
              </div>
              <div className="master-sheet__col-header" role="columnheader">C.C</div>
              <div className="master-sheet__col-header" role="columnheader">Cash</div>
              <div className="master-sheet__col-header" role="columnheader">D.C</div>
            </div>

            {isLoading && (
              <div className="master-sheet__loading" aria-busy="true" aria-label="Loading balances">
                {knownCurrencies.map((currency) => (
                  <div key={currency} className="master-sheet__row" role="row">
                    <div className="master-sheet__currency-label" role="rowheader">{currency}</div>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton master-sheet__tile-skeleton" role="cell" />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {!isLoading && currencyGroups.map(({ currency, credit_cards, cash, debit_cards }) => (
              <div key={currency} className="master-sheet__row" role="row">
                <div className="master-sheet__currency-label" role="rowheader">
                  <span aria-label={`Currency: ${currency}`}>{currency}</span>
                </div>
                <div role="cell">
                  <AccountTile balances={credit_cards} currency={currency} accountType="credit_card" hideBalances={hideBalances} onAddAccount={() => onAddAccount(currency, 'credit_card')} onCardClick={setSelectedAccount} />
                </div>
                <div role="cell">
                  <AccountTile balances={cash} currency={currency} accountType="cash" hideBalances={hideBalances} onAddAccount={() => onAddAccount(currency, 'cash')} onCardClick={setSelectedAccount} />
                </div>
                <div role="cell">
                  <AccountTile balances={debit_cards} currency={currency} accountType="debit_card" hideBalances={hideBalances} onAddAccount={() => onAddAccount(currency, 'debit_card')} onCardClick={setSelectedAccount} />
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Wallet / multi-currency card column */}
        {walletGroups.length > 0 && (
          <div className="master-sheet__wallet-col">
            <div className="master-sheet__wallet-col-header">Cards</div>
            <div className="master-sheet__wallet-col-list">
              {walletGroups.map((w) => (
                <WalletCard
                  key={w.name}
                  wallet={w}
                  hideBalances={hideBalances}
                  onPocketClick={setSelectedAccount}
                />
              ))}
            </div>
          </div>
        )}

      </div>
      )}

      <AccountDetailModal account={selectedAccount} onClose={() => setSelectedAccount(null)} />

      {/* Floating add button */}
      <Button
        variant="primary"
        size="lg"
        className="master-sheet__add-btn"
        onClick={onAddTransaction}
        aria-label="Add transaction (N)"
      >
        <Plus size={18} strokeWidth={2} aria-hidden="true" />
        <span>Add transaction</span>
      </Button>
    </div>
  )
}
