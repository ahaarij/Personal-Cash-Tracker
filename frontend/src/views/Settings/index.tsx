import { useState, useRef } from 'react'
import { APP_VERSION } from '@/lib/version'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, CreditCard, Wallet, Building2, Tag, Plane, Archive, Pencil, Trash2, LogOut, SlidersHorizontal, Sun, Moon, Monitor, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { AddAccount } from '@/components/AddAccount'
import { AddWallet } from '@/components/AddWallet'
import { AddCategory } from '@/components/AddCategory'
import { AddTrip } from '@/components/AddTrip'
import { useConfirmDelete } from '@/hooks/useConfirmDelete'
import { useTheme } from '@/hooks/useTheme'
import { useCurrencyOrder } from '@/hooks/useCurrencyOrder'
import { accounts as accCollection, categories as catCollection, trips as tripsCollection, settings as settingsCollection, signOut } from '@/lib/api'
import type { UserSettings } from '@/types'

const DEFAULT_CURRENCIES = ['AED', 'USD', 'GBP', 'EUR', 'INR', 'SAR', 'QAR', 'PKR']
import { formatDate } from '@/lib/money'
import type { Account, Category, Trip, AccountType } from '@/types'
import './Settings.css'

type Tab = 'accounts' | 'categories' | 'trips' | 'preferences'

const TYPE_ICON: Record<AccountType, typeof CreditCard> = {
  credit_card: CreditCard,
  cash: Wallet,
  debit_card: Building2,
}

const TYPE_LABEL: Record<AccountType, string> = {
  credit_card: 'Credit Card',
  cash: 'Cash',
  debit_card: 'Debit Card',
}

// ── Drag-to-sort currency list (overlay style) ───────────────────────────────

type DragState = {
  fromIdx: number
  insertAt: number   // how many non-dragged rows are above the ghost (0..n-1)
  ghostY: number     // fixed viewport Y for the ghost
  ghostLeft: number
  ghostWidth: number
  rowHeight: number
  pointerStartY: number
  ghostStartY: number
}

function CurrencyDragList({ currencies, onReorder }: {
  currencies: string[]
  onReorder: (from: number, to: number) => void
}) {
  // Ref-based drag state: avoids stale closures in pointer handlers
  const dsRef = useRef<DragState | null>(null)
  // Tick forces re-render when dsRef changes
  const [, setTick] = useState(0)
  const redraw = () => setTick((t) => t + 1)

  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  const ds = dsRef.current
  const ROW_GAP = 2 // matches .settings-list gap: 2px

  // CSS translateY for each row while dragging.
  // The dragged row is invisible (keeps its slot); other rows shift to open/close the gap.
  const getRowTranslate = (idx: number): number => {
    if (!ds || idx === ds.fromIdx) return 0
    const shift = ds.rowHeight + ROW_GAP
    if (idx > ds.fromIdx) return idx <= ds.insertAt ? -shift : 0
    return idx >= ds.insertAt ? shift : 0
  }

  // Count non-dragged rows whose VISUAL midpoint is above the ghost center.
  const findInsertAt = (ghostCenterY: number): number => {
    if (!containerRef.current || !dsRef.current) return 0
    let count = 0
    containerRef.current.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
      if (parseInt(row.dataset.row ?? '', 10) === dsRef.current!.fromIdx) return
      const r = row.getBoundingClientRect()
      if (ghostCenterY > r.top + r.height / 2) count++
    })
    return count
  }

  const onGripDown = (e: React.PointerEvent<HTMLElement>, idx: number) => {
    e.preventDefault()
    const row = rowRefs.current[idx]
    if (!row || !containerRef.current) return
    const rect = row.getBoundingClientRect()
    const cRect = containerRef.current.getBoundingClientRect()
    row.setPointerCapture(e.pointerId)
    dsRef.current = {
      fromIdx: idx,
      insertAt: idx,
      ghostY: rect.top,
      ghostLeft: cRect.left,
      ghostWidth: cRect.width,
      rowHeight: rect.height,
      pointerStartY: e.clientY,
      ghostStartY: rect.top,
    }
    redraw()
  }

  const onGripMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dsRef.current) return
    const { pointerStartY, ghostStartY, rowHeight } = dsRef.current
    const newGhostY = ghostStartY + (e.clientY - pointerStartY)
    dsRef.current = {
      ...dsRef.current,
      ghostY: newGhostY,
      insertAt: findInsertAt(newGhostY + rowHeight / 2),
    }
    redraw()
  }

  const onGripUp = () => {
    if (!dsRef.current) return
    const { fromIdx, insertAt } = dsRef.current
    dsRef.current = null
    redraw()
    if (insertAt !== fromIdx) onReorder(fromIdx, insertAt)
  }

  return (
    <>
      {/* Floating ghost — portaled to body so no ancestor transform affects fixed positioning */}
      {ds && createPortal(
        <div
          className="currency-drag-ghost"
          style={{ top: ds.ghostY, left: ds.ghostLeft, width: ds.ghostWidth, height: ds.rowHeight }}
        >
          <div className="settings-row settings-row--pref settings-currency-row currency-drag-ghost__row">
            <div className="settings-currency-grip">
              <GripVertical size={16} strokeWidth={1.5} />
            </div>
            <div className="settings-row__body">
              <span className="settings-row__name">{currencies[ds.fromIdx]}</span>
              <span className="settings-row__meta">Drag to reorder</span>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div ref={containerRef} className="settings-list">
        {currencies.map((currency, idx) => {
          const isDragging = ds?.fromIdx === idx
          return (
            <div
              key={currency}
              data-row={idx}
              ref={(el) => { rowRefs.current[idx] = el }}
              className={`settings-row settings-row--pref settings-currency-row${isDragging ? ' is-source' : ''}`}
              style={{
                transform: `translateY(${getRowTranslate(idx)}px)`,
                transition: (isDragging || !ds) ? 'none' : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
                visibility: isDragging ? 'hidden' : 'visible',
                willChange: ds ? 'transform' : 'auto',
                cursor: ds ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
              onPointerDown={(e) => onGripDown(e, idx)}
              onPointerMove={onGripMove}
              onPointerUp={onGripUp}
              onPointerCancel={onGripUp}
            >
              <div className="settings-currency-grip">
                <GripVertical size={16} strokeWidth={1.5} />
              </div>
              <div className="settings-row__body">
                <span className="settings-row__name">{currency}</span>
                <span className="settings-row__meta">
                  {idx === 0 ? 'First row' : `Row ${idx + 1}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Main Settings component ───────────────────────────────────────────────────

export function Settings() {
  const [tab, setTab] = useState<Tab>('accounts')
  const [addAccOpen, setAddAccOpen] = useState(false)
  const [addWalletOpen, setAddWalletOpen] = useState(false)
  const [addPocketForWallet, setAddPocketForWallet] = useState<string | undefined>(undefined)
  const [newCurrencyInput, setNewCurrencyInput] = useState('')
  const [editAcc, setEditAcc] = useState<Account | null>(null)
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [addTripOpen, setAddTripOpen] = useState(false)
  const [editTrip, setEditTrip] = useState<Trip | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()
  const { enabled: confirmDelete, toggle: toggleConfirmDelete } = useConfirmDelete()
  const { theme, setTheme } = useTheme()

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: allAccounts, isLoading: accLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accCollection.getFullList<Account>({ sort: 'sort_order,name' }),
  })

  const { data: userSettingsList } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsCollection.getFullList<UserSettings>(),
  })
  const userSettings = userSettingsList?.[0]
  const enabledCurrencies: string[] = userSettings?.enabled_currencies?.length
    ? userSettings.enabled_currencies
    : DEFAULT_CURRENCIES

  const { data: allCategories, isLoading: catLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => catCollection.getFullList<Category>({ filter: 'archived=false', sort: 'name' }),
  })

  const { data: allTrips, isLoading: tripLoading } = useQuery({
    queryKey: ['trips'],
    queryFn: () => tripsCollection.getFullList<Trip>({ sort: '-start_date' }),
  })

  const knownCurrencies = [...new Set((allAccounts ?? []).filter((a) => !a.archived).map((a) => a.currency))]
  const { orderedCurrencies, reorder } = useCurrencyOrder(knownCurrencies)

  // ── Mutations ─────────────────────────────────────────────────────────────

  const archiveAcc = useMutation({
    mutationFn: (acc: Account) => accCollection.update(acc.id, { archived: !acc.archived }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); toast.show({ type: 'success', message: 'Account updated.' }) },
    onError: () => toast.show({ type: 'error', message: 'Could not update account.' }),
  })

  const deleteAcc = useMutation({
    mutationFn: (acc: Account) => accCollection.delete(acc.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); toast.show({ type: 'success', message: 'Account deleted.' }) },
    onError: () => toast.show({ type: 'error', message: 'Could not delete account.' }),
  })

  const deleteCat = useMutation({
    mutationFn: (cat: Category) => catCollection.delete(cat.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['categories'] }); toast.show({ type: 'success', message: 'Category deleted.' }) },
    onError: () => toast.show({ type: 'error', message: 'Could not delete category.' }),
  })

  const deleteTrip = useMutation({
    mutationFn: (trip: Trip) => tripsCollection.delete(trip.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trips'] }); toast.show({ type: 'success', message: 'Trip deleted.' }) },
    onError: () => toast.show({ type: 'error', message: 'Could not delete trip.' }),
  })

  const saveCurrencies = useMutation({
    mutationFn: (currencies: string[]) => settingsCollection.create({ enabled_currencies: currencies } as Partial<UserSettings>),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settings'] }); toast.show({ type: 'success', message: 'Currencies updated.' }) },
    onError: () => toast.show({ type: 'error', message: 'Could not save currencies.' }),
  })

  const existingWallets = [...new Set((allAccounts ?? []).filter((a) => a.wallet).map((a) => a.wallet!))]

  const handleSignOut = async () => {
    await signOut()
    window.location.href = '/sign-in'
  }

  // ── Accounts tab ──────────────────────────────────────────────────────────

  const active = (allAccounts ?? []).filter((a) => !a.archived)
  const archived = (allAccounts ?? []).filter((a) => a.archived)

  function AccountRow({ acc }: { acc: Account }) {
    const Icon = TYPE_ICON[acc.type]
    return (
      <div className={`settings-row ${acc.archived ? 'settings-row--archived' : ''}`}>
        <div className="settings-row__icon">
          <Icon size={16} strokeWidth={1.5} />
        </div>
        <div className="settings-row__body">
          <span className="settings-row__name">{acc.name}</span>
          <span className="settings-row__meta">{TYPE_LABEL[acc.type]} · {acc.currency}{acc.wallet ? ` · ${acc.wallet}` : ''}</span>
        </div>
        <div className="settings-row__actions">
          {!acc.archived && (
            <button
              className="settings-row__icon-btn"
              title="Edit"
              onClick={() => { setEditAcc(acc); setAddAccOpen(true) }}
            >
              <Pencil size={14} strokeWidth={1.5} />
            </button>
          )}
          <button
            className="settings-row__icon-btn"
            title={acc.archived ? 'Unarchive' : 'Archive'}
            onClick={() => archiveAcc.mutate(acc)}
          >
            <Archive size={14} strokeWidth={1.5} />
          </button>
          {acc.archived && (
            <button
              className="settings-row__icon-btn settings-row__icon-btn--danger"
              title="Delete permanently"
              onClick={() => { if (window.confirm(`Permanently delete "${acc.name}"? This cannot be undone.`)) deleteAcc.mutate(acc) }}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Settings</h1>
        <button className="settings-signout" onClick={handleSignOut}>
          <LogOut size={15} strokeWidth={1.5} />
          <span>Sign out</span>
        </button>
      </div>

      {/* Tab bar */}
      <div className="settings-tabs" role="tablist">
        {(['accounts', 'categories', 'trips', 'preferences'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`settings-tab ${tab === t ? 'settings-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Accounts ────────────────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Bank accounts &amp; cards</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => { setAddPocketForWallet(undefined); setAddWalletOpen(true) }}
              >
                Add wallet
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={() => { setEditAcc(null); setAddAccOpen(true) }}
              >
                Add account
              </Button>
            </div>
          </div>

          {accLoading && <div className="settings-loading">Loading…</div>}

          {!accLoading && active.length === 0 && (
            <div className="settings-empty">
              <CreditCard size={32} strokeWidth={1} />
              <p>No accounts yet. Add your first bank card or cash wallet.</p>
            </div>
          )}

          {active.length > 0 && (() => {
            const walletMap = new Map<string, Account[]>()
            const standalone: Account[] = []
            for (const acc of active) {
              if (acc.wallet) {
                const list = walletMap.get(acc.wallet) ?? []
                list.push(acc)
                walletMap.set(acc.wallet, list)
              } else {
                standalone.push(acc)
              }
            }
            return (
              <>
                {[...walletMap.entries()].map(([walletName, accs]) => (
                  <div key={walletName}>
                    <div className="settings-section__subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{walletName}</span>
                      <button
                        className="settings-row__icon-btn"
                        title="Add currency pocket"
                        onClick={() => { setAddPocketForWallet(walletName); setAddWalletOpen(true) }}
                      >
                        <Plus size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                    <div className="settings-list">
                      {accs.map((acc) => <AccountRow key={acc.id} acc={acc} />)}
                    </div>
                  </div>
                ))}
                {standalone.length > 0 && (
                  <div className="settings-list" style={{ marginTop: walletMap.size > 0 ? '12px' : 0 }}>
                    {standalone.map((acc) => <AccountRow key={acc.id} acc={acc} />)}
                  </div>
                )}
              </>
            )
          })()}

          {archived.length > 0 && (
            <>
              <div className="settings-section__subtitle">Archived</div>
              <div className="settings-list settings-list--muted">
                {archived.map((acc) => <AccountRow key={acc.id} acc={acc} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Categories ──────────────────────────────────────────────────── */}
      {tab === 'categories' && (
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Categories</h2>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => { setEditCat(null); setAddCatOpen(true) }}
            >
              Add category
            </Button>
          </div>

          {catLoading && <div className="settings-loading">Loading…</div>}

          {!catLoading && (allCategories ?? []).length === 0 && (
            <div className="settings-empty">
              <Tag size={32} strokeWidth={1} />
              <p>No categories yet. Add some to organise your expenses.</p>
            </div>
          )}

          {(allCategories ?? []).length > 0 && (
            <div className="settings-list">
              {(allCategories ?? []).map((cat) => (
                <div key={cat.id} className="settings-row">
                  <div
                    className="settings-row__colour-dot"
                    style={{ background: `var(${cat.colour}, #9B9088)` }}
                  />
                  <div className="settings-row__body">
                    <span className="settings-row__name">{cat.name}</span>
                  </div>
                  <div className="settings-row__actions">
                    <button
                      className="settings-row__icon-btn"
                      title="Edit"
                      onClick={() => { setEditCat(cat); setAddCatOpen(true) }}
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      className="settings-row__icon-btn settings-row__icon-btn--danger"
                      title="Delete"
                      onClick={() => deleteCat.mutate(cat)}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Trips ───────────────────────────────────────────────────────── */}
      {tab === 'trips' && (
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Trips</h2>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => { setEditTrip(null); setAddTripOpen(true) }}
            >
              Add trip
            </Button>
          </div>

          {tripLoading && <div className="settings-loading">Loading…</div>}

          {!tripLoading && (allTrips ?? []).length === 0 && (
            <div className="settings-empty">
              <Plane size={32} strokeWidth={1} />
              <p>No trips yet. Add a trip to track travel expenses separately.</p>
            </div>
          )}

          {(allTrips ?? []).length > 0 && (
            <div className="settings-list">
              {(allTrips ?? []).map((trip) => (
                <div key={trip.id} className="settings-row">
                  <div className="settings-row__icon">
                    <Plane size={16} strokeWidth={1.5} />
                  </div>
                  <div className="settings-row__body">
                    <span className="settings-row__name">{trip.name}</span>
                    <span className="settings-row__meta">
                      {formatDate(trip.start_date)} – {formatDate(trip.end_date)}
                    </span>
                  </div>
                  <div className="settings-row__actions">
                    <button
                      className="settings-row__icon-btn"
                      title="Edit"
                      onClick={() => { setEditTrip(trip); setAddTripOpen(true) }}
                    >
                      <Pencil size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      className="settings-row__icon-btn settings-row__icon-btn--danger"
                      title="Delete"
                      onClick={() => deleteTrip.mutate(trip)}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Preferences ─────────────────────────────────────────────────── */}
      {tab === 'preferences' && (
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Preferences</h2>
          </div>
          <div className="settings-list">
            {/* Theme */}
            <div className="settings-row settings-row--pref">
              <div className="settings-row__icon">
                <Monitor size={16} strokeWidth={1.5} />
              </div>
              <div className="settings-row__body">
                <span className="settings-row__name">Appearance</span>
                <span className="settings-row__meta">Choose light, dark, or follow system</span>
              </div>
              <div className="settings-theme-picker">
                {([
                  { value: 'light',  Icon: Sun,     label: 'Light'  },
                  { value: 'system', Icon: Monitor,  label: 'System' },
                  { value: 'dark',   Icon: Moon,    label: 'Dark'   },
                ] as const).map(({ value, Icon, label }) => (
                  <button
                    key={value}
                    title={label}
                    aria-label={label}
                    aria-pressed={theme === value}
                    className={`settings-theme-btn ${theme === value ? 'settings-theme-btn--active' : ''}`}
                    onClick={() => setTheme(value)}
                  >
                    <Icon size={15} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </div>

            {/* Confirm delete */}
            <div className="settings-row settings-row--pref">
              <div className="settings-row__icon">
                <SlidersHorizontal size={16} strokeWidth={1.5} />
              </div>
              <div className="settings-row__body">
                <span className="settings-row__name">Confirm before deleting</span>
                <span className="settings-row__meta">Tap the delete icon twice to confirm</span>
              </div>
              <button
                role="switch"
                aria-checked={confirmDelete}
                className={`settings-toggle ${confirmDelete ? 'settings-toggle--on' : ''}`}
                onClick={toggleConfirmDelete}
              />
            </div>
          </div>

          {/* Currency order — only shown when there are 2+ currencies */}
          {orderedCurrencies.length > 1 && (
            <>
              <div className="settings-section__subtitle">Currency order on master sheet</div>
              <CurrencyDragList currencies={orderedCurrencies} onReorder={reorder} />
            </>
          )}

          {/* Currency management */}
          <div className="settings-section__subtitle" style={{ marginTop: '24px' }}>Currencies</div>
          <div className="settings-list">
            {enabledCurrencies.map((c) => (
              <div key={c} className="settings-row settings-row--pref">
                <div className="settings-row__body"><span className="settings-row__name">{c}</span></div>
                <div className="settings-row__actions">
                  <button
                    className="settings-row__icon-btn settings-row__icon-btn--danger"
                    title="Remove"
                    onClick={() => saveCurrencies.mutate(enabledCurrencies.filter((x) => x !== c))}
                    disabled={enabledCurrencies.length <= 1}
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              type="text"
              value={newCurrencyInput}
              onChange={(e) => setNewCurrencyInput(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="e.g. THB"
              maxLength={5}
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '14px' }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const c = newCurrencyInput.trim().toUpperCase()
                if (c && !enabledCurrencies.includes(c)) {
                  saveCurrencies.mutate([...enabledCurrencies, c])
                  setNewCurrencyInput('')
                }
              }}
              disabled={!newCurrencyInput.trim() || saveCurrencies.isPending}
            >
              Add
            </Button>
          </div>

          <div style={{ marginTop: '24px', textAlign: 'center', opacity: 0.4, fontSize: '12px' }}>
            Personal Cash Flow v{APP_VERSION}
          </div>
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <AddWallet
        open={addWalletOpen}
        onClose={() => { setAddWalletOpen(false); setAddPocketForWallet(undefined) }}
        availableCurrencies={enabledCurrencies}
        existingWalletName={addPocketForWallet}
      />
      <AddAccount
        open={addAccOpen}
        onClose={() => { setAddAccOpen(false); setEditAcc(null) }}
        initialCurrency={editAcc?.currency ?? 'AED'}
        initialType={editAcc?.type ?? 'cash'}
        editing={editAcc}
        availableCurrencies={enabledCurrencies}
        existingWallets={existingWallets}
      />
      <AddCategory
        open={addCatOpen}
        onClose={() => { setAddCatOpen(false); setEditCat(null) }}
        editing={editCat}
      />
      <AddTrip
        open={addTripOpen}
        onClose={() => { setAddTripOpen(false); setEditTrip(null) }}
        editing={editTrip}
      />
    </div>
  )
}
