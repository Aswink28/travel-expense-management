import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import ThemeSwitcher from './ThemeSwitcher'

const DEMO = [
  { name: 'Arjun Sharma',   email: 'arjun@company.in',  role: 'Employee',      color: '#0A84FF', avatar: 'AS', password: 'pass123' },
  { name: 'Deepa Krishnan', email: 'deepa@company.in',  role: 'Tech Lead',     color: '#BF5AF2', avatar: 'DK', password: 'pass123' },
  { name: 'Ravi Kumar',     email: 'ravi@company.in',   role: 'Manager',       color: '#FF9F0A', avatar: 'RK', password: 'pass123' },
  { name: 'Anil Menon',     email: 'anil@company.in',   role: 'Finance',       color: '#40C8E0', avatar: 'AM', password: 'pass123' },
  { name: 'Meena Iyer',     email: 'meena@company.in',  role: 'Booking Admin', color: '#FF6B6B', avatar: 'MI', password: 'pass123' },
  { name: 'Super Admin',    email: 'admin@company.in',  role: 'Super Admin',   color: '#30D158', avatar: 'SA', password: 'admin123' },
]

export default function LoginPage() {
  const { login, error, setError } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [showPwd,  setShowPwd]  = useState(false)

  function pick(u) { setSelected(u); setEmail(u.email); setPassword(u.password); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await login(email, password)
    setLoading(false)
  }

  return (
    <div className="login-page">
      {/* Animated background glows */}
      <div className="login-bg-glow-1" style={{ position: 'fixed', width: 600, height: 600, borderRadius: '50%', background: 'var(--accent)', filter: 'blur(140px)', opacity: 0.06, top: '-200px', left: '-100px', pointerEvents: 'none' }} />
      <div className="login-bg-glow-2" style={{ position: 'fixed', width: 500, height: 500, borderRadius: '50%', background: 'var(--accent-2)', filter: 'blur(120px)', opacity: 0.05, bottom: '-150px', right: '-100px', pointerEvents: 'none' }} />
      <div className="login-bg-glow-3" style={{ position: 'fixed', width: 400, height: 400, borderRadius: '50%', background: 'var(--purple)', filter: 'blur(110px)', opacity: 0.035, top: '40%', right: '-50px', pointerEvents: 'none' }} />

      {/* Floating particles */}
      <div className="login-particles">
        <span /><span /><span /><span /><span />
        <span /><span /><span /><span /><span />
      </div>

      {/* Theme switcher in corner */}
      <div className="login-theme-switch">
        <ThemeSwitcher compact />
      </div>

      <div className="login-shell login-card">

        {/* Left — role cards */}
        <div className="login-left">
          <div className="login-form-row" style={{ marginBottom: 24 }}>
            <div className="login-brand">
              <span className="login-gradient-text">Travel</span>
              <span className="text-primary">Desk</span>
            </div>
            <div className="login-tagline">Travel & Expense Management v3</div>
          </div>
          <div className="login-form-row login-section-label">Select role to login</div>
          <div className="login-role-list">
            {DEMO.map(u => {
              const isSel = selected?.email === u.email
              return (
                <button
                  key={u.email}
                  onClick={() => pick(u)}
                  className="login-role-card"
                  style={isSel ? {
                    background: `linear-gradient(90deg, ${u.color}25, ${u.color}08)`,
                    borderColor: u.color + '66',
                    transform: 'translateX(4px)',
                    boxShadow: `0 0 24px ${u.color}33, inset 0 0 12px ${u.color}11`,
                  } : undefined}
                >
                  <div
                    className="sidebar-user-avatar"
                    style={{
                      width: 34, height: 34,
                      background: `linear-gradient(135deg, ${u.color}33, ${u.color}11)`,
                      borderColor: u.color + '55',
                      color: u.color,
                      boxShadow: isSel ? `0 0 16px ${u.color}66` : 'none',
                    }}
                  >
                    {u.avatar}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="login-role-name">{u.name}</div>
                    <div className="login-role-title" style={{ color: u.color }}>{u.role}</div>
                  </div>
                  {isSel && (
                    <div
                      style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: u.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: '#000', fontWeight: 700,
                        boxShadow: `0 0 12px ${u.color}`,
                      }}
                    >
                      ✓
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="login-form-row login-hint">
            ✦ Click a role above to auto-fill
          </div>
        </div>

        {/* Right — form */}
        <div className="login-right">
          {selected && (
            <span
              className="login-form-row login-portal-pill"
              style={{
                background: `linear-gradient(135deg, ${selected.color}22, ${selected.color}08)`,
                border: `1px solid ${selected.color}40`,
                color: selected.color,
                boxShadow: `0 0 20px ${selected.color}33`,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: selected.color, boxShadow: `0 0 8px ${selected.color}` }} />
              {selected.role} Portal
            </span>
          )}

          <h1 className="login-form-row login-greeting">
            {selected ? `Hi, ${selected.name.split(' ')[0]}!` : 'Welcome back'}
          </h1>
          <p className="login-form-row login-subtitle">
            {selected ? 'Credentials auto-filled. Click Sign in to continue.' : 'Enter your credentials to continue.'}
          </p>

          <form onSubmit={handleSubmit}>
            <div className="login-form-row field">
              <label className="field-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                placeholder="you@company.in"
                required
                className="login-input"
              />
            </div>
            <div className="login-form-row field" style={{ marginBottom: 22 }}>
              <label className="field-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  required
                  className="login-input"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="login-toggle-pwd">
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div className="fade-up login-error">
                ✕ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-form-row login-submit"
              style={selected ? {
                background: `linear-gradient(135deg, ${selected.color}, ${selected.color}cc)`,
                boxShadow: `0 8px 32px ${selected.color}55, 0 1px 0 rgba(255,255,255,.2) inset`,
              } : undefined}
            >
              {loading ? (
                <>
                  <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                  Signing in...
                </>
              ) : `Sign in${selected ? ` as ${selected.name.split(' ')[0]}` : ''}`}
            </button>
          </form>

          {selected && (
            <div className="fade-up login-credentials-hint">
              <span><span className="text-faint">Email: </span><span className="font-mono text-muted">{selected.email}</span></span>
              <span><span className="text-faint">Pass: </span><span className="font-mono text-muted">{selected.password}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
