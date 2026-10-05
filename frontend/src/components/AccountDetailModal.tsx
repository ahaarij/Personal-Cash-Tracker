import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DeleteButton } from './ui/DeleteButton'
import { Dialog } from './ui/Dialog'
import { transactions as txCollection, categories as catCollection } from '@/lib/api'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
import { formatAmount, formatDate } from '@/lib/money'
import type { Account, Transaction, Category } from '@/types'

interface Props {
  account: Account | null
  onClose: () => void
}

type Preset = 'this_month' | 'last_month' | 'last_3_months' | 'all_time'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'this_month',    label: 'This month' },
  { value: 'last_month',   label: 'Last month' },
  { value: 'last_3_months', label: '3 months' },
  { value: 'all_time',     label: 'All time' },
]

function getRange(preset: Preset): { from: string; to: string } {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().split('T')[0]
  if (preset === 'this_month') {
    return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to: iso(today) }
  }
  if (preset === 'last_month') {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const last  = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: iso(first), to: iso(last) }
  }
  if (preset === 'last_3_months') {
    const from = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    return { from: iso(from), to: iso(today) }
  }
  return { from: '', to: '' }
}

export function AccountDetailModal({ account, onClose }: Props) {
  const [preset, setPreset] = useState<Preset>('this_month')
  const queryClient = useQueryClient()

  const { data: allTx, isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => txCollection.getFullList<Transaction>({ filter: 'deleted=false', sort: '-date' }),
    enabled: !!account,
  })

  const { data: allCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catCollection.getFullList<Category>({ sort: 'name' }),
    enabled: !!account,
  })

  const categoryById = useMemo(
    () => new Map((allCategories ?? []).map((c) => [c.id, c])),
    [allCategories],
  )

  const deleteMutation = useMutation({
    mutationFn: (id: string) => txCollection.update(id, { deleted: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  })

  const { from, to } = getRange(preset)

  const filtered = useMemo(() => {
    if (!account) return []
    return (allTx ?? []).filter((t) => {
      if (t.account !== account.id) return false
      if (from && t.date < from) return false
      if (to   && t.date > to)   return false
      return true
    })
  }, [allTx, account, from, to])

  // Running total for the filtered period
  const periodTotal = useMemo(() => {
    return filtered.reduce((sum, t) => {
      if (t.type === 'expense') return sum - t.amount
      if (t.type === 'income')  return sum + t.amount
      return sum
    }, 0)
  }, [filtered])

  const { enabled: confirmDelete } = useConfirmDelete()

  if (!account) return null

  const currency = account.currency
  const isCreditCard = account.type === 'credit_card'

  const isMobile = window.matchMedia('(max-width: 768px)').matches

  return (
    <Dialog
      open={!!account}
      onClose={onClose}
      title={account.name}
      description={`${currency} · ${isCreditCard ? 'Credit card' : account.type === 'cash' ? 'Cash' : 'Debit card'}`}
      variant={isMobile ? 'sheet' : 'modal'}
    >
      <div className="acct-detail">
        {/* Preset tabs */}
        <div className="acct-detail__presets">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              className={`acct-detail__preset-btn ${preset === p.value ? 'acct-detail__preset-btn--active' : ''}`}
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Period summary */}
        {filtered.length > 0 && (
          <div className="acct-detail__summary">
            <span className="acct-detail__summary-label">Net this period</span>
            <span className={`acct-detail__summary-amount money ${periodTotal < 0 ? 'money-negative' : 'money-positive'}`}>
              {periodTotal >= 0 ? '+' : '−'}{formatAmount(Math.abs(periodTotal), currency)}
            </span>
          </div>
        )}

        {/* Transaction list */}
        {isLoading && <p className="acct-detail__empty">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="acct-detail__empty">No transactions for this period.</p>
        )}
        {!isLoading && filtered.length > 0 && (
          <ul className="acct-detail__list">
            {filtered.map((t) => {
              const cat = categoryById.get(t.category ?? '')
              const isExpense  = t.type === 'expense'
              const isTransfer = t.type === 'transfer'
              return (
                <li key={t.id} className="acct-detail__row">
                  <span className="acct-detail__date">{formatDate(t.date)}</span>
                  <span className="acct-detail__meta">
                    <span className="acct-detail__note">{t.note || '—'}</span>
                    {cat && <span className="acct-detail__cat">{cat.name}</span>}
                    {isTransfer && <span className="acct-detail__transfer-badge">Transfer</span>}
                  </span>
                  <span className={`acct-detail__amount money ${
                    isExpense ? 'money-negative'
                    : isTransfer ? (t.transfer_direction === 'in' ? 'money-positive' : 'money-negative')
                    : 'money-positive'
                  }`}>
                    {isExpense || (isTransfer && t.transfer_direction === 'out') ? '−' : '+'}
                    {formatAmount(t.amount, currency)}
                  </span>
                  <DeleteButton
                    onDelete={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    requireConfirmation={confirmDelete}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
