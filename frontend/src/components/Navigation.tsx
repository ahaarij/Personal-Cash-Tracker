import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutGrid, Receipt, Globe, Settings } from 'lucide-react'
import { SyncStatus } from './SyncStatus'

const navLinks = [
  { to: '/', icon: LayoutGrid, label: 'Master sheet', exact: true },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/travelling', icon: Globe, label: 'Travelling' },
]

export function Sidebar() {
  const router = useRouterState()
  const currentPath = router.location.pathname

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar__brand">
        <span className="sidebar__brand-name">Cash Flow</span>
      </div>

      <ul className="sidebar__nav" role="list">
        {navLinks.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? currentPath === to : currentPath.startsWith(to)
          return (
            <li key={to}>
              <Link
                to={to}
                className={`sidebar__link ${active ? 'sidebar__link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="sidebar__footer">
        <SyncStatus />
        <Link
          to="/settings"
          className={`sidebar__link ${currentPath.startsWith('/settings') ? 'sidebar__link--active' : ''}`}
          aria-label="Settings"
        >
          <Settings size={18} strokeWidth={1.5} aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </div>
    </nav>
  )
}

export function MobileNav() {
  const router = useRouterState()
  const currentPath = router.location.pathname

  return (
    <nav className="mobile-nav" aria-label="Main navigation">
      {navLinks.map(({ to, icon: Icon, label, exact }) => {
        const active = exact ? currentPath === to : currentPath.startsWith(to)
        return (
          <Link
            key={to}
            to={to}
            className={`mobile-nav__link ${active ? 'mobile-nav__link--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className="mobile-nav__label">{label}</span>
          </Link>
        )
      })}
      <Link
        to="/settings"
        className={`mobile-nav__link ${currentPath.startsWith('/settings') ? 'mobile-nav__link--active' : ''}`}
        aria-label="Settings"
      >
        <Settings size={20} strokeWidth={1.5} aria-hidden="true" />
        <span className="mobile-nav__label">Settings</span>
      </Link>
    </nav>
  )
}
