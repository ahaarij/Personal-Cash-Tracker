import { describe, it, expect } from 'vitest'
import {
  calculateAccountBalance,
  buildCurrencyGroups,
  summarizeByCategory,
  summarizeByTrip,
  validateTransferPair,
} from './balance'
import type { Account, Transaction } from '@/types'

/* ─── Test fixtures ──────────────────────────────────────────────────────── */

const baseAccount = (overrides: Partial<Account>): Account => ({
  id: 'acc-1',
  owner: 'user-1',
  name: 'Test Account',
  type: 'cash',
  currency: 'AED',
  opening_balance: 0,
  archived: false,
  sort_order: 0,
  created: '2024-01-01T00:00:00Z',
  updated: '2024-01-01T00:00:00Z',
  ...overrides,
})

const baseTx = (overrides: Partial<Transaction>): Transaction => ({
  id: `tx-${Math.random().toString(36).slice(2)}`,
  owner: 'user-1',
  date: '2024-01-15',
  amount: 100,
  account: 'acc-1',
  type: 'expense',
  note: '',
  client_id: 'client-id',
  deleted: false,
  created: '2024-01-15T10:00:00Z',
  updated: '2024-01-15T10:00:00Z',
  ...overrides,
})

/* ─── Cash account tests ─────────────────────────────────────────────────── */

describe('calculateAccountBalance — cash', () => {
  it('returns opening_balance when no transactions', () => {
    const account = baseAccount({ opening_balance: 1000_00 })
    expect(calculateAccountBalance(account, []).balance).toBe(1000_00)
  })

  it('adds income to opening balance', () => {
    const account = baseAccount({ opening_balance: 500_00 })
    const tx = baseTx({ type: 'income', amount: 200_00 })
    expect(calculateAccountBalance(account, [tx]).balance).toBe(700_00)
  })

  it('subtracts expense from opening balance', () => {
    const account = baseAccount({ opening_balance: 500_00 })
    const tx = baseTx({ type: 'expense', amount: 150_00 })
    expect(calculateAccountBalance(account, [tx]).balance).toBe(350_00)
  })

  it('handles negative balance (overdraft)', () => {
    const account = baseAccount({ opening_balance: 100_00 })
    const tx = baseTx({ type: 'expense', amount: 300_00 })
    expect(calculateAccountBalance(account, [tx]).balance).toBe(-200_00)
  })

  it('handles transfer out', () => {
    const account = baseAccount({ opening_balance: 1000_00 })
    const tx = baseTx({
      type: 'transfer',
      transfer_direction: 'out',
      amount: 300_00,
    })
    expect(calculateAccountBalance(account, [tx]).balance).toBe(700_00)
  })

  it('handles transfer in', () => {
    const account = baseAccount({ opening_balance: 500_00 })
    const tx = baseTx({
      type: 'transfer',
      transfer_direction: 'in',
      amount: 200_00,
    })
    expect(calculateAccountBalance(account, [tx]).balance).toBe(700_00)
  })

  it('ignores soft-deleted transactions', () => {
    const account = baseAccount({ opening_balance: 500_00 })
    const tx = baseTx({ type: 'expense', amount: 200_00, deleted: true })
    expect(calculateAccountBalance(account, [tx]).balance).toBe(500_00)
  })

  it('ignores transactions for different accounts', () => {
    const account = baseAccount({ opening_balance: 500_00 })
    const tx = baseTx({ account: 'acc-other', type: 'expense', amount: 200_00 })
    expect(calculateAccountBalance(account, [tx]).balance).toBe(500_00)
  })

  it('accumulates multiple transactions correctly', () => {
    const account = baseAccount({ opening_balance: 1000_00 })
    const txs = [
      baseTx({ type: 'expense', amount: 250_00 }),
      baseTx({ type: 'income', amount: 500_00 }),
      baseTx({ type: 'expense', amount: 100_00 }),
      baseTx({ type: 'transfer', transfer_direction: 'out', amount: 200_00 }),
    ]
    // 1000 - 250 + 500 - 100 - 200 = 950
    expect(calculateAccountBalance(account, txs).balance).toBe(950_00)
  })
})

/* ─── Credit card tests ──────────────────────────────────────────────────── */

describe('calculateAccountBalance — credit card', () => {
  const creditAccount = baseAccount({
    type: 'credit_card',
    opening_balance: 0,
    opening_utilized: 0,
    credit_limit: 10_000_00,
  })

  it('starts at zero utilized when opening_utilized is 0', () => {
    const result = calculateAccountBalance(creditAccount, [])
    expect(result.balance).toBe(0)
    expect(result.remaining).toBe(10_000_00)
  })

  it('adds expense to utilized', () => {
    const tx = baseTx({ type: 'expense', amount: 3_200_00 })
    const result = calculateAccountBalance(creditAccount, [tx])
    expect(result.balance).toBe(3_200_00)
    expect(result.remaining).toBe(6_800_00)
  })

  it('subtracts payment (transfer in) from utilized', () => {
    const expense = baseTx({ type: 'expense', amount: 5_000_00 })
    const payment = baseTx({
      type: 'transfer',
      transfer_direction: 'in',
      amount: 2_000_00,
    })
    const result = calculateAccountBalance(creditAccount, [expense, payment])
    expect(result.balance).toBe(3_000_00)
    expect(result.remaining).toBe(7_000_00)
  })

  it('handles full payment (over-payment clamps to zero)', () => {
    const expense = baseTx({ type: 'expense', amount: 1_000_00 })
    const payment = baseTx({
      type: 'transfer',
      transfer_direction: 'in',
      amount: 1_500_00,
    })
    const result = calculateAccountBalance(creditAccount, [expense, payment])
    expect(result.balance).toBe(0) // clamped, not negative
    expect(result.remaining).toBe(10_000_00)
  })

  it('handles cash advance (transfer out) as increasing utilized', () => {
    const advance = baseTx({
      type: 'transfer',
      transfer_direction: 'out',
      amount: 500_00,
    })
    const result = calculateAccountBalance(creditAccount, [advance])
    expect(result.balance).toBe(500_00)
    expect(result.remaining).toBe(9_500_00)
  })

  it('shows correct utilization display values (e.g. 3200/10000)', () => {
    const tx = baseTx({ type: 'expense', amount: 3_200_00 })
    const result = calculateAccountBalance(creditAccount, [tx])
    // Display: utilized = 3200, limit = 10000
    expect(result.balance).toBe(3_200_00)
    expect(result.account.credit_limit).toBe(10_000_00)
  })

  it('uses opening_utilized from pre-existing balance', () => {
    const account = baseAccount({
      type: 'credit_card',
      opening_balance: 2_000_00,
      opening_utilized: 2_000_00,
      credit_limit: 10_000_00,
    })
    const result = calculateAccountBalance(account, [])
    expect(result.balance).toBe(2_000_00)
    expect(result.remaining).toBe(8_000_00)
  })

  it('refund (income) reduces utilized', () => {
    const expense = baseTx({ type: 'expense', amount: 1_000_00 })
    const refund = baseTx({ type: 'income', amount: 200_00 })
    const result = calculateAccountBalance(creditAccount, [expense, refund])
    expect(result.balance).toBe(800_00)
    expect(result.remaining).toBe(9_200_00)
  })

  it('ignores deleted transactions', () => {
    const tx = baseTx({ type: 'expense', amount: 5_000_00, deleted: true })
    const result = calculateAccountBalance(creditAccount, [tx])
    expect(result.balance).toBe(0)
    expect(result.remaining).toBe(10_000_00)
  })
})

/* ─── Debit card tests ───────────────────────────────────────────────────── */

describe('calculateAccountBalance — debit card', () => {
  it('works identically to cash', () => {
    const account = baseAccount({ type: 'debit_card', opening_balance: 2_000_00 })
    const txs = [
      baseTx({ type: 'expense', amount: 500_00 }),
      baseTx({ type: 'income', amount: 1_000_00 }),
    ]
    expect(calculateAccountBalance(account, txs).balance).toBe(2_500_00)
  })
})

/* ─── Multi-account / multi-currency ────────────────────────────────────── */

describe('buildCurrencyGroups', () => {
  it('groups accounts by currency and type', () => {
    const accounts: Account[] = [
      baseAccount({ id: 'a1', currency: 'AED', type: 'cash', opening_balance: 500_00 }),
      baseAccount({ id: 'a2', currency: 'AED', type: 'credit_card', opening_balance: 0, opening_utilized: 0, credit_limit: 5_000_00 }),
      baseAccount({ id: 'a3', currency: 'USD', type: 'debit_card', opening_balance: 100_00 }),
    ]
    const groups = buildCurrencyGroups(accounts, [], ['AED', 'USD'])
    expect(groups).toHaveLength(2)
    const aed = groups.find((g) => g.currency === 'AED')!
    expect(aed.cash).toHaveLength(1)
    expect(aed.credit_cards).toHaveLength(1)
    expect(aed.debit_cards).toHaveLength(0)
    const usd = groups.find((g) => g.currency === 'USD')!
    expect(usd.debit_cards).toHaveLength(1)
  })

  it('excludes archived accounts', () => {
    const accounts: Account[] = [
      baseAccount({ id: 'a1', currency: 'AED', type: 'cash', opening_balance: 100_00, archived: false }),
      baseAccount({ id: 'a2', currency: 'AED', type: 'cash', opening_balance: 200_00, archived: true }),
    ]
    const groups = buildCurrencyGroups(accounts, [], ['AED'])
    expect(groups[0].cash).toHaveLength(1)
    expect(groups[0].cash[0].account.id).toBe('a1')
  })

  it('transactions affect correct account balances', () => {
    const accounts: Account[] = [
      baseAccount({ id: 'a1', currency: 'AED', type: 'cash', opening_balance: 1_000_00 }),
    ]
    const txs: Transaction[] = [
      baseTx({ account: 'a1', type: 'expense', amount: 300_00 }),
    ]
    const groups = buildCurrencyGroups(accounts, txs, ['AED'])
    expect(groups[0].cash[0].balance).toBe(700_00)
  })
})

/* ─── Transfer validation ────────────────────────────────────────────────── */

describe('validateTransferPair', () => {
  const pairId = 'pair-uuid-1'

  const outLeg = baseTx({
    id: 'tx-out',
    account: 'acc-1',
    type: 'transfer',
    transfer_direction: 'out',
    transfer_pair_id: pairId,
    amount: 1_000_00,
  })

  const inLeg = baseTx({
    id: 'tx-in',
    account: 'acc-2',
    type: 'transfer',
    transfer_direction: 'in',
    transfer_pair_id: pairId,
    amount: 1_000_00,
  })

  it('validates a correct pair', () => {
    expect(validateTransferPair(outLeg, inLeg).valid).toBe(true)
  })

  it('rejects mismatched pair IDs', () => {
    const result = validateTransferPair(outLeg, { ...inLeg, transfer_pair_id: 'other' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('pair_id')
  })

  it('rejects wrong directions', () => {
    const result = validateTransferPair(outLeg, { ...inLeg, transfer_direction: 'out' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('direction')
  })

  it('rejects same source and destination account', () => {
    const result = validateTransferPair(outLeg, { ...inLeg, account: 'acc-1' })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('same account')
  })

  it('rejects mismatched amounts', () => {
    const result = validateTransferPair(outLeg, { ...inLeg, amount: 999_00 })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('amounts')
  })
})

/* ─── Category summarization ─────────────────────────────────────────────── */

describe('summarizeByCategory', () => {
  it('sums expenses by category', () => {
    const txs: Transaction[] = [
      baseTx({ type: 'expense', amount: 200_00, category: 'cat-food' }),
      baseTx({ type: 'expense', amount: 150_00, category: 'cat-food' }),
      baseTx({ type: 'expense', amount: 300_00, category: 'cat-transport' }),
    ]
    const summary = summarizeByCategory(txs)
    expect(summary.get('cat-food')).toBe(350_00)
    expect(summary.get('cat-transport')).toBe(300_00)
  })

  it('excludes transfers', () => {
    const txs: Transaction[] = [
      baseTx({ type: 'transfer', transfer_direction: 'out', amount: 500_00 }),
    ]
    const summary = summarizeByCategory(txs)
    expect(summary.size).toBe(0)
  })

  it('excludes soft-deleted transactions', () => {
    const txs: Transaction[] = [
      baseTx({ type: 'expense', amount: 500_00, category: 'cat-food', deleted: true }),
    ]
    const summary = summarizeByCategory(txs)
    expect(summary.get('cat-food')).toBeUndefined()
  })
})

/* ─── Trip summarization ─────────────────────────────────────────────────── */

describe('summarizeByTrip', () => {
  it('totals expenses per trip per currency', () => {
    const accounts: Account[] = [
      baseAccount({ id: 'a-aed', currency: 'AED' }),
      baseAccount({ id: 'a-usd', currency: 'USD' }),
    ]
    const txs: Transaction[] = [
      baseTx({ account: 'a-aed', type: 'expense', amount: 1_000_00, trip: 'trip-1' }),
      baseTx({ account: 'a-usd', type: 'expense', amount: 200_00, trip: 'trip-1' }),
      baseTx({ account: 'a-aed', type: 'expense', amount: 500_00, trip: 'trip-2' }),
    ]
    const summary = summarizeByTrip(txs, accounts)
    expect(summary.get('trip-1')?.get('AED')).toBe(1_000_00)
    expect(summary.get('trip-1')?.get('USD')).toBe(200_00)
    expect(summary.get('trip-2')?.get('AED')).toBe(500_00)
  })
})
