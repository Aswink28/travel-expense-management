import { useAuth } from '../../context/AuthContext'
import ThemeSwitcher from './ThemeSwitcher'
import moiterLogo from '../../assets/moiter_workz-logo.png'

/* ──────────────────────────────────────────────────────────────
   Sidebar icons — uniform SVG set keyed by page id.
   Every icon is 18×18, 1.75 stroke, currentColor.  Ignoring the
   icon glyph stored on `item` guarantees visual consistency even
   if the DB still has older emoji icons for some pages.
   ────────────────────────────────────────────────────────────── */
const SvgIcon = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

const NAV_ICONS = {
  'dashboard': (
    <SvgIcon>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </SvgIcon>
  ),
  'my-requests': (
    <SvgIcon>
      <path d="M9 3h6a2 2 0 0 1 2 2v0H7v0a2 2 0 0 1 2-2z" />
      <path d="M7 5H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </SvgIcon>
  ),
  'new-request': (
    <SvgIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </SvgIcon>
  ),
  'approvals': (
    <SvgIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </SvgIcon>
  ),
  'my-wallet': (
    <SvgIcon>
      <path d="M21 12V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1" />
      <path d="M16 13a2 2 0 0 0 0 4h5v-4z" />
      <path d="M3 8V6a2 2 0 0 1 2-2h12" />
    </SvgIcon>
  ),
  'book': (
    <SvgIcon>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.71 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.71A2 2 0 0 1 22 16.92z" />
    </SvgIcon>
  ),
  'my-tickets': (
    <SvgIcon>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M13 7v10" strokeDasharray="2 2" />
    </SvgIcon>
  ),
  'booking-panel': (
    <SvgIcon>
      <circle cx="12" cy="12" r="9" />
      <polygon points="16,8 13,13 8,16 11,11" />
    </SvgIcon>
  ),
  'booking-history': (
    <SvgIcon>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </SvgIcon>
  ),
  'employees': (
    <SvgIcon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </SvgIcon>
  ),
  'roles': (
    <SvgIcon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </SvgIcon>
  ),
  'tiers': (
    <SvgIcon>
      <polygon points="12,2 22,8 12,14 2,8" />
      <polyline points="2,12 12,18 22,12" />
      <polyline points="2,16 12,22 22,16" />
    </SvgIcon>
  ),
  'designations': (
    <SvgIcon>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.4" />
    </SvgIcon>
  ),
  'audit-log': (
    <SvgIcon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <path d="M8 13h8" />
      <path d="M8 17h6" />
      <path d="M8 9h2" />
    </SvgIcon>
  ),
  'transactions': (
    <SvgIcon>
      <path d="M3 7h13l-3-3" />
      <path d="M21 17H8l3 3" />
    </SvgIcon>
  ),
}

const DEFAULT_ICON = (
  <SvgIcon>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="9" />
  </SvgIcon>
)

const FALLBACK_NAV = [{ id: 'dashboard', label: 'Dashboard' }]

/* Defensive title-casing — guarantees every sidebar label renders with a
   capitalised first letter for each word, even if the DB has historical
   labels in mixed or lower case (e.g. "approve audit"). Honours hyphenated
   words and acronyms by only lower-casing letters that aren't already
   first-of-word. */
const toTitleCase = (s) =>
  String(s ?? '')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/(^|\s|\/)([a-z])/g, (_, p, c) => p + c.toUpperCase())

export default function Sidebar({ active, setActive, pendingCount }) {
  const { user, logout } = useAuth()
  if (!user) return null
  const items  = user.pages?.length ? user.pages : FALLBACK_NAV
  const accent = user.color || 'var(--accent)'

  return (
    <aside className="sidebar">
      {/* Logo block — brand on top row, role pill on second row */}
      <div className="sidebar-logo">
        <div className="brand-mark">
          <img src={moiterLogo} alt="Moiter Workz" />
          <div className="brand-text">
            <span className="brand-highlight">
              Moiter <span className="brand-accent">Workz</span>
            </span>
            <span className="brand-sub">Travel Desk</span>
          </div>
        </div>
        <span
          className="sidebar-role-pill"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          {user.role}
        </span>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {items.map(item => {
          const isActive = active === item.id
          const hasBadge = item.id === 'approvals' && pendingCount > 0
          const icon = NAV_ICONS[item.id] || DEFAULT_ICON
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={isActive ? 'active' : ''}
              style={isActive ? {
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                color: accent,
              } : undefined}
            >
              <span className="sidebar-item-icon" aria-hidden="true">{icon}</span>
              <span className="sidebar-item-label">{toTitleCase(item.label)}</span>
              {hasBadge && (
                <span className="sidebar-badge" style={{ background: accent }}>
                  {pendingCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Theme switcher */}
      <div className="sidebar-theme-block">
        <div className="sidebar-section-label">Theme</div>
        <ThemeSwitcher compact />
      </div>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div
            className="sidebar-user-avatar"
            style={{
              background: `color-mix(in srgb, ${accent} 18%, transparent)`,
              color: accent,
            }}
          >
            {user.avatar}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-id" style={{ color: accent }}>{user.empId}</div>
          </div>
        </div>
        <div className="sidebar-status-row">
          <span className="online" />
          <span>Online</span>
        </div>
        <button className="sidebar-signout" onClick={logout}>Sign out</button>
      </div>
    </aside>
  )
}
