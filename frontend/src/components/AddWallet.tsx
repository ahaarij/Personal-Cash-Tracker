import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from './ui/Dialog'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { useToast } from './ui/Toast'
import { accounts as accountsCollection } from '@/lib/api'
import type { AccountType } from '@/types'

interface AddWalletProps {
  open: boolean
  onClose: () => void
  availableCurrencies: string[]
  /** Pre-fill wallet name when adding a pocket to an existing wallet */
  existingWalletName?: string
}

const TYPE_OPTIONS = [
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'cash', label: 'Cash' },
]

export function AddWallet({ open, onClose, availableCurrencies, existingWalletName }: AddWalletProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const isMobile = window.matchMedia('(max-width: 768px)').matches

  const [walletName, setWalletName] = useState(existingWalletName ?? '')
  const [accountType, setAccountType] = useState<AccountType>('debit_card')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [nameError, setNameError] = useState('')
  const [currError, setCurrError] = useState('')

  const isAddingPocket = !!existingWalletName

  useEffect(() => {
    if (open) {
      setWalletName(existingWalletName ?? '')
      setAccountType('debit_card')
      setSelected(new Set())
      setNameError('')
      setCurrError('')
    }
  }, [open, existingWalletName])

  const toggleCurrency = (c: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
    setCurrError('')
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = walletName.trim()
      if (!name) { setNameError('Enter a card / wallet name.'); throw new Error('validation') }
      if (selected.size === 0) { setCurrError('Pick at least one currency.'); throw new Error('validation') }

      // Create one account per selected currency
      await Promise.all(
        [...selected].map((currency) =>
          accountsCollection.create({
            name: `${name} ${currency}`,
            type: accountType,
            currency,
            opening_balance: 0,
            wallet: name,
            sort_order: 0,
          })
        )
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.show({ type: 'success', message: isAddingPocket ? 'Currency pocket added.' : 'Wallet created.' })
      onClose()
    },
    onError: (e: Error) => {
      if (e.message !== 'validation')
        toast.show({ type: 'error', message: 'Could not save. Try again.' })
    },
  })

  const title = isAddingPocket ? `Add pocket to ${existingWalletName}` : 'Add wallet / multi-currency card'

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
            {isAddingPocket ? 'Add pocket' : 'Create wallet'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {!isAddingPocket && (
          <>
            <Input
              label="Card / Wallet name"
              type="text"
              value={walletName}
              onChange={(e) => { setWalletName(e.target.value); setNameError('') }}
              error={nameError}
              placeholder="e.g. HSBC Global Money"
              autoFocus
            />
            <Select
              label="Account type"
              options={TYPE_OPTIONS}
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
            />
          </>
        )}

        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>
            {isAddingPocket ? 'Select currencies to add' : 'Select currencies'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {availableCurrencies.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCurrency(c)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '100px',
                  border: `1px solid ${selected.has(c) ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: selected.has(c) ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: selected.has(c) ? 'var(--color-accent-text)' : 'var(--color-text)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 120ms, color 120ms, border-color 120ms',
                }}
              >
                {c}
              </button>
            ))}
          </div>
          {currError && (
            <div style={{ fontSize: '12px', color: 'var(--error, #c0392b)', marginTop: '6px' }}>{currError}</div>
          )}
        </div>

        {selected.size > 0 && (
          <div style={{ fontSize: '12px', opacity: 0.55 }}>
            Will create: {[...selected].map((c) => `${walletName.trim() || '…'} ${c}`).join(', ')}
          </div>
        )}
      </div>
    </Dialog>
  )
}
