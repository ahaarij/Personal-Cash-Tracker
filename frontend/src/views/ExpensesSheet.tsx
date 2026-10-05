import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Search, Plus } from 'lucide-react'
import { DeleteButton } from '@/components/ui/DeleteButton'
import { Table, type Column } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { transactions as txCollection, accounts as accountsCollection, categories as catCollection } from '@/lib/api'
import { useAppContext } from '@/lib/appContext'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
import { formatAmount, formatDate } from '@/lib/money'
import type { Transaction, DatePreset, Account, Category } from '@/types'
import { Receipt } from 'lucide-react'

interface ExpensesSheetProps {
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
]

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().split('T')[0]

  if (preset === 'today') return { from: iso(today), to: iso(today) }

  if (preset === 'this_week') {
    const d = new Date(today)
    d.setDate(d.getDate() - d.getDay())
    return { from: iso(d), to: iso(today) }
  }

  if (preset === 'this_month') {
    return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to: iso(today) }
  }

  if (preset === 'last_month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const last = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: iso(first), to: iso(last) }
  }

  return { from: '', to: '' }
}

export function ExpensesSheet({}: ExpensesSheetProps) {
  const { openAddTransaction } = useAppContext()
  const queryClient = useQueryClient()
  const { enabled: confirmDelete } = useConfirmDelete()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => txCollection.update(id, { deleted: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  })
  const [preset, setPreset] = useState<DatePreset>('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [search, setSearch] = useState('')

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

  const accountById = useMemo(
    () => new Map((allAccounts ?? []).map((a) => [a.id, a])),
    [allAccounts],
  )

  const categoryById = useMemo(
    () => new Map((allCategories ?? []).map((c) => [c.id, c])),
    [allCategories],
  )

  const { from, to } = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : getDateRange(preset)

  // Filter: non-travel expenses only
  const filtered = useMemo(() => {
    return (allTx ?? []).filter((t) => {
      if (t.deleted) return false
      if (t.trip) return false // travelling handled separately
      if (from && t.date < from) return false
      if (to && t.date > to) return false
      if (filterCategory && t.category !== filterCategory) return false
      if (filterAccount && t.account !== filterAccount) return false
      if (search) {
        const q = search.toLowerCase()
        if (!t.note.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allTx, from, to, filterCategory, filterAccount, search])


  const handleExport = () => {
    const header = 'Date,Note,Category,Account,Amount,Currency\n'
    const rows = filtered.map((t) => {
      const account = accountById.get(t.account)
      const category = categoryById.get(t.category ?? '')
      return [
        t.date,
        `"${t.note.replace(/"/g, '""')}"`,
        category?.name ?? '',
        account?.name ?? '',
        (t.type === 'expense' ? '-' : '') + (t.amount / 100).toFixed(2),
        account?.currency ?? '',
      ].join(',')
    })
    const csv = header + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: Column<Transaction>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (t) => <span className="tx-date">{formatDate(t.date)}</span>,
      width: '100px',
    },
    {
      key: 'note',
      header: 'Note',
      render: (t) => (
        <span className="tx-note">{t.note || <span className="tx-note--empty">—</span>}</span>
      ),
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
          <span className={`money balance-value ${
            isExpense ? 'money-negative'
            : isTransfer ? (t.transfer_direction === 'in' ? 'money-positive' : 'money-negative')
            : 'money-positive'
          }`}>
            {isTransfer && <span className="tx-transfer-badge">Transfer</span>}
            {isExpense || (isTransfer && t.transfer_direction === 'out') ? '−' : '+'}
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
    <div className="expenses-sheet">
      <div className="page-header">
        <div className="page-header__row">
          <div>
            <h1 className="page-header__title">Expenses</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={handleExport}>
              Export
            </Button>
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openAddTransaction}>
              Add
            </Button>
          </div>
        </div>

        {/* Preset filters */}
        <div className="expenses-sheet__filters">
          <div className="date-presets" role="group" aria-label="Date range">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                className={`date-preset-btn ${preset === p.value ? 'date-preset-btn--active' : ''}`}
                onClick={() => setPreset(p.value)}
                aria-pressed={preset === p.value}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="expenses-sheet__custom-date">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="From date"
                className="date-input"
              />
              <span aria-hidden="true">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="To date"
                className="date-input"
              />
            </div>
          )}

          <div className="expenses-sheet__filter-row">
            <div className="search-field">
              <Search size={14} strokeWidth={1.5} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search transactions by note"
                className="search-field__input"
              />
            </div>

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

      <div className="expenses-sheet__content">
        <Table
          columns={columns}
          rows={filtered}
          getRowKey={(t) => t.id}
          loading={isLoading}
          caption="Expense transactions"
          emptyState={
            <EmptyState
              icon={<Receipt size={32} strokeWidth={1} />}
              title="No transactions found"
              description={
                search || filterCategory || filterAccount
                  ? 'No transactions match these filters. Try adjusting them.'
                  : 'Add your first transaction using the button below.'
              }
            />
          }
        />
      </div>
    </div>
  )
}
