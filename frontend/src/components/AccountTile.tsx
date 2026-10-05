import { AlertTriangle, Plus } from 'lucide-react'
import {
  formatAmount,
  utilizationPercent,
  utilizationLevel,
} from '@/lib/money'
import type { AccountBalance, Currency } from '@/types'
import { UtilizationBar } from './UtilizationBar'

interface AccountTileProps {
  balances: AccountBalance[] | undefined
  currency: Currency
  accountType: 'credit_card' | 'cash' | 'debit_card'
  hideBalances: boolean
  onAddAccount: () => void
  onCardClick: (account: import('@/types').Account) => void
}

const TYPE_LABELS: Record<string, string> = {
  credit_card: 'C.C',
  cash: 'Cash',
  debit_card: 'D.C',
}

function CreditCard({ balance, currency, hideBalances, onClick }: { balance: AccountBalance; currency: string; hideBalances: boolean; onClick: () => void }) {
  const limit = balance.account.credit_limit ?? 0
  const pct = utilizationPercent(balance.balance, limit)
  const level = utilizationLevel(pct)
  const isNearLimit = level !== 'ok'
  const remaining = balance.remaining ?? 0

  return (
    <button className={`account-card account-card--credit ${isNearLimit ? `account-card--${level}` : ''}`} onClick={onClick}>
      <div className="account-card__name">
        {balance.account.name}
        {isNearLimit && (
          <AlertTriangle size={11} strokeWidth={2} className={`account-card__warn-icon account-card__warn-icon--${level}`} aria-hidden="true" />
        )}
      </div>
      <div className="account-card__credit-amounts">
        <span className={`account-card__utilized money ${isNearLimit ? `money-${level === 'danger' ? 'negative' : 'warn'}` : ''}`}>
          {hideBalances ? '••••' : formatAmount(balance.balance, currency)}
        </span>
        <span className="account-card__limit-sep"> / </span>
        <span className="account-card__limit money">
          {hideBalances ? '••••' : formatAmount(limit, currency)}
        </span>
      </div>
      <UtilizationBar percent={pct} level={level} hideBalances={hideBalances} />
      <div className="account-card__remaining">
        <span className="account-card__remaining-label">Remaining</span>
        <span className="money">{hideBalances ? '••••' : formatAmount(remaining, currency)}</span>
      </div>
    </button>
  )
}

function SimpleCard({ balance, currency, accountType, hideBalances, onClick }: { balance: AccountBalance; currency: string; accountType: string; hideBalances: boolean; onClick: () => void }) {
  const balLabel = accountType === 'cash' ? 'Cash left' : 'Balance'
  return (
    <button className="account-card account-card--simple" onClick={onClick}>
      <div className="account-card__name">{balance.account.name}</div>
      <div className="account-card__simple-balance">
        <span className="account-card__balance-label">{balLabel}</span>
        <span className={`account-card__balance money ${balance.balance < 0 ? 'money-negative' : ''}`}>
          {hideBalances ? '••••' : formatAmount(balance.balance, currency)}
        </span>
      </div>
    </button>
  )
}

export function AccountTile({
  balances,
  currency,
  accountType,
  hideBalances,
  onAddAccount,
  onCardClick,
}: AccountTileProps) {
  const hasAccounts = balances && balances.length > 0
  const label = TYPE_LABELS[accountType]

  if (!hasAccounts) {
    return (
      <div className="account-tile-col account-tile-col--empty">
        <button
          className="account-tile__add-btn"
          onClick={onAddAccount}
          aria-label={`Add ${label} account for ${currency}`}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>Add</span>
        </button>
      </div>
    )
  }

  return (
    <div className="account-tile-col">
      {balances.map((b) =>
        accountType === 'credit_card'
          ? <CreditCard key={b.account.id} balance={b} currency={currency} hideBalances={hideBalances} onClick={() => onCardClick(b.account)} />
          : <SimpleCard key={b.account.id} balance={b} currency={currency} accountType={accountType} hideBalances={hideBalances} onClick={() => onCardClick(b.account)} />
      )}
      <button
        className="account-tile__add-btn account-tile__add-btn--more"
        onClick={onAddAccount}
        aria-label={`Add another ${label} account for ${currency}`}
      >
        <Plus size={11} strokeWidth={1.5} aria-hidden="true" />
        <span>Add another</span>
      </button>
    </div>
  )
}
