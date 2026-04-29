import ThemeSwitcher from './ThemeSwitcher'
import { Button } from './UI'
import moiterLogo from '../../assets/moiter_workz-logo.png'

// Inline SVG icon set — no external deps. Stroke uses currentColor so
// each icon picks up the parent .landing-feature-icon's color (var(--accent)).
const Icon = ({ children }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)
const PlaneIcon = () => <Icon><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.71 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.71A2 2 0 0 1 22 16.92z" /></Icon>
const WalletIcon = () => <Icon><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></Icon>
const CheckIcon = () => <Icon><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></Icon>
const FlowIcon = () => <Icon><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="12" cy="20" r="3" /><path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9" /><path d="M12 14v3" /></Icon>
const ChartIcon = () => <Icon><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></Icon>
const ShieldIcon = () => <Icon><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Icon>

const FEATURES = [
  { icon: <PlaneIcon />,  title: 'End-to-end travel',     desc: 'Submit, approve, book and reconcile travel from a single workspace. Flights, trains, hotels, cabs — every leg tracked.' },
  { icon: <WalletIcon />, title: 'Smart wallet loads',    desc: 'Approved budgets land in employee PPI wallets automatically. No reimbursement chase, no out-of-pocket spend.' },
  { icon: <FlowIcon />,   title: 'Tier-driven approvals', desc: 'Map designations to tiers, set approver chains once. The right people see the right requests — no manual routing.' },
  { icon: <CheckIcon />,  title: 'Bulk onboarding',       desc: 'Upload an Excel of new hires; the system creates accounts, wallets, and approval flows in one pass with row-level errors.' },
  { icon: <ChartIcon />,  title: 'Finance-grade reports', desc: 'Real-time budget burn by tier, mode, department. Export anything you see for audit.' },
  { icon: <ShieldIcon />, title: 'Compliant by default',  desc: 'KYC at onboarding, role-scoped access, full audit log of every approver reassignment and financial action.' },
]

const STATS = [
  { value: '60%',  label: 'Faster approval cycles' },
  { value: '12+',  label: 'Travel & wallet workflows' },
  { value: '99.9%', label: 'Wallet load reliability' },
  { value: '0',    label: 'Out-of-pocket reimbursements' },
]

export default function LandingPage({ onSignIn }) {
  return (
    <div className="landing">
      {/* Top nav */}
      <nav className="landing-nav">
        <div className="landing-brand">
          <img src={moiterLogo} alt="Moiter Workz" />
          <span>Moiter <span className="brand-accent">Workz</span></span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#stats">Why us</a>
          <ThemeSwitcher compact />
          <Button onClick={onSignIn}>Sign In</Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div>
          <span className="landing-eyebrow">Corporate Travel & Expense</span>
          <h1 className="landing-headline">
            Travel smart.<br />
            <span className="gradient-word">Spend smarter.</span>
          </h1>
          <p className="landing-sub">
            Moiter Workz Travel Desk replaces the spreadsheet sprawl with one platform —
            travel requests, tier-based approvals, wallet loads, and bookings, all wired
            to your finance flow.
          </p>
          <div className="landing-cta-row">
            <Button onClick={onSignIn} className="btn-lg">Sign in to dashboard</Button>
            <a href="#features" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" className="btn-lg">See how it works</Button>
            </a>
          </div>
          <div className="landing-trust">
            <span className="landing-trust-dot" />
            Trusted by finance teams · Live demo available
          </div>
        </div>

        {/* Visual preview card */}
        <div className="landing-hero-visual" aria-hidden="true">
          <div className="landing-preview">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <div>
                <div className="landing-preview-label">Travel Request</div>
                <div className="landing-preview-value" style={{ marginTop: 4 }}>TR-2071 · Bangalore → Mumbai</div>
              </div>
              <span className="landing-preview-pill">Approved</span>
            </div>
            <div className="landing-preview-row">
              <span className="landing-preview-label">Travel</span>
              <span className="landing-preview-value">₹ 12,400</span>
            </div>
            <div className="landing-preview-row">
              <span className="landing-preview-label">Hotel · 3 nts</span>
              <span className="landing-preview-value">₹ 18,000</span>
            </div>
            <div className="landing-preview-row">
              <span className="landing-preview-label">Per-diem</span>
              <span className="landing-preview-value">₹ 4,500</span>
            </div>
            <div className="landing-preview-row" style={{ paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
              <span className="landing-preview-label" style={{ color: 'var(--text-primary)' }}>Wallet credited</span>
              <span className="landing-preview-value" style={{ color: 'var(--success)' }}>₹ 34,900</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing-section">
        <span className="landing-section-eyebrow">What you get</span>
        <h2 className="landing-section-title">Everything in one place</h2>
        <p className="landing-section-sub">
          From the first request to the final ledger entry — Moiter Workz Travel Desk
          is the single source of truth for every dollar your company spends on travel.
        </p>
        <div className="landing-features">
          {FEATURES.map(f => (
            <article className="landing-feature" key={f.title}>
              <div className="landing-feature-icon">{f.icon}</div>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-desc">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="landing-stats">
        <div className="landing-stats-grid">
          {STATS.map(s => (
            <div className="landing-stat" key={s.label}>
              <div className="landing-stat-value">
                <span className="landing-stat-accent">{s.value}</span>
              </div>
              <div className="landing-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="landing-section">
        <div className="landing-cta">
          <h2 className="landing-cta-title">Ready to ship a cleaner T&amp;E flow?</h2>
          <p className="landing-cta-sub">
            Sign in with a Super Admin account to explore the full platform, or use a demo account on the login page.
          </p>
          <Button onClick={onSignIn} className="btn-lg">Sign in</Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div>© {new Date().getFullYear()} Moiter Workz · Travel Desk v3</div>
          <div className="landing-footer-links">
            <a href="#features">Features</a>
            <a href="#stats">Stats</a>
            <a onClick={onSignIn} style={{ cursor: 'pointer' }}>Sign in</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
