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
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="brand-mark">
          <img src={moiterLogo} alt="Moicorp" />
          <div>
            <div className="brand-text">
              Moi<span className="brand-highlight">corp</span>
            </div>
            <div className="brand-sub">Travel Desk</div>
          </div>
        </div>
        <div className="sidebar-role">{user.role}</div>
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
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              style={isActive ? {
                background: `linear-gradient(90deg, ${accent}22, ${accent}06)`,
                borderLeftColor: accent,
                boxShadow: `inset 0 0 18px ${accent}18, 0 0 0 1px ${accent}25`,
              } : undefined}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
              {hasBadge && <span className="sidebar-badge">{pendingCount}</span>}
            </button>
          )
        })}
      </nav>

      {/* Theme switcher */}
      <div style={{ padding: '12px 12px 0' }}>
        <div className="sidebar-section-label" style={{ marginBottom: 7 }}>Theme</div>
        <ThemeSwitcher compact />
      </div>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div
            className="sidebar-user-avatar"
            style={{
              background: `linear-gradient(135deg, ${accent}33, ${accent}11)`,
              borderColor: `${accent}55`,
              color: accent,
              boxShadow: `0 0 12px ${accent}44`,
            }}
          >
            {user.avatar}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-id" style={{ color: accent }}>{user.empId}</div>
          </div>
        </div>
        <div className="sidebar-status-row">
          <span className="online">● Online</span>
          <button className="sidebar-signout" onClick={logout}>Sign out</button>
        </div>
      </div>
    </aside>
  )
}
