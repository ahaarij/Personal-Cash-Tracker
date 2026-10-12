import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { formatAmount } from '@/lib/money'
import type { WalletGroup, Account } from '@/types'
import './WalletCard.css'

interface WalletCardProps {
  wallet: WalletGroup
  hideBalances: boolean
  onPocketClick: (account: Account) => void
}

const TYPE_BADGE: Record<string, string> = {
  debit_card: 'Debit',
  cash: 'Cash',
  credit_card: 'Credit',
}

export function WalletCard({ wallet, hideBalances, onPocketClick }: WalletCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Round to nearest whole dirham — FX totals are approximate (≈ shown in label)
  const aedTotalRounded = wallet.aedTotal != null ? Math.round(wallet.aedTotal / 100) * 100 : null
  const totalDisplay = hideBalances
    ? '••••'
    : aedTotalRounded != null
      ? formatAmount(aedTotalRounded, 'AED')
      : '—'

  return (
    <div className="wallet-card">
      {/* Header row — click to expand/collapse */}
      <button className="wallet-card__header" onClick={() => setExpanded((v) => !v)}>
        <div className="wallet-card__meta">
          <span className="wallet-card__name">{wallet.name}</span>
          <span className="wallet-card__badge">{TYPE_BADGE[wallet.accountType] ?? wallet.accountType}</span>
        </div>
        <div className="wallet-card__totals">
          <div className="wallet-card__aed-label">≈ AED</div>
          <div className="wallet-card__aed-total money">{totalDisplay}</div>
          <div className="wallet-card__expand-hint">
            <span>{wallet.pockets.length} {wallet.pockets.length === 1 ? 'pocket' : 'pockets'}</span>
            <ChevronDown
              size={13}
              strokeWidth={2}
              className={`wallet-card__chevron ${expanded ? 'wallet-card__chevron--up' : ''}`}
            />
          </div>
        </div>
      </button>

      {/* Expanded pocket list */}
      {expanded && (
        <div className="wallet-card__pockets">
          {wallet.pockets.map((pocket) => (
            <button
              key={pocket.account.id}
              className="wallet-card__pocket"
              onClick={() => onPocketClick(pocket.account)}
            >
              <span className="wallet-card__pocket-currency">{pocket.account.currency}</span>
              <span className={`wallet-card__pocket-balance money ${pocket.balance < 0 ? 'money-negative' : ''}`}>
                {hideBalances ? '••••' : formatAmount(pocket.balance, pocket.account.currency)}
              </span>
              {pocket.aedEquivalent != null && pocket.account.currency !== 'AED' && !hideBalances && (
                <span className="wallet-card__pocket-aed">
                  ≈ AED {formatAmount(pocket.aedEquivalent, 'AED')}
                </span>
              )}
              <ChevronRight size={12} strokeWidth={2} className="wallet-card__pocket-arrow" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
