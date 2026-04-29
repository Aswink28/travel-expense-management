import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import ThemeSwitcher from './ThemeSwitcher'

const DEMO = [
  { name: 'Rohan Kapoor',   email: 'rohan.kapoor@company.in', role: 'Employee',         designation: 'SE',      color: '#5BAEFF', avatar: 'RK', password: 'pass123' },
  { name: 'John Murphy',    email: 'john.murphy@company.in',  role: 'Request Approver', designation: 'TL',      color: '#B868FF', avatar: 'JM', password: 'pass123' },
  { name: 'Priya Mehta',    email: 'priya.mehta@company.in',  role: 'Request Approver', designation: 'Manager', color: 'var(--text-warning)', avatar: 'PM', password: 'pass123' },
  { name: 'Anjali Rao',     email: 'anjali.rao@company.in',   role: 'Finance',          designation: 'Finance', color: 'var(--accent)', avatar: 'AR', password: 'pass123' },
  { name: 'Meena Iyer',     email: 'meena.iyer@company.in',   role: 'Booking Admin',    designation: 'Booking', color: 'var(--purple)', avatar: 'MI', password: 'pass123' },
  { name: 'System Admin',   email: 'admin@company.in',        role: 'Super Admin',      designation: 'Admin',   color: 'var(--accent)', avatar: 'SA', password: 'admin123' },
]

// ── Inline icons (Lucide-style) ──────────────────────────────
const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 5L2 7" />
  </svg>
)

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)


// ── Animated wave background ─────────────────────────────────
const Waves = () => (
  <div className="login-waves">
    {[1, 2, 3, 4].map(i => (
      <div className="login-wave-line" key={i}>
        <svg viewBox="0 0 1200 200" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`waveg${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   style={{ stopColor: 'var(--accent)' }}   stopOpacity="0" />
              <stop offset="50%"  style={{ stopColor: 'var(--accent-2)' }} stopOpacity="0.7" />
              <stop offset="100%" style={{ stopColor: 'var(--accent)' }}   stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={
              i === 1 ? 'M 0 100 Q 300 20  600 100 T 1200 100' :
              i === 2 ? 'M 0 80  Q 400 160 800 80  T 1600 80'  :
              i === 3 ? 'M 0 120 Q 350 60  700 120 T 1400 120' :
                        'M 0 90  Q 450 170 900 90  T 1800 90'
            }
            fill="none"
            stroke={`url(#waveg${i})`}
            strokeWidth="1.5"
          />
        </svg>
      </div>
    ))}
  </div>
)

export default function LoginPage() {
  const { login, error, setError } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [showPwd,  setShowPwd]  = useState(false)
  const [remember, setRemember] = useState(true)

  function pick(u) { setSelected(u); setEmail(u.email); setPassword(u.password); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await login(email, password)
    setLoading(false)
  }

  return (
    <>
      {/* Cosmic background layers */}
      <div className="login-cosmic" />
      <div className="login-stars" />
      <Waves />

      {/* Theme switcher */}
      <div className="login-cosmic-theme-switch">
        <ThemeSwitcher compact />
      </div>

      <div className="login-cosmic-page">
        <div className="login-cosmic-shell">

          {/* LEFT — Simple Hero */}
          <div className="login-hero">
            <span className="login-hero-badge">
              <span className="login-hero-badge-dot" />
              Corporate Portal
            </span>

            <h1 className="login-hero-title">
              Travel Smart.<br />
              Spend <span className="gradient-word">Smarter.</span>
            </h1>

            <p className="login-hero-subtitle">
              The all-in-one corporate travel & expense platform.
              Book flights, trains, hotels and buses — all in one secure portal.
            </p>

            {/* 4 travel icons in one row */}
            <div className="login-icon-row">
              <div className="login-icon-pill">✈</div>
              <div className="login-icon-pill">🚆</div>
              <div className="login-icon-pill">🏨</div>
              <div className="login-icon-pill">🚌</div>
            </div>
          </div>

          {/* RIGHT — Login Card */}
          <div className="login-glass-card">
            <h1 className="login-card-title">Corporate Expense<br />Management</h1>
            <p className="login-card-subtitle">Please sign in to access the admin portal.</p>

            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div className="login-input-wrap">
                <span className="login-input-icon"><MailIcon /></span>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder="admin@example.com"
                  required
                  className="login-cosmic-input"
                />
              </div>

              {/* Password */}
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="Enter your password"
                  required
                  className="login-cosmic-input"
                  style={{ paddingRight: 46 }}
                />
                <button
                  type="button"
                  className="login-pwd-toggle"
                  onClick={() => setShowPwd(v => !v)}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {/* Remember + Forgot */}
              <div className="login-options-row">
                <label className="login-remember">
                  <input
                    type="checkbox"
                    className="login-checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                  />
                  Remember me
                </label>
                <button type="button" className="login-forgot">Forgot password?</button>
              </div>

              {/* Error */}
              {error && (
                <div className="fade-up login-cosmic-error">
                  ✕ {error}
                </div>
              )}

              {/* Submit */}
              <button type="submit" className="login-cosmic-submit" disabled={loading}>
                {loading ? (
                  <>
                    <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>

            {/* Support */}
            <div className="login-support">
              Having trouble? <a>Contact support</a>
            </div>

            {/* Demo accounts */}
            <div className="login-demo-row">
              <div className="login-demo-label">Demo accounts</div>
              {DEMO.map(u => (
                <button
                  key={u.email}
                  type="button"
                  className="login-demo-chip"
                  onClick={() => pick(u)}
                  style={{
                    borderColor: selected?.email === u.email ? `color-mix(in srgb, ${u.color} 67%, transparent)` : `color-mix(in srgb, ${u.color} 33%, transparent)`,
                    color: u.color,
                    boxShadow: selected?.email === u.email ? `0 0 14px ${u.color}66` : 'none',
                  }}
                >
                  {u.designation || u.role}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
