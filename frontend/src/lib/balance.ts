import type { Account, Transaction, AccountBalance, CurrencyGroup } from '@/types'

/**
 * Calculates the running balance for a single account.
 *
 * All amounts are stored as integer minor units (fils, cents, pence, paise).
 * Never use floating-point arithmetic here.
 *
 * Rules:
 *   Cash/Debit: balance = opening_balance + Σ income - Σ expense ± transfers
 *   Credit card: utilized = opening_utilized + Σ expense - Σ inbound_transfers
 *                remaining = credit_limit - utilized
 *
 * Transfer direction convention:
 *   transfer_direction='out' → money leaves this account  (subtract from balance / not applicable to credit)
 *   transfer_direction='in'  → money enters this account  (subtract from utilized on credit; add to balance on cash/debit)
 */
export function calculateAccountBalance(
  account: Account,
  transactions: Transaction[],
): AccountBalance {
  const relevant = transactions.filter(
    (t) => !t.deleted && t.account === account.id,
  )

  if (account.type === 'credit_card') {
    // opening_utilized represents what was already charged at creation time
    const openingUtilized = account.opening_utilized ?? account.opening_balance
    let utilized = openingUtilized

    for (const t of relevant) {
      if (t.type === 'expense') {
        utilized += t.amount
      } else if (t.type === 'income') {
        // Direct income to credit card (refund, cashback, etc.)
        utilized -= t.amount
      } else if (t.type === 'transfer') {
        if (t.transfer_direction === 'in') {
          // Payment into credit card (paying off bill) → reduces utilized
          utilized -= t.amount
        } else if (t.transfer_direction === 'out') {
          // Cash advance out of credit card → increases utilized
          utilized += t.amount
        }
      }
    }

    const limit = account.credit_limit ?? 0
    // If over-paid (utilized < 0), show 0 utilized but add the surplus to remaining
    // so the card shows full available credit including the overpayment buffer
    return {
      account,
      balance: Math.max(0, utilized),
      remaining: limit - utilized,
    }
  } else {
    // Cash and Debit Card
    let balance = account.opening_balance

    for (const t of relevant) {
      if (t.type === 'income') {
        balance += t.amount
      } else if (t.type === 'expense') {
        balance -= t.amount
      } else if (t.type === 'transfer') {
        if (t.transfer_direction === 'out') {
          balance -= t.amount
        } else if (t.transfer_direction === 'in') {
          balance += t.amount
        }
      }
    }

    return { account, balance }
  }
}

/**
 * Groups account balances by currency for the master sheet layout.
 * Filters out archived accounts.
 */
export function buildCurrencyGroups(
  accounts: Account[],
  transactions: Transaction[],
  enabledCurrencies: string[],
): CurrencyGroup[] {
  const txByCurrency = new Map<string, Transaction[]>()

  // Bucket transactions by the account's currency
  for (const tx of transactions) {
    const account = accounts.find((a) => a.id === tx.account)
    if (!account) continue
    const list = txByCurrency.get(account.currency) ?? []
    list.push(tx)
    txByCurrency.set(account.currency, list)
  }

  return enabledCurrencies.map((currency) => {
    const currencyAccounts = accounts.filter(
      (a) => a.currency === currency && !a.archived,
    )
    const currencyTx = transactions // we filter per account inside calculateAccountBalance

    const byType = (type: Account['type']): AccountBalance[] =>
      currencyAccounts
        .filter((a) => a.type === type)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => calculateAccountBalance(a, currencyTx))

    return {
      currency,
      credit_cards: byType('credit_card'),
      cash: byType('cash'),
      debit_cards: byType('debit_card'),
    }
  })
}

/**
 * Calculates per-category spending totals for a filtered set of transactions.
 * Excludes transfers. Returns amounts as minor units, keyed by category id.
 */
export function summarizeByCategory(
  transactions: Transaction[],
): Map<string | undefined, number> {
  const totals = new Map<string | undefined, number>()

  for (const t of transactions) {
    if (t.deleted) continue
    if (t.type === 'transfer') continue
    if (t.type === 'expense') {
      const prev = totals.get(t.category) ?? 0
      totals.set(t.category, prev + t.amount)
    } else if (t.type === 'income') {
      // Show as negative spending (net)
      const prev = totals.get(t.category) ?? 0
      totals.set(t.category, prev - t.amount)
    }
  }

  return totals
}

/**
 * Calculates per-trip totals broken down by currency.
 * Excludes transfers from spending totals.
 */
export function summarizeByTrip(
  transactions: Transaction[],
  accounts: Account[],
): Map<string, Map<string, number>> {
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  // tripId → currency → amount
  const totals = new Map<string, Map<string, number>>()

  for (const t of transactions) {
    if (t.deleted) continue
    if (t.type === 'transfer') continue
    if (!t.trip) continue

    const account = accountById.get(t.account)
    if (!account) continue

    let currencyMap = totals.get(t.trip)
    if (!currencyMap) {
      currencyMap = new Map()
      totals.set(t.trip, currencyMap)
    }

    const prev = currencyMap.get(account.currency) ?? 0
    const delta = t.type === 'expense' ? t.amount : -t.amount
    currencyMap.set(account.currency, prev + delta)
  }

  return totals
}

/**
 * Validates that a transfer creates two paired transactions correctly.
 * Both legs must exist, reference different accounts, have equal amounts,
 * and have matching transfer_pair_id.
 */
export function validateTransferPair(
  out: Transaction,
  inbound: Transaction,
): { valid: boolean; reason?: string } {
  if (out.transfer_pair_id !== inbound.transfer_pair_id) {
    return { valid: false, reason: 'transfer_pair_id mismatch' }
  }
  if (out.transfer_direction !== 'out' || inbound.transfer_direction !== 'in') {
    return { valid: false, reason: 'transfer_direction mismatch' }
  }
  if (out.account === inbound.account) {
    return { valid: false, reason: 'source and destination are the same account' }
  }
  if (out.amount !== inbound.amount) {
    return { valid: false, reason: 'amounts do not match' }
  }
  return { valid: true }
}
