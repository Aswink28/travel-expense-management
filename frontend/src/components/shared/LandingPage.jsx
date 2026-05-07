import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import ThemeSwitcher from './ThemeSwitcher'
import { Button } from './UI'
import moiterLogo from '../../assets/moiter_workz-logo.png'
import heroPlane from '../../assets/hero-airplane.jpg'
import imgFlight from '../../assets/modes/flight.jpg'
import imgHotel  from '../../assets/modes/hotel.jpg'
import imgCab    from '../../assets/modes/cab.jpg'
import imgTrain  from '../../assets/modes/train.jpg'

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */

const FEATURES = [
  { icon: 'plane',  title: 'End-to-end travel',      desc: 'Submit, approve, book and reconcile from one workspace. Flights, trains, hotels, cabs — every leg tracked.', color: '#0284C7' },
  { icon: 'wallet', title: 'Smart wallet loads',      desc: 'Approved budgets land in employee PPI wallets automatically. No reimbursement chase, no out-of-pocket spend.', color: '#059669' },
  { icon: 'flow',   title: 'Tier-driven approvals',   desc: 'Map designations to tiers, set approver chains once. The right people see the right requests — no manual routing.', color: '#7C3AED' },
  { icon: 'upload', title: 'Bulk onboarding',         desc: 'Upload an Excel of new hires; the system creates accounts, wallets, and approval flows in one pass.', color: '#D97706' },
  { icon: 'chart',  title: 'Finance-grade reports',   desc: 'Real-time budget burn by tier, mode, department. Export anything you see for audit.', color: '#DB2777' },
  { icon: 'shield', title: 'Compliant by default',    desc: 'KYC at onboarding, role-scoped access, full audit log of every approver reassignment and financial action.', color: '#4F46E5' },
]

const STATS = [
  { value: 60,  suffix: '%',  label: 'Faster approval cycles' },
  { value: 12,  suffix: '+',  label: 'Travel & wallet workflows' },
  { value: 99.9, suffix: '%', label: 'Wallet load reliability' },
  { value: 0,   suffix: '',   label: 'Out-of-pocket reimbursements', prefix: '₹' },
]

const STEPS = [
  { title: 'Submit a request',    desc: 'Employee fills a single form — trip purpose, itinerary, passengers. Tier policy auto-validates allowed modes and limits.', icon: 'edit' },
  { title: 'Tier-based approval', desc: 'Request flows up the approver chain mapped to the requester\'s tier — sequential or parallel, exactly as configured.', icon: 'check' },
  { title: 'Wallet auto-credit',  desc: 'On final approval, travel + hotel + per-diem land in the employee\'s PPI wallet. No reimbursement, no waiting.', icon: 'wallet' },
  { title: 'Book & reconcile',    desc: 'Booking admin or the employee books from the wallet. Every transaction lands in the audit-ready ledger.', icon: 'book' },
]

const TESTIMONIALS = [
  { quote: 'We used to lose two finance days a month to expense reconciliation. The wallet load model wiped that out entirely.', name: 'Anjali Rao', role: 'Head of Finance', initials: 'AR', color: '#7C3AED' },
  { quote: 'Tier-based approvals were the single biggest unlock. The right manager sees the right request, every time.', name: 'Priya Mehta', role: 'Operations Lead', initials: 'PM', color: '#0284C7' },
  { quote: 'I run bookings for the whole org. The admin panel cut my queue from a full day to under an hour.', name: 'Meena Iyer', role: 'Booking Admin', initials: 'MI', color: '#059669' },
]

/* ── Company logo marks (monochrome SVGs) ─────────────────── */
const LOGO_MARKS = {
  northwind: ( /* Compass needle — pointing north */
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l4 10-4-2-4 2z" fill="currentColor" />
      <path d="M12 22l-4-10 4 2 4-2z" fill="currentColor" opacity=".3" />
    </svg>
  ),
  cloudbase: ( /* Cloud silhouette */
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" fill="currentColor" />
    </svg>
  ),
  aurex: ( /* Hexagon with center dot — lab/science mark */
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12,3 20.5,7.5 20.5,16.5 12,21 3.5,16.5 3.5,7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  ),
  vertex: ( /* Triangle with vertex dots — graph/AI mark */
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4L5 19h14z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="4" r="2" fill="currentColor" />
      <circle cx="5" cy="19" r="2" fill="currentColor" />
      <circle cx="19" cy="19" r="2" fill="currentColor" />
    </svg>
  ),
  elysia: ( /* Overlapping circles — partnership/group mark */
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  helix: ( /* Double helix — intertwining S-curves */
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2c0 5 12 5 12 10s-12 5-12 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 2c0 5-12 5-12 10s12 5 12 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
}

const TRUST_LOGOS = [
  { id: 'northwind', name: 'Northwind',    color: '#3B82F6' },
  { id: 'cloudbase', name: 'Cloudbase',    color: '#06B6D4' },
  { id: 'aurex',     name: 'Aurex Labs',   color: '#F59E0B' },
  { id: 'vertex',    name: 'Vertex AI',    color: '#8B5CF6' },
  { id: 'elysia',    name: 'Elysia Group', color: '#10B981' },
  { id: 'helix',     name: 'Helix Co',     color: '#EC4899' },
]

const MODE_IMAGES = { flight: imgFlight, hotel: imgHotel, cab: imgCab, train: imgTrain }
const TRAVEL_MODES = [
  { mode: 'flight', title: 'Flights',  desc: 'Domestic & international flights with real-time fare search, seat selection, and instant PNR tracking.', accent: '#0284C7' },
  { mode: 'hotel',  title: 'Hotels',   desc: 'Business hotels with negotiated corporate rates, voucher management, and automated check-in reminders.', accent: '#D97706' },
  { mode: 'cab',    title: 'Cabs',     desc: 'Airport transfers, local travel, and inter-city rides — all tracked and reconciled against the trip wallet.', accent: '#059669' },
  { mode: 'train',  title: 'Trains',   desc: 'Book rail tickets with class preferences, waitlist tracking, and automatic PNR status updates.', accent: '#7C3AED' },
]

/* ═══════════════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════════════ */

function useCountUp(target, inView) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!inView) return
    const end = parseFloat(target)
    if (isNaN(end)) { setCount(target); return }
    if (end === 0) { setCount(0); return }
    const duration = 2000
    const startTime = performance.now()
    let raf
    function tick(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(end % 1 !== 0 ? parseFloat((eased * end).toFixed(1)) : Math.floor(eased * end))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, target])
  return count
}

/* ═══════════════════════════════════════════════════════════════
   ANIMATION VARIANTS
   ═══════════════════════════════════════════════════════════════ */

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] } }),
}

const scaleUp = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i = 0) => ({ opacity: 1, scale: 1, transition: { duration: 0.6, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] } }),
}

const slideRight = {
  hidden: { opacity: 0, x: -30 },
  visible: (i = 0) => ({ opacity: 1, x: 0, transition: { duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] } }),
}

/* ═══════════════════════════════════════════════════════════════
   SVG ICONS
   ═══════════════════════════════════════════════════════════════ */

const Ico = ({ size = 24, children, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {children}
  </svg>
)

const ICON_MAP = {
  plane:  <Ico><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 4.3 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.5-.6.4-1.1z"/></Ico>,
  wallet: <Ico><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></Ico>,
  flow:   <Ico><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="20" r="3"/><path d="M6 9v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9"/><path d="M12 14v3"/></Ico>,
  upload: <Ico><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Ico>,
  chart:  <Ico><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></Ico>,
  shield: <Ico><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Ico>,
  edit:   <Ico><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Ico>,
  check:  <Ico><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Ico>,
  book:   <Ico><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></Ico>,
  quote:  <Ico size={28}><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h2c0 5-2 6-3 6Zm12 0c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h2c0 5-2 6-3 6Z"/></Ico>,
  arrowRight: <Ico size={20}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></Ico>,
}

/* ═══════════════════════════════════════════════════════════════
   SECTION WRAPPER — scroll reveal
   ═══════════════════════════════════════════════════════════════ */

function Section({ children, className = '', id }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.section
      ref={ref} id={id}
      className={`lp-section ${className}`}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
    >
      {children}
    </motion.section>
  )
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div className="lp-section-header">
      <motion.span className="lp-eyebrow" variants={fadeUp} custom={0}>{eyebrow}</motion.span>
      <motion.h2 className="lp-section-title" variants={fadeUp} custom={1}>{title}</motion.h2>
      {subtitle && <motion.p className="lp-section-sub" variants={fadeUp} custom={2}>{subtitle}</motion.p>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MOCK UIs — for showcase section
   ═══════════════════════════════════════════════════════════════ */

function MockBrowser({ label, children }) {
  return (
    <div className="lp-browser">
      <div className="lp-mock-chrome">
        <span className="lp-mock-dot lp-mock-dot--r" />
        <span className="lp-mock-dot lp-mock-dot--y" />
        <span className="lp-mock-dot lp-mock-dot--g" />
        <span className="lp-mock-url">moiter-workz.app/{label}</span>
      </div>
      <div className="lp-mock-body">{children}</div>
    </div>
  )
}

function ShowcaseDashboard() {
  return (
    <MockBrowser label="dashboard">
      <div className="lp-mock-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="lp-dash-avatar lp-dash-avatar--sm"><span>AS</span></div>
          <div className="lp-mock-h1">Good morning, Aisha</div>
        </div>
        <span className="lp-pill lp-pill--accent">3 pending</span>
      </div>
      <div className="lp-mock-stats">
        <div className="lp-mock-stat"><span className="lp-mock-stat-label">Active requests</span><strong>27</strong><em>+4 this week</em></div>
        <div className="lp-mock-stat"><span className="lp-mock-stat-label">Approved budget</span><strong style={{ color: '#059669' }}>₹ 4.8L</strong><em>this month</em></div>
        <div className="lp-mock-stat"><span className="lp-mock-stat-label">Wallet credited</span><strong style={{ color: '#0284C7' }}>₹ 3.2L</strong><em>auto-loaded</em></div>
      </div>
      <div className="lp-mock-chart-row">
        {[42, 68, 55, 80, 47, 73, 90, 60, 85].map((h, i) => (
          <span key={i} className="lp-mock-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div className="lp-mock-list">
        <div className="lp-mock-list-item"><span>TR-2071 · BLR → BOM</span><span className="lp-pill lp-pill--green">Approved</span></div>
        <div className="lp-mock-list-item"><span>TR-2070 · DEL → MAA</span><span className="lp-pill lp-pill--warn">Pending Finance</span></div>
        <div className="lp-mock-list-item"><span>TR-2069 · HYD → CCU</span><span className="lp-pill lp-pill--blue">Booked</span></div>
      </div>
    </MockBrowser>
  )
}

function ShowcaseRequest() {
  return (
    <MockBrowser label="new-request">
      <div className="lp-mock-row"><div className="lp-mock-h1">New Travel Request</div></div>
      <div className="lp-mock-form">
        <div className="lp-mock-field"><span className="lp-mock-field-label">Trip name</span><div className="lp-mock-input">Q4 client review · Mumbai</div></div>
        <div className="lp-mock-field"><span className="lp-mock-field-label">Type</span><div className="lp-mock-input">Domestic · Round trip</div></div>
      </div>
      <div className="lp-mock-tabs-row">
        {['Flight', 'Train', 'Hotel', 'Cab'].map((t, i) => (
          <span key={t} className={`lp-mock-tab ${i === 0 ? 'lp-mock-tab--active' : ''}`}>{t}</span>
        ))}
      </div>
      <div className="lp-mock-flight-card">
        <div className="lp-mock-flight-leg">
          <div className="lp-mock-flight-time">07:55</div>
          <div className="lp-mock-flight-iata">BLR</div>
        </div>
        <div className="lp-mock-flight-mid">
          <span className="lp-mock-flight-dur">2h 25m · non-stop</span>
          <div className="lp-mock-flight-bar"><div className="lp-mock-flight-plane">✈</div></div>
        </div>
        <div className="lp-mock-flight-leg">
          <div className="lp-mock-flight-time">10:20</div>
          <div className="lp-mock-flight-iata">BOM</div>
        </div>
        <div className="lp-mock-flight-fare">₹ 12,400</div>
      </div>
      <div className="lp-mock-row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <span className="lp-mock-stat-label">3 approvers in chain</span>
        <span className="lp-mock-cta-btn">Submit request →</span>
      </div>
    </MockBrowser>
  )
}

function ShowcaseApprovals() {
  return (
    <MockBrowser label="approvals">
      <div className="lp-mock-row"><div className="lp-mock-h1">Pending Approvals</div><span className="lp-pill lp-pill--warn">2 awaiting you</span></div>
      <div className="lp-mock-approval-card">
        <div className="lp-mock-row">
          <div>
            <div className="lp-mock-h2">TR-2071 · Aakash Bose</div>
            <div className="lp-mock-stat-label">BLR → BOM · 12 Mar – 14 Mar · ₹ 34,900</div>
          </div>
          <span className="lp-pill lp-pill--warn">Pending</span>
        </div>
        <div className="lp-chain" style={{ margin: '10px 0' }}>
          <span className="lp-chain-step lp-chain-step--done">Tech Lead</span>
          <span className="lp-chain-arrow">→</span>
          <span className="lp-chain-step lp-chain-step--active">Manager</span>
          <span className="lp-chain-arrow">→</span>
          <span className="lp-chain-step">Finance</span>
        </div>
        <div className="lp-mock-actions">
          <span className="lp-mock-cta-btn lp-mock-cta-btn--ghost">Reject</span>
          <span className="lp-mock-cta-btn">Approve</span>
        </div>
      </div>
      <div className="lp-mock-list">
        <div className="lp-mock-list-item"><span>TR-2070 · D. Nair</span><em className="lp-mock-stat-label">Awaiting Finance</em></div>
        <div className="lp-mock-list-item"><span>TR-2068 · R. Kapoor</span><em className="lp-mock-stat-label">Awaiting Tech Lead</em></div>
      </div>
    </MockBrowser>
  )
}

const SHOWCASE_TABS = [
  { id: 'dashboard', label: 'Dashboard', component: ShowcaseDashboard },
  { id: 'request',   label: 'New Request', component: ShowcaseRequest },
  { id: 'approvals', label: 'Approvals', component: ShowcaseApprovals },
]

/* ═══════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function LandingPage({ onSignIn }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [mobileNav, setMobileNav] = useState(false)
  const statsRef = useRef(null)
  const statsInView = useInView(statsRef, { once: true, margin: '-100px' })

  return (
    <div className="lp">
      {/* ── NAV ──────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a className="lp-brand" href="#">
            <img src={moiterLogo} alt="Moiter Workz" />
            <span>Moiter <span className="lp-brand-accent">Workz</span></span>
          </a>
          <div className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#showcase">Product</a>
            <a href="#how">How it works</a>
            <a href="#modes">Travel</a>
            <ThemeSwitcher compact />
            <Button onClick={onSignIn}>Sign In</Button>
          </div>
          <button className="lp-nav-burger" onClick={() => setMobileNav(!mobileNav)} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>
        <AnimatePresence>
          {mobileNav && (
            <motion.div className="lp-mobile-menu" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
              <a href="#features" onClick={() => setMobileNav(false)}>Features</a>
              <a href="#showcase" onClick={() => setMobileNav(false)}>Product</a>
              <a href="#how" onClick={() => setMobileNav(false)}>How it works</a>
              <a href="#modes" onClick={() => setMobileNav(false)}>Travel</a>
              <ThemeSwitcher compact />
              <Button onClick={onSignIn} style={{ width: '100%' }}>Sign In</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── HERO — real airplane image + clean content ─────── */}
      <section className="lp-hero">
        {/* Real airplane background image */}
        <div className="lp-hero-bg" aria-hidden="true">
          <img src={heroPlane} alt="" className="lp-hero-bg-img" />
          <div className="lp-hero-bg-overlay" />
        </div>

        <div className="lp-hero-inner">
          <div className="lp-hero-content">
            <motion.span className="lp-hero-badge" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              Corporate Travel & Expense Platform
            </motion.span>
            <motion.h1 className="lp-hero-headline" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}>
              Travel smart.<br /><span className="lp-hero-highlight">Spend smarter.</span>
            </motion.h1>
            <motion.p className="lp-hero-sub" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}>
              One platform for travel requests, tier-based approvals, wallet loads, and bookings —
              wired to your finance flow. Replace the spreadsheet sprawl with a workspace your team will actually use.
            </motion.p>
            <motion.div className="lp-hero-cta" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45 }}>
              <button className="lp-btn lp-btn--primary" onClick={onSignIn}>
                Get started {ICON_MAP.arrowRight}
              </button>
              <a href="#showcase" className="lp-btn lp-btn--outline">See product tour</a>
            </motion.div>
            <motion.div className="lp-hero-trust" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              <span className="lp-trust-check">{ICON_MAP.check}</span>
              Live demo · No credit card · Built for finance teams
            </motion.div>
          </div>

          {/* Hero dashboard preview */}
          <motion.div
            className="lp-hero-visual"
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="lp-hero-card">
              {/* Mini sidebar */}
              <div className="lp-dash-side">
                <div className="lp-dash-side-logo">M</div>
                <div className="lp-dash-side-nav">
                  <span className="lp-dash-side-icon lp-dash-side-icon--active">{ICON_MAP.chart}</span>
                  <span className="lp-dash-side-icon">{ICON_MAP.edit}</span>
                  <span className="lp-dash-side-icon">{ICON_MAP.wallet}</span>
                  <span className="lp-dash-side-icon">{ICON_MAP.shield}</span>
                </div>
              </div>
              {/* Dashboard main */}
              <div className="lp-dash-content">
                <div className="lp-dash-topbar">
                  <div className="lp-dash-greeting">
                    <div className="lp-dash-avatar"><span>AS</span><span className="lp-dash-online" /></div>
                    <div>
                      <div className="lp-dash-name">Good morning, Aisha</div>
                      <div className="lp-dash-role">Finance Lead · Tier 1</div>
                    </div>
                  </div>
                  <span className="lp-pill lp-pill--accent">3 pending</span>
                </div>
                <div className="lp-dash-metrics">
                  <div className="lp-dash-metric">
                    <span className="lp-dash-metric-label">Active Requests</span>
                    <div className="lp-dash-metric-row">
                      <strong className="lp-dash-metric-val">27</strong>
                      <span className="lp-dash-metric-delta lp-dash-metric-delta--up">+4</span>
                    </div>
                    <div className="lp-dash-metric-bar"><div className="lp-dash-metric-fill" style={{ width: '68%' }} /></div>
                  </div>
                  <div className="lp-dash-metric">
                    <span className="lp-dash-metric-label">Budget Approved</span>
                    <div className="lp-dash-metric-row">
                      <strong className="lp-dash-metric-val lp-dash-metric-val--green">₹4.8L</strong>
                      <span className="lp-dash-metric-delta">this month</span>
                    </div>
                    <div className="lp-dash-metric-bar"><div className="lp-dash-metric-fill lp-dash-metric-fill--green" style={{ width: '67%' }} /></div>
                  </div>
                  <div className="lp-dash-metric">
                    <span className="lp-dash-metric-label">Wallet Loaded</span>
                    <div className="lp-dash-metric-row">
                      <strong className="lp-dash-metric-val lp-dash-metric-val--blue">₹3.2L</strong>
                      <span className="lp-dash-metric-delta">auto-credited</span>
                    </div>
                    <div className="lp-dash-metric-bar"><div className="lp-dash-metric-fill lp-dash-metric-fill--blue" style={{ width: '82%' }} /></div>
                  </div>
                </div>
                <div className="lp-dash-trip">
                  <div className="lp-dash-trip-top">
                    <span className="lp-dash-trip-label">Next Trip</span>
                    <span className="lp-pill lp-pill--green">Approved</span>
                  </div>
                  <div className="lp-dash-trip-route">
                    <div className="lp-dash-trip-city"><strong>BLR</strong><span>Bengaluru</span></div>
                    <div className="lp-dash-trip-line"><span className="lp-dash-trip-plane">✈</span></div>
                    <div className="lp-dash-trip-city"><strong>BOM</strong><span>Mumbai</span></div>
                  </div>
                  <div className="lp-dash-trip-meta">TR-2071 · 12 May 2025 · ₹34,900</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── TRUST MARQUEE ────────────────────────────────────── */}
      <section className="lp-marquee-section">
        <div className="lp-marquee-label">Trusted by finance teams at forward-thinking companies</div>
        <div className="lp-marquee-track">
          <div className="lp-marquee-row">
            {[...TRUST_LOGOS, ...TRUST_LOGOS].map((logo, i) => (
              <div key={i} className="lp-marquee-logo">
                <span className="lp-marquee-mark" style={{ color: logo.color }}>{LOGO_MARKS[logo.id]}</span>
                <span className="lp-marquee-name">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────── */}
      <Section id="features">
        <SectionHeader eyebrow="What you get" title="Everything your travel & expense workflow needs" subtitle="From the first request to the final ledger entry — Moiter Workz is the single source of truth for every rupee your company spends on travel." />
        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <motion.article key={f.title} className="lp-feature-card" variants={scaleUp} custom={i} whileHover={{ y: -6, transition: { duration: 0.3 } }}>
              <div className="lp-feature-icon" style={{ background: `${f.color}14`, color: f.color }}>{ICON_MAP[f.icon]}</div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
            </motion.article>
          ))}
        </div>
      </Section>

      {/* ── SHOWCASE ─────────────────────────────────────────── */}
      <Section id="showcase" className="lp-showcase-section">
        <SectionHeader eyebrow="Product tour" title="See the surfaces your team will live in" subtitle="A dashboard for finance, a focused request form for employees, and an approval queue that makes the next decision obvious." />
        <motion.div className="lp-showcase-tabs" variants={fadeUp} custom={3}>
          {SHOWCASE_TABS.map(tab => (
            <button key={tab.id} className={`lp-showcase-tab ${activeTab === tab.id ? 'lp-showcase-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>
          ))}
        </motion.div>
        <motion.div className="lp-showcase-stage" variants={fadeUp} custom={4}>
          <AnimatePresence mode="wait">
            {SHOWCASE_TABS.map(tab => activeTab === tab.id && (
              <motion.div key={tab.id} initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.98 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                <tab.component />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </Section>

      {/* ── TRAVEL MODES ─────────────────────────────────────── */}
      <Section id="modes">
        <SectionHeader eyebrow="Book any way you travel" title="Every mode, one platform" subtitle="Flights, hotels, cabs, and trains — all booked, tracked, and reconciled from your travel wallet." />
        <div className="lp-modes-grid">
          {TRAVEL_MODES.map((mode, i) => (
            <motion.div key={mode.title} className="lp-mode-card" variants={fadeUp} custom={i} whileHover={{ y: -8, transition: { duration: 0.3 } }} style={{ '--mode-accent': mode.accent }}>
              <div className="lp-mode-img-wrap">
                <img src={MODE_IMAGES[mode.mode]} alt={mode.title} className="lp-mode-img" loading="lazy" />
                <div className="lp-mode-img-overlay" style={{ background: `linear-gradient(180deg, transparent 40%, ${mode.accent}18 100%)` }} />
              </div>
              <h3 className="lp-mode-title">{mode.title}</h3>
              <p className="lp-mode-desc">{mode.desc}</p>
              <div className="lp-mode-line" style={{ background: mode.accent }} />
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <Section id="how">
        <SectionHeader eyebrow="How it works" title="Four steps from request to reconciled" subtitle="The flow your finance ops team has been whiteboarding for years — finally encoded in software." />
        <div className="lp-steps">
          <div className="lp-steps-line" />
          {STEPS.map((step, i) => (
            <motion.div key={step.title} className="lp-step" variants={slideRight} custom={i}>
              <div className="lp-step-num">{i + 1}</div>
              <div className="lp-step-content">
                <div className="lp-step-icon">{ICON_MAP[step.icon]}</div>
                <h3 className="lp-step-title">{step.title}</h3>
                <p className="lp-step-desc">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── STATS ────────────────────────────────────────────── */}
      <section className="lp-stats" ref={statsRef}>
        <div className="lp-stats-inner">
          {STATS.map((s, i) => <StatItem key={s.label} stat={s} inView={statsInView} index={i} />)}
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────── */}
      <Section id="testimonials">
        <SectionHeader eyebrow="From finance & ops" title="What it feels like, after 30 days" />
        <div className="lp-testimonials">
          {TESTIMONIALS.map((t, i) => (
            <motion.figure key={t.name} className="lp-testimonial" variants={scaleUp} custom={i} whileHover={{ y: -4, transition: { duration: 0.3 } }}>
              <span className="lp-testimonial-quote">{ICON_MAP.quote}</span>
              <blockquote>{t.quote}</blockquote>
              <figcaption>
                <span className="lp-testimonial-avatar" style={{ background: `${t.color}18`, color: t.color }}>{t.initials}</span>
                <span><strong>{t.name}</strong><em>{t.role}</em></span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </Section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <Section className="lp-cta-section">
        <motion.div className="lp-cta" variants={scaleUp}>
          <div className="lp-cta-content">
            <h2 className="lp-cta-title">Ready to ship a cleaner T&amp;E flow?</h2>
            <p className="lp-cta-sub">Sign in with a Super Admin account to explore the full platform, or use a demo account on the login page.</p>
            <div className="lp-cta-buttons">
              <button className="lp-btn lp-btn--primary lp-btn--lg" onClick={onSignIn}>Sign in {ICON_MAP.arrowRight}</button>
              <a href="#features" className="lp-btn lp-btn--outline lp-btn--lg">Browse features</a>
            </div>
          </div>
        </motion.div>
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src={moiterLogo} alt="" />
            <span>Moiter <span className="lp-brand-accent">Workz</span></span>
          </div>
          <div className="lp-footer-links">
            <a href="#features">Features</a>
            <a href="#showcase">Product</a>
            <a href="#how">How it works</a>
            <a href="#modes">Travel</a>
            <a onClick={onSignIn} style={{ cursor: 'pointer' }}>Sign in</a>
          </div>
          <div className="lp-footer-copy">© {new Date().getFullYear()} Moiter Workz · Travel Desk v3</div>
        </div>
      </footer>
    </div>
  )
}

/* ── Stat counter ────────────────────────────────────────────── */
function StatItem({ stat, inView, index }) {
  const count = useCountUp(stat.value, inView)
  return (
    <motion.div className="lp-stat" initial={{ opacity: 0, y: 30 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }}>
      <div className="lp-stat-value">{stat.prefix || ''}{count}{stat.suffix}</div>
      <div className="lp-stat-label">{stat.label}</div>
    </motion.div>
  )
}
