import { useAuth } from '../../context/AuthContext'
import ThemeSwitcher from './ThemeSwitcher'
import moiterLogo from '../../assets/moiter_workz-logo.png'

const FALLBACK_NAV = [{ id: 'dashboard', label: 'Dashboard', icon: '▦' }]

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
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={isActive ? 'active' : ''}
              style={isActive ? {
                background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                color: accent,
              } : undefined}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
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
