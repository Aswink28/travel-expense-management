import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import ThemeSwitcher from './ThemeSwitcher'
import BgSlider from './BgSlider'
import imgFlight from '../../assets/modes/flight.jpg'
import imgTrain  from '../../assets/modes/train.jpg'
import imgHotel  from '../../assets/modes/hotel.jpg'
import imgCab    from '../../assets/modes/cab.jpg'

const BG_IMAGES = [imgFlight, imgTrain, imgHotel, imgCab]

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
    <div className="login-page">
      {/* Sliding travel image carousel */}
      <BgSlider images={BG_IMAGES} interval={7000} className="bgslider--login" />

      {/* Theme switcher */}
      <div className="login-cosmic-theme-switch">
        <ThemeSwitcher compact />
      </div>

      <div className="login-cosmic-page">
        <div className="login-cosmic-shell">

          {/* LEFT — Hero side */}
          <div className="login-hero">
            <span className="login-hero-badge">
              <span className="login-hero-badge-dot" />
              Corporate Travel Portal
            </span>

            <h1 className="login-hero-title">
              Travel Smart.<br />
              Spend <span className="gradient-word">Smarter.</span>
            </h1>

            <p className="login-hero-subtitle">
              The all-in-one corporate travel &amp; expense platform.
              Book flights, trains, hotels and cabs — all in one secure portal.
            </p>

            {/* Travel mode icons */}
            <div className="login-icon-row">
              {[
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 4.3 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.5-.6.4-1.1z"/></svg>, label: 'Flights' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>, label: 'Trains' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 7v14M21 7v14M6 11h4v4H6zM14 11h4v4h-4zM6 7h12V4a1 1 0 00-1-1H7a1 1 0 00-1 1v3z"/></svg>, label: 'Hotels' },
                { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a4 4 0 014-4h10a4 4 0 014 4v6a2 2 0 01-2 2M5 17l-1 3h2M19 17l1 3h-2M8 13h.01M16 13h.01"/></svg>, label: 'Cabs' },
              ].map(m => (
                <div key={m.label} className="login-icon-pill" title={m.label}>
                  {m.icon}
                </div>
              ))}
            </div>

            {/* Trust bar */}
            <div className="login-trust-bar">
              <div className="login-trust-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Enterprise-grade security</span>
              </div>
              <div className="login-trust-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span>SOC 2 compliant</span>
              </div>
            </div>
          </div>

          {/* RIGHT — Login Card */}
          <div className="login-glass-card">
            <div className="login-card-header">
              <h1 className="login-card-title">Welcome back</h1>
              <p className="login-card-subtitle">Sign in to your corporate travel portal</p>
            </div>

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
                  &#x2715; {error}
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
                  <>
                    <span>Sign In</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </>
                )}
              </button>
            </form>

            {/* Support */}
            <div className="login-support">
              Having trouble? <a>Contact support</a>
            </div>

            {/* Demo accounts */}
            <div className="login-demo-row">
              <div className="login-demo-label">Quick access &mdash; Demo accounts</div>
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
    </div>
  )
}
