import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { useToast } from './ui/Toast'
import { accounts as accountsCollection, categories as categoriesCollection, trips as tripsCollection, transactions as txCollection } from '@/lib/api'
import { parseAmount, todayISO, liveFormatAmount } from '@/lib/money'
import type { AddTransactionForm, TransactionType } from '@/types'
import { v4 as uuidv4 } from 'uuid' // used for transfer pair ID

interface AddTransactionProps {
  open: boolean
  onClose: () => void
}

const EXCHANGE_RATES: Record<string, number> = {
  'USD_AED': 3.67,  'AED_USD': 0.2725,
  'EUR_USD': 1.08,  'USD_EUR': 0.926,
  'GBP_USD': 1.27,  'USD_GBP': 0.787,
  'EUR_AED': 3.98,  'AED_EUR': 0.251,
  'GBP_AED': 4.66,  'AED_GBP': 0.215,
  'SAR_AED': 0.979, 'AED_SAR': 1.021,
  'INR_AED': 0.044, 'AED_INR': 22.7,
  'EUR_GBP': 0.854, 'GBP_EUR': 1.170,
}

function getDefaultRate(from: string, to: string): string {
  const rate = EXCHANGE_RATES[`${from}_${to}`]
  return rate ? String(rate) : '1'
}

const DEFAULT_FORM: AddTransactionForm = {
  type: 'expense',
  amount: '',
  currency: 'AED',
  account: '',
  category: '',
  date: todayISO(),
  note: '',
  trip: '',
  isTravel: false,
  transferDestinationAccount: '',
  exchangeRate: '',
}

// Persist account, category, trip between opens for fast entry
let persistedState: Partial<AddTransactionForm> = {}

export function AddTransaction({ open, onClose }: AddTransactionProps) {
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  const queryClient = useQueryClient()
  const toast = useToast()
  const amountRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<AddTransactionForm>({
    ...DEFAULT_FORM,
    ...persistedState,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof AddTransactionForm, string>>>({})

  const { data: allAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsCollection.getFullList({ filter: 'archived=false', sort: 'sort_order' }),
  })

  const { data: allCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesCollection.getFullList({ filter: 'archived=false', sort: 'name' }),
  })

  const { data: allTrips } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsCollection.getFullList({ sort: '-start_date' }),
  })

  // Focus amount on open
  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULT_FORM, ...persistedState, date: todayISO(), amount: '' })
      setErrors({})
      setTimeout(() => amountRef.current?.focus(), 50)
    }
  }, [open])

  // Keyboard shortcut N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
        // Handled by parent, but just in case
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const filteredAccounts = (allAccounts ?? []).filter(
    (a) => a.currency === form.currency,
  )

  // Destination can be any account (cross-currency transfers supported)
  const filteredDestAccounts = (allAccounts ?? []).filter(
    (a) => a.id !== form.account,
  )

  const destAccount = (allAccounts ?? []).find((a) => a.id === form.transferDestinationAccount)
  const isCrossCurrency = !!destAccount && destAccount.currency !== form.currency

  const setField = useCallback(
    <K extends keyof AddTransactionForm>(key: K, value: AddTransactionForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    },
    [errors],
  )

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { formatted } = liveFormatAmount(e.target.value, form.currency)
    setField('amount', formatted)
    // Recalculate received amount if rate is set
    if (form.exchangeRate && destAccount) {
      const srcMinor = parseAmount(formatted, form.currency)
      const rate = parseFloat(form.exchangeRate)
      if (srcMinor && rate > 0) {
        const recvMinor = Math.round(srcMinor * rate)
        const { formatted: recvFmt } = liveFormatAmount(String(recvMinor / 100), destAccount.currency)
        setField('receivedAmount', recvFmt)
      }
    }
  }

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '')
    setField('exchangeRate', raw)
    if (raw && destAccount) {
      const srcMinor = parseAmount(form.amount, form.currency)
      const rate = parseFloat(raw)
      if (srcMinor && rate > 0) {
        const recvMinor = Math.round(srcMinor * rate)
        const { formatted } = liveFormatAmount(String(recvMinor / 100), destAccount.currency)
        setField('receivedAmount', formatted)
      }
    }
  }

  const handleReceivedAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { formatted } = liveFormatAmount(e.target.value, destAccount!.currency)
    setField('receivedAmount', formatted)
    // Back-calculate rate
    const srcMinor = parseAmount(form.amount, form.currency)
    const recvMinor = parseAmount(formatted, destAccount!.currency)
    if (srcMinor && recvMinor && srcMinor > 0) {
      const rate = recvMinor / srcMinor
      setField('exchangeRate', rate.toFixed(4))
    }
  }

  function validate(): boolean {
    const next: typeof errors = {}
    const parsed = parseAmount(form.amount, form.currency)

    if (!form.amount.trim() || parsed === null) {
      next.amount = 'Enter a valid amount.'
    } else if (parsed <= 0) {
      next.amount = 'Amount must be greater than zero.'
    } else if (parsed > 999_999_999) {
      next.amount = 'Amount is too large.'
    }

    if (!form.account) next.account = 'Select an account.'
    if (form.type !== 'transfer' && !form.category) next.category = 'Select a category.'
    if (form.type === 'transfer' && !form.transferDestinationAccount) {
      next.transferDestinationAccount = 'Select a destination account.'
    }
    if (form.type === 'transfer' && isCrossCurrency) {
      const recv = parseAmount(form.receivedAmount ?? '', destAccount!.currency)
      if (!form.receivedAmount?.trim() || recv === null || recv <= 0) {
        next.receivedAmount = 'Enter the amount received.'
      }
    }
    if (!form.date) next.date = 'Select a date.'
    if (form.isTravel && !form.trip) next.trip = 'Select a trip or create one first.'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed')

      const amount = parseAmount(form.amount, form.currency)!
      const pairId = form.type === 'transfer' ? uuidv4() : undefined

      const baseData = {
        date: form.date,
        amount,
        account: form.account,
        type: form.type,
        category: form.type !== 'transfer' ? form.category || undefined : undefined,
        note: form.note.trim(),
        trip: form.isTravel ? form.trip || undefined : undefined,
        deleted: false,
      }

      if (form.type === 'transfer') {
        const inAmount = isCrossCurrency && form.receivedAmount
          ? parseAmount(form.receivedAmount, destAccount!.currency)!
          : amount
        await txCollection.create({ ...baseData, transfer_pair_id: pairId, transfer_direction: 'out', client_id: uuidv4() })
        await txCollection.create({ ...baseData, amount: inAmount, account: form.transferDestinationAccount!, transfer_pair_id: pairId, transfer_direction: 'in', client_id: uuidv4() })
      } else {
        await txCollection.create({ ...baseData, client_id: uuidv4() })
      }
    },
    onSuccess: () => {
      // Persist helpful state for next entry
      persistedState = {
        account: form.account,
        currency: form.currency,
        category: form.category,
        trip: form.trip,
        isTravel: form.isTravel,
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.show({ type: 'success', message: 'Transaction saved.' })
      onClose()
    },
    onError: (e: Error) => {
      if (e.message !== 'Validation failed') {
        toast.show({ type: 'error', message: 'Could not save transaction. Try again.' })
      }
    },
  })

  const selectedAccount = (allAccounts ?? []).find((a) => a.id === form.account)
  const isCreditCard = selectedAccount?.type === 'credit_card'

  // Credit cards don't accept income — payments go via Transfer
  const typeOptions: { value: TransactionType; label: string }[] = isCreditCard
    ? [
        { value: 'expense', label: 'Expense' },
        { value: 'transfer', label: 'Transfer' },
      ]
    : [
        { value: 'expense', label: 'Expense' },
        { value: 'income', label: 'Income' },
        { value: 'transfer', label: 'Transfer' },
      ]

  const currencyOptions = [
    ...new Set((allAccounts ?? []).map((a) => a.currency)),
  ].map((c) => ({ value: c, label: c }))

  const accountOptions = filteredAccounts.map((a) => ({
    value: a.id,
    label: a.name,
  }))

  const destAccountOptions = filteredDestAccounts.map((a) => ({
    value: a.id,
    label: a.currency !== form.currency ? `${a.name} (${a.currency})` : a.name,
  }))

  const categoryOptions = (allCategories ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const tripOptions = (allTrips ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add transaction"
      variant={isMobile ? 'sheet' : 'modal'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        className="add-tx-form"
        onSubmit={(e) => { e.preventDefault(); saveMutation.mutate() }}
        noValidate
      >
        {/* Type selector */}
        <div className="add-tx-form__type-row">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`add-tx-form__type-btn ${form.type === opt.value ? 'add-tx-form__type-btn--active' : ''}`}
              onClick={() => setField('type', opt.value)}
              aria-pressed={form.type === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Amount + currency row */}
        <div className="add-tx-form__amount-row">
          <Input
            ref={amountRef}
            label="Amount"
            inputMode="decimal"
            type="text"
            value={form.amount}
            onChange={handleAmountChange}
            error={errors.amount}
            autoComplete="off"
            className="add-tx-form__amount"
          />
          <Select
            label="Currency"
            options={currencyOptions}
            value={form.currency}
            onChange={(e) => {
              setField('currency', e.target.value)
              setField('account', '') // reset account when currency changes
            }}
            className="add-tx-form__currency"
          />
        </div>

        {/* Account */}
        <Select
          label="Account"
          options={accountOptions}
          value={form.account}
          onChange={(e) => {
            const acc = (allAccounts ?? []).find((a) => a.id === e.target.value)
            if (acc?.type === 'credit_card' && form.type === 'income') {
              setField('type', 'expense')
            }
            setField('account', e.target.value)
          }}
          error={errors.account}
          placeholder="Select account"
        />

        {/* Transfer destination */}
        {form.type === 'transfer' && (
          <>
            <Select
              label="To account"
              options={destAccountOptions}
              value={form.transferDestinationAccount ?? ''}
              onChange={(e) => {
                const dest = (allAccounts ?? []).find((a) => a.id === e.target.value)
                const cross = !!dest && dest.currency !== form.currency
                const defaultRate = cross ? getDefaultRate(form.currency, dest!.currency) : ''
                setField('transferDestinationAccount', e.target.value)
                setField('receivedAmount', '')
                setField('exchangeRate', defaultRate)
                // Auto-calculate received amount with default rate
                if (cross && defaultRate) {
                  const srcMinor = parseAmount(form.amount, form.currency)
                  const rate = parseFloat(defaultRate)
                  if (srcMinor && rate > 0) {
                    const recvMinor = Math.round(srcMinor * rate)
                    const { formatted } = liveFormatAmount(String(recvMinor / 100), dest!.currency)
                    setField('receivedAmount', formatted)
                  }
                }
              }}
              error={errors.transferDestinationAccount}
              placeholder="Select destination account"
            />
            {isCrossCurrency && (
              <>
                <Input
                  label={`Exchange rate (1 ${form.currency} = ? ${destAccount!.currency})`}
                  inputMode="decimal"
                  type="text"
                  value={form.exchangeRate ?? ''}
                  onChange={handleRateChange}
                  autoComplete="off"
                  placeholder="e.g. 3.67"
                />
                <Input
                  label={`Amount received (${destAccount!.currency})`}
                  inputMode="decimal"
                  type="text"
                  value={form.receivedAmount ?? ''}
                  onChange={handleReceivedAmountChange}
                  error={errors.receivedAmount}
                  autoComplete="off"
                  placeholder={`0.00 ${destAccount!.currency}`}
                />
              </>
            )}
          </>
        )}

        {/* Category */}
        {form.type !== 'transfer' && (
          <Select
            label="Category"
            options={categoryOptions}
            value={form.category ?? ''}
            onChange={(e) => setField('category', e.target.value)}
            error={errors.category}
            placeholder="Select category"
          />
        )}

        {/* Date */}
        <Input
          label="Date"
          type="date"
          value={form.date}
          onChange={(e) => setField('date', e.target.value)}
          error={errors.date}
        />

        {/* Note */}
        <Input
          label="Note"
          type="text"
          value={form.note}
          onChange={(e) => setField('note', e.target.value)}
          placeholder="Optional note"
          maxLength={500}
        />

        {/* Travel toggle */}
        <div className="add-tx-form__travel-row">
          <label className="add-tx-form__toggle-label">
            <input
              type="checkbox"
              checked={form.isTravel}
              onChange={(e) => setField('isTravel', e.target.checked)}
              className="add-tx-form__toggle"
            />
            <span>Travelling</span>
          </label>
        </div>

        {/* Trip selector (visible when travel) */}
        {form.isTravel && (
          <Select
            label="Trip"
            options={tripOptions}
            value={form.trip ?? ''}
            onChange={(e) => setField('trip', e.target.value)}
            error={errors.trip}
            placeholder="Select trip"
          />
        )}
      </form>
    </Dialog>
  )
}
