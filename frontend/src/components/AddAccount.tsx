import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { useToast } from './ui/Toast'
import { accounts as accountsCollection } from '@/lib/api'
import { parseAmount, liveFormatAmount, formatAmount } from '@/lib/money'
import type { AccountType, Currency, Account } from '@/types'

interface AddAccountProps {
  open: boolean
  onClose: () => void
  initialCurrency?: Currency
  initialType?: AccountType
  editing?: Account | null
  availableCurrencies?: string[]
  existingWallets?: string[]
}

interface AddAccountForm {
  name: string
  type: AccountType
  currency: string
  openingBalance: string
  creditLimit: string
  openingUtilized: string
  multiCurrency: boolean
  wallet: string
}

const TYPE_OPTIONS = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'debit_card', label: 'Debit Card' },
]


function toDisplayAmount(minor: number | undefined, currency: string): string {
  if (!minor) return ''
  return formatAmount(minor, currency)
}

const DEFAULT_CURRENCIES = ['AED', 'USD', 'GBP', 'EUR', 'INR', 'SAR', 'QAR', 'PKR']

function defaultForm(currency: Currency, type: AccountType, editing?: Account | null): AddAccountForm {
  if (editing) {
    return {
      name: editing.name,
      type: editing.type,
      currency: editing.currency,
      openingBalance: toDisplayAmount(editing.opening_balance, editing.currency),
      creditLimit: toDisplayAmount(editing.credit_limit, editing.currency),
      openingUtilized: toDisplayAmount(editing.opening_utilized, editing.currency),
      multiCurrency: editing.multi_currency ?? false,
      wallet: editing.wallet ?? '',
    }
  }
  return { name: '', type, currency, openingBalance: '', creditLimit: '', openingUtilized: '', multiCurrency: false, wallet: '' }
}

export function AddAccount({ open, onClose, initialCurrency = 'AED', initialType = 'cash', editing, availableCurrencies, existingWallets = [] }: AddAccountProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  const currencyList = availableCurrencies && availableCurrencies.length > 0 ? availableCurrencies : DEFAULT_CURRENCIES
  const CURRENCY_OPTIONS = currencyList.map((c) => ({ value: c, label: c }))

  const [form, setForm] = useState<AddAccountForm>(defaultForm(initialCurrency, initialType, editing))
  const [errors, setErrors] = useState<Partial<Record<keyof AddAccountForm, string>>>({})

  useEffect(() => {
    if (open) {
      setForm(defaultForm(initialCurrency, initialType, editing))
      setErrors({})
    }
  }, [open, initialCurrency, initialType, editing])

  const set = <K extends keyof AddAccountForm>(key: K, value: AddAccountForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = 'Enter an account name.'

    if (form.type === 'credit_card') {
      if (!form.creditLimit) {
        next.creditLimit = 'Enter the credit limit.'
      } else {
        const limit = parseAmount(form.creditLimit, form.currency)
        if (limit === null) next.creditLimit = 'Enter a valid amount.'
        else if (limit <= 0) next.creditLimit = 'Credit limit must be greater than zero.'
      }
      const utilized = parseAmount(form.openingUtilized, form.currency)
      if (form.openingUtilized && utilized === null) next.openingUtilized = 'Enter a valid amount.'
    } else {
      const balance = parseAmount(form.openingBalance, form.currency)
      if (form.openingBalance && balance === null) next.openingBalance = 'Enter a valid amount.'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed')

      const data: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        currency: form.currency,
        multi_currency: form.multiCurrency,
        wallet: form.wallet.trim() || null,
      }

      if (form.type === 'credit_card') {
        data.credit_limit = parseAmount(form.creditLimit, form.currency) ?? 0
        data.opening_utilized = form.openingUtilized ? (parseAmount(form.openingUtilized, form.currency) ?? 0) : 0
        data.opening_balance = 0
      } else {
        data.opening_balance = form.openingBalance ? (parseAmount(form.openingBalance, form.currency) ?? 0) : 0
        data.credit_limit = null
        data.opening_utilized = null
      }

      if (editing) return accountsCollection.update(editing.id, data)
      return accountsCollection.create({ ...data, sort_order: 0 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.show({ type: 'success', message: editing ? 'Account updated.' : 'Account added.' })
      onClose()
    },
    onError: (e: Error) => {
      if (e.message !== 'Validation failed')
        toast.show({ type: 'error', message: 'Could not save account. Try again.' })
    },
  })

  const title = editing ? 'Edit account' : 'Add account'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      variant={isMobile ? 'sheet' : 'modal'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
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
        <Input
          label="Account name"
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          placeholder="e.g. ADCB Credit Card"
          autoFocus
        />

        {/* Wallet/card group — type to create new, or pick existing */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
            Card / Wallet (optional)
          </label>
          <input
            list="wallet-options"
            value={form.wallet}
            onChange={(e) => set('wallet', e.target.value)}
            placeholder="e.g. HSBC Global Money"
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' }}
          />
          <datalist id="wallet-options">
            {existingWallets.map((w) => <option key={w} value={w} />)}
          </datalist>
          <span style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px', display: 'block' }}>
            Group currency pockets under the same card name
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Select
            label="Type"
            options={TYPE_OPTIONS}
            value={form.type}
            onChange={(e) => set('type', e.target.value as AccountType)}
            disabled={!!editing}
          />
          <Select
            label="Currency"
            options={CURRENCY_OPTIONS}
            value={form.currency}
            onChange={(e) => set('currency', e.target.value)}
            disabled={!!editing}
          />
        </div>

        {/* Multi-currency toggle — not for credit cards (could add later) */}
        {form.type !== 'credit_card' && (
          <label className="add-tx-form__toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.multiCurrency}
              onChange={(e) => set('multiCurrency', e.target.checked)}
              className="add-tx-form__toggle"
              disabled={!!editing}
            />
            <span>
              Multi-currency card
              <span style={{ display: 'block', fontSize: '12px', opacity: 0.6, fontWeight: 400 }}>
                Wise, Revolut — spends in any currency, balance in {form.currency}
              </span>
            </span>
          </label>
        )}

        {form.type === 'credit_card' ? (
          <>
            <Input
              label="Credit limit"
              inputMode="decimal"
              type="text"
              value={form.creditLimit}
              onChange={(e) => set('creditLimit', liveFormatAmount(e.target.value, form.currency).formatted)}
              error={errors.creditLimit}
              placeholder="0.00"
            />
            <Input
              label="Already utilized (optional)"
              inputMode="decimal"
              type="text"
              value={form.openingUtilized}
              onChange={(e) => set('openingUtilized', liveFormatAmount(e.target.value, form.currency).formatted)}
              error={errors.openingUtilized}
              placeholder="0.00"
              hint="Balance already on the card when you start tracking."
            />
          </>
        ) : (
          <Input
            label="Opening balance (optional)"
            inputMode="decimal"
            type="text"
            value={form.openingBalance}
            onChange={(e) => set('openingBalance', liveFormatAmount(e.target.value, form.currency).formatted)}
            error={errors.openingBalance}
            placeholder="0.00"
          />
        )}
      </form>
    </Dialog>
  )
}
