import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Plus } from 'lucide-react'
import { DeleteButton } from '@/components/ui/DeleteButton'
import { Table, type Column } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { transactions as txCollection, accounts as accountsCollection, categories as catCollection, trips as tripsCollection } from '@/lib/api'
import { summarizeByTrip } from '@/lib/balance'
import { formatAmount, formatDate } from '@/lib/money'
import { useAppContext } from '@/lib/appContext'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
import type { Transaction, Account, Category, Trip } from '@/types'

export function TravellingSheet() {
  const { openAddTransaction } = useAppContext()
  const { enabled: confirmDelete } = useConfirmDelete()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => txCollection.update(id, { deleted: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  })
  const [filterTrip, setFilterTrip] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')

  const { data: allTx, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => txCollection.getFullList<Transaction>({ filter: 'deleted=false', sort: '-date' }),
  })

  const { data: allAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsCollection.getFullList<Account>({ sort: 'name' }),
  })

  const { data: allCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catCollection.getFullList<Category>({ sort: 'name' }),
  })

  const { data: allTrips } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsCollection.getFullList<Trip>({ sort: '-start_date' }),
  })

  const accountById = useMemo(
    () => new Map((allAccounts ?? []).map((a) => [a.id, a])),
    [allAccounts],
  )

  const categoryById = useMemo(
    () => new Map((allCategories ?? []).map((c) => [c.id, c])),
    [allCategories],
  )

  const tripById = useMemo(
    () => new Map((allTrips ?? []).map((t) => [t.id, t])),
    [allTrips],
  )

  // All travel transactions
  const travelTx = useMemo(
    () => (allTx ?? []).filter((t) => !t.deleted && !!t.trip),
    [allTx],
  )

  // Trip totals per currency
  const tripTotals = summarizeByTrip(travelTx, allAccounts ?? [])

  // Filtered for the table
  const filtered = useMemo(() => {
    return travelTx.filter((t) => {
      if (filterTrip && t.trip !== filterTrip) return false
      if (filterCategory && t.category !== filterCategory) return false
      if (filterAccount && t.account !== filterAccount) return false
      return true
    })
  }, [travelTx, filterTrip, filterCategory, filterAccount])

  const columns: Column<Transaction>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (t) => <span className="tx-date">{formatDate(t.date)}</span>,
      width: '100px',
    },
    {
      key: 'trip',
      header: 'Trip',
      render: (t) => (
        <span className="tx-category">
          {tripById.get(t.trip ?? '')?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (t) => <span className="tx-note">{t.note || '—'}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (t) => {
        const cat = categoryById.get(t.category ?? '')
        return <span className="tx-category">{cat?.name ?? '—'}</span>
      },
    },
    {
      key: 'account',
      header: 'Account',
      render: (t) => {
        const acc = accountById.get(t.account)
        return <span className="tx-account">{acc?.name ?? '—'}</span>
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (t) => {
        const acc = accountById.get(t.account)
        const currency = acc?.currency ?? ''
        const isExpense = t.type === 'expense'
        const isTransfer = t.type === 'transfer'
        return (
          <span className={`money balance-value ${isExpense ? 'money-negative' : ''}`}>
            {isTransfer ? <span className="tx-transfer-badge">Transfer</span> : (isExpense ? '−' : '+')}
            {formatAmount(t.amount, currency)}
          </span>
        )
      },
    },
    {
      key: 'actions' as keyof Transaction,
      header: '',
      width: '44px',
      cellClassName: 'table__actions-cell',
      render: (t) => (
        <DeleteButton
          onDelete={() => deleteMutation.mutate(t.id)}
          disabled={deleteMutation.isPending}
          requireConfirmation={confirmDelete}
        />
      ),
    },
  ]

  return (
    <div className="travelling-sheet">
      <div className="page-header">
        <div className="page-header__row">
          <h1 className="page-header__title">Travelling</h1>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openAddTransaction}>
            Add
          </Button>
        </div>

        <div className="expenses-sheet__filters">
          <div className="expenses-sheet__filter-row">
            <select
              value={filterTrip}
              onChange={(e) => setFilterTrip(e.target.value)}
              aria-label="Filter by trip"
              className="filter-select"
            >
              <option value="">All trips</option>
              {(allTrips ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Filter by category"
              className="filter-select"
            >
              <option value="">All categories</option>
              {(allCategories ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              aria-label="Filter by account"
              className="filter-select"
            >
              <option value="">All accounts</option>
              {(allAccounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Trip totals summary */}
      {(allTrips ?? []).length > 0 && (
        <div className="trip-totals">
          {(allTrips ?? [])
            .filter((t) => !filterTrip || t.id === filterTrip)
            .map((trip) => {
              const totals = tripTotals.get(trip.id)
              if (!totals?.size) return null
              return (
                <div key={trip.id} className="trip-total-card">
                  <div className="trip-total-card__name">{trip.name}</div>
                  <div className="trip-total-card__dates">
                    {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                  </div>
                  <div className="trip-total-card__amounts">
                    {[...totals.entries()].map(([currency, amount]) => (
                      <span key={currency} className="money balance-value">
                        {formatAmount(amount, currency)} <span className="trip-total-card__currency">{currency}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      <div className="expenses-sheet__content">
        <Table
          columns={columns}
          rows={filtered}
          getRowKey={(t) => t.id}
          loading={isLoading}
          caption="Travel transactions"
          emptyState={
            <EmptyState
              icon={<Globe size={32} strokeWidth={1} />}
              title="No travel transactions"
              description="Add transactions with the Travelling toggle enabled to see them here."
            />
          }
        />
      </div>
    </div>
  )
}
