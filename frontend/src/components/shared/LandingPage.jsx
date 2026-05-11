import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import ThemeSwitcher from './ThemeSwitcher'
import BgSlider from './BgSlider'
import { Button } from './UI'
import moiterLogo from '../../assets/moiter_workz-logo.png'
import imgFlight from '../../assets/modes/flight.jpg'
import imgTrain  from '../../assets/modes/train.jpg'
import imgHotel  from '../../assets/modes/hotel.jpg'
import imgCab    from '../../assets/modes/cab.jpg'

const HERO_IMAGES = [imgFlight, imgTrain, imgHotel, imgCab]

/* ═══════════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════════ */

const FEATURES = [
  { id: 'travel',    tag: 'Core Platform', title: 'Every leg, one workspace',           desc: 'Submit a request, get approval, book flights, hotels, and cabs — then reconcile everything against the trip wallet. No tab-switching, no spreadsheet side-quests.', color: '#0284C7', colorEnd: '#38BDF8', highlights: ['Flights, hotels, trains & cabs in one request', 'Live booking status with real-time updates', 'Full itinerary view across all legs'] },
  { id: 'wallet',    tag: 'Finance',       title: 'Budgets that move themselves',       desc: 'The moment a trip is approved, the allocated amount loads into the employee\'s PPI wallet. They spend directly — no reimbursement claims, no out-of-pocket anxiety.', color: '#059669', colorEnd: '#34D399', highlights: ['Auto-credit on approval — zero wait time', 'Real-time balance & spend tracking', 'Per-trip allocation with overspend guards'] },
  { id: 'approvals', tag: 'Workflow',      title: 'Approvals on autopilot',             desc: 'Map designations to tiers, define the approval chain once, and forget about it. Every request routes to the right manager and finance lead automatically.', color: '#7C3AED', colorEnd: '#A78BFA', highlights: ['Sequential & parallel approval chains', 'Tier-based routing with auto-escalation', 'Finance as final gatekeeper — always'] },
  { id: 'onboard',   tag: 'Admin',         title: 'One upload, entire team onboarded',  desc: 'Drop an Excel of new hires. The system creates their accounts, assigns tiers, provisions wallets, and wires up approval chains — all in a single pass.', color: '#D97706', colorEnd: '#FBBF24', highlights: ['Bulk CSV/Excel import for 100+ employees', 'Auto-assign tiers, wallets & approvers', 'Instant account provisioning — no manual setup'] },
  { id: 'reports',   tag: 'Analytics',     title: 'Finance-grade visibility',            desc: 'See real-time spend by tier, department, and travel mode. Drill into any number, export the view, and hand auditors exactly what they need.', color: '#DB2777', colorEnd: '#F472B6', highlights: ['Spend breakdowns by tier & department', 'Exportable audit-ready reports', 'Real-time dashboards for leadership'] },
  { id: 'comply',    tag: 'Security',      title: 'Compliant from day one',              desc: 'KYC verification at signup, role-scoped data access, and a tamper-proof audit log that captures every approval, reassignment, and financial action.', color: '#4F46E5', colorEnd: '#818CF8', highlights: ['KYC verification baked into onboarding', 'Role-scoped access — see only what you should', 'Immutable audit trail for every action'] },
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

/* ── Company logo marks (colorful brand SVGs) ─────────────── */
const LOGO_MARKS = {
  northwind: ( /* Compass rose — travel/navigation brand */
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#3B82F6" opacity=".12" />
      <circle cx="16" cy="16" r="10" fill="#3B82F6" opacity=".18" />
      <path d="M16 4l3 12-3-2-3 2z" fill="#3B82F6" />
      <path d="M16 28l-3-12 3 2 3-2z" fill="#93C5FD" />
      <path d="M4 16l12 3-2-3 2-3z" fill="#60A5FA" />
      <path d="M28 16l-12-3 2 3-2 3z" fill="#BFDBFE" />
      <circle cx="16" cy="16" r="2.5" fill="#1D4ED8" />
    </svg>
  ),
  cloudbase: ( /* Cloud with upward arrow — cloud services */
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M24 15a7 7 0 0 0-13.4-2.8A5.5 5.5 0 0 0 6 17.5 5.5 5.5 0 0 0 11.5 23H23a5 5 0 0 0 1-9.9z" fill="#06B6D4" opacity=".2" />
      <path d="M24 15a7 7 0 0 0-13.4-2.8A5.5 5.5 0 0 0 6 17.5 5.5 5.5 0 0 0 11.5 23H23a5 5 0 0 0 1-9.9z" fill="none" stroke="#06B6D4" strokeWidth="1.8" />
      <path d="M16 20v-8m-3 3l3-3 3 3" stroke="#0891B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
  aurex: ( /* Hexagonal atom — fintech/labs brand */
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <polygon points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5" fill="#F59E0B" opacity=".15" />
      <polygon points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5" fill="none" stroke="#F59E0B" strokeWidth="1.6" strokeLinejoin="round" />
      <polygon points="16,9 22,12.5 22,19.5 16,23 10,19.5 10,12.5" fill="#F59E0B" opacity=".3" />
      <circle cx="16" cy="16" r="3" fill="#D97706" />
      <circle cx="16" cy="16" r="1.2" fill="#FDE68A" />
    </svg>
  ),
  vertex: ( /* Connected nodes — AI/graph network */
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <line x1="16" y1="6" x2="7" y2="24" stroke="#8B5CF6" strokeWidth="1.5" opacity=".4" />
      <line x1="16" y1="6" x2="25" y2="24" stroke="#8B5CF6" strokeWidth="1.5" opacity=".4" />
      <line x1="7" y1="24" x2="25" y2="24" stroke="#8B5CF6" strokeWidth="1.5" opacity=".4" />
      <line x1="16" y1="6" x2="16" y2="16" stroke="#A78BFA" strokeWidth="1.5" opacity=".5" />
      <line x1="7" y1="24" x2="16" y2="16" stroke="#A78BFA" strokeWidth="1.5" opacity=".5" />
      <line x1="25" y1="24" x2="16" y2="16" stroke="#A78BFA" strokeWidth="1.5" opacity=".5" />
      <circle cx="16" cy="6" r="3.5" fill="#8B5CF6" />
      <circle cx="7" cy="24" r="3.5" fill="#A78BFA" />
      <circle cx="25" cy="24" r="3.5" fill="#7C3AED" />
      <circle cx="16" cy="16" r="2.5" fill="#C4B5FD" />
    </svg>
  ),
  elysia: ( /* Overlapping petals — group/partnership */
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="12" cy="13" r="7" fill="#10B981" opacity=".2" />
      <circle cx="20" cy="13" r="7" fill="#34D399" opacity=".2" />
      <circle cx="16" cy="20" r="7" fill="#6EE7B7" opacity=".2" />
      <circle cx="12" cy="13" r="7" fill="none" stroke="#10B981" strokeWidth="1.5" />
      <circle cx="20" cy="13" r="7" fill="none" stroke="#34D399" strokeWidth="1.5" />
      <circle cx="16" cy="20" r="7" fill="none" stroke="#6EE7B7" strokeWidth="1.5" />
      <circle cx="16" cy="15.5" r="2" fill="#059669" />
    </svg>
  ),
  helix: ( /* Double helix — innovation/biotech */
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 3c0 6.5 16 6.5 16 13s-16 6.5-16 13" fill="none" stroke="#EC4899" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
      <path d="M24 3c0 6.5-16 6.5-16 13s16 6.5 16 13" fill="none" stroke="#F9A8D4" strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
      <circle cx="16" cy="9.5" r="2" fill="#EC4899" />
      <circle cx="16" cy="16" r="2" fill="#DB2777" />
      <circle cx="16" cy="22.5" r="2" fill="#EC4899" />
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
   FEATURE VISUALS — clean UI mockup previews
   ═══════════════════════════════════════════════════════════════ */

const FEATURE_VISUALS = {
  travel: (
    <div className="fv2">
      <div className="fv2-chrome">
        <span className="fv2-dot" /><span className="fv2-dot" /><span className="fv2-dot" />
        <span className="fv2-url">moiter-workz.app/requests/TR-2071</span>
      </div>
      <div className="fv2-body">
        <div className="fv2-row fv2-row--between">
          <div className="fv2-h">Travel Request <span className="fv2-id">#TR-2071</span></div>
          <span className="fv2-badge fv2-badge--green">Approved</span>
        </div>
        <div className="fv2-itinerary">
          <div className="fv2-leg">
            <div className="fv2-leg-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 4.3 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.5-.6.4-1.1z"/></svg>
            </div>
            <div className="fv2-leg-body">
              <div className="fv2-leg-route">BLR <span className="fv2-arrow">&#8594;</span> DEL</div>
              <div className="fv2-leg-meta">AI-502 &middot; 14 May &middot; 06:30</div>
            </div>
            <span className="fv2-badge fv2-badge--green fv2-badge--sm">Confirmed</span>
          </div>
          <div className="fv2-leg">
            <div className="fv2-leg-icon fv2-leg-icon--hotel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 7v14M21 7v14M6 11h4v4H6zM14 11h4v4h-4zM6 7h12V4a1 1 0 00-1-1H7a1 1 0 00-1 1v3z"/></svg>
            </div>
            <div className="fv2-leg-body">
              <div className="fv2-leg-route">Taj Palace, Delhi</div>
              <div className="fv2-leg-meta">2 nights &middot; 14–16 May</div>
            </div>
            <span className="fv2-badge fv2-badge--blue fv2-badge--sm">Booked</span>
          </div>
          <div className="fv2-leg">
            <div className="fv2-leg-icon fv2-leg-icon--cab">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a4 4 0 014-4h10a4 4 0 014 4v6a2 2 0 01-2 2M5 17l-1 3h2M19 17l1 3h-2M8 13h.01M16 13h.01"/></svg>
            </div>
            <div className="fv2-leg-body">
              <div className="fv2-leg-route">Airport cab pickup</div>
              <div className="fv2-leg-meta">14 May &middot; IGI Terminal 3</div>
            </div>
            <span className="fv2-badge fv2-badge--amber fv2-badge--sm">Pending</span>
          </div>
        </div>
        <div className="fv2-summary">
          <div className="fv2-summary-item"><span className="fv2-summary-label">Total budget</span><span className="fv2-summary-value">&#x20B9;34,900</span></div>
          <div className="fv2-summary-item"><span className="fv2-summary-label">Spent</span><span className="fv2-summary-value">&#x20B9;21,450</span></div>
          <div className="fv2-summary-item"><span className="fv2-summary-label">Remaining</span><span className="fv2-summary-value fv2-summary-value--accent">&#x20B9;13,450</span></div>
        </div>
      </div>
    </div>
  ),

  wallet: (
    <div className="fv2">
      <div className="fv2-chrome">
        <span className="fv2-dot" /><span className="fv2-dot" /><span className="fv2-dot" />
        <span className="fv2-url">moiter-workz.app/wallet</span>
      </div>
      <div className="fv2-body">
        <div className="fv2-wallet-hero">
          <div className="fv2-wallet-label">Available Balance</div>
          <div className="fv2-wallet-amt"><span className="fv2-wallet-curr">&#x20B9;</span>45,200</div>
          <div className="fv2-wallet-bar"><div className="fv2-wallet-fill" style={{ width: '62%' }} /><div className="fv2-wallet-marker" style={{ left: '62%' }} /></div>
          <div className="fv2-row fv2-row--between fv2-row--sm">
            <span>&#x20B9;28,024 spent</span>
            <span className="fv2-wallet-left">&#x20B9;17,176 remaining</span>
          </div>
        </div>
        <div className="fv2-divider" />
        <div className="fv2-wallet-txns">
          <div className="fv2-wallet-txn"><span className="fv2-wallet-txn-icon fv2-wallet-txn-icon--credit">&#8593;</span><div className="fv2-wallet-txn-body"><div className="fv2-wallet-txn-title">Trip approved — auto-credit</div><div className="fv2-wallet-txn-time">Today, 10:32 AM</div></div><span className="fv2-wallet-txn-amt fv2-wallet-txn-amt--green">+&#x20B9;45,200</span></div>
          <div className="fv2-wallet-txn"><span className="fv2-wallet-txn-icon fv2-wallet-txn-icon--debit">&#8595;</span><div className="fv2-wallet-txn-body"><div className="fv2-wallet-txn-title">AI-502 BLR&#8594;DEL</div><div className="fv2-wallet-txn-time">Today, 11:15 AM</div></div><span className="fv2-wallet-txn-amt">-&#x20B9;18,400</span></div>
          <div className="fv2-wallet-txn"><span className="fv2-wallet-txn-icon fv2-wallet-txn-icon--debit">&#8595;</span><div className="fv2-wallet-txn-body"><div className="fv2-wallet-txn-title">Taj Palace — 2 nights</div><div className="fv2-wallet-txn-time">Today, 11:18 AM</div></div><span className="fv2-wallet-txn-amt">-&#x20B9;9,624</span></div>
        </div>
      </div>
    </div>
  ),

  approvals: (
    <div className="fv2">
      <div className="fv2-chrome">
        <span className="fv2-dot" /><span className="fv2-dot" /><span className="fv2-dot" />
        <span className="fv2-url">moiter-workz.app/approvals</span>
      </div>
      <div className="fv2-body">
        <div className="fv2-h">Approval Pipeline</div>
        <div className="fv2-pipeline">
          {[
            { step: 'Submitted',  status: 'done',   by: 'Rohan K.' },
            { step: 'Tech Lead',  status: 'done',   by: 'Priya M.' },
            { step: 'Manager',    status: 'done',   by: 'Vikram S.' },
            { step: 'Finance',    status: 'active', by: 'Awaiting...' },
          ].map((s, i) => (
            <div key={s.step} className={`fv2-pipe-step fv2-pipe-step--${s.status}`}>
              <div className="fv2-pipe-node">
                {s.status === 'done' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : s.status === 'active' ? (
                  <div className="fv2-pipe-pulse" />
                ) : (
                  <div className="fv2-pipe-empty" />
                )}
              </div>
              {i < 3 && <div className={`fv2-pipe-line fv2-pipe-line--${s.status === 'done' && i < 3 ? 'done' : 'pending'}`} />}
              <div className="fv2-pipe-info">
                <span className="fv2-pipe-label">{s.step}</span>
                <span className="fv2-pipe-by">{s.by}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="fv2-divider" />
        <div className="fv2-approval-card">
          <div className="fv2-row fv2-row--between">
            <span className="fv2-approval-req">TR-3899 &middot; Mumbai trip</span>
            <span className="fv2-badge fv2-badge--purple fv2-badge--sm">Pending Finance</span>
          </div>
          <div className="fv2-row fv2-row--gap fv2-row--sm">
            <span>&#x20B9;42,500</span>
            <span className="fv2-text-muted">&middot;</span>
            <span className="fv2-text-muted">Tier 2</span>
            <span className="fv2-text-muted">&middot;</span>
            <span className="fv2-text-muted">3 legs</span>
          </div>
        </div>
      </div>
    </div>
  ),

  onboard: (
    <div className="fv2">
      <div className="fv2-chrome">
        <span className="fv2-dot" /><span className="fv2-dot" /><span className="fv2-dot" />
        <span className="fv2-url">moiter-workz.app/admin/onboard</span>
      </div>
      <div className="fv2-body">
        <div className="fv2-row fv2-row--between">
          <div className="fv2-h">Bulk Onboarding</div>
          <span className="fv2-badge fv2-badge--green">4 imported</span>
        </div>
        <div className="fv2-onboard-file">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span className="fv2-onboard-filename">new_hires_may2025.xlsx</span>
          <span className="fv2-text-muted fv2-text-xs">24 KB</span>
        </div>
        <div className="fv2-onboard-list">
          {[
            { name: 'Priya Mehta',  dept: 'Engineering', tier: 'T2', status: 'done' },
            { name: 'Arjun Das',    dept: 'Design',      tier: 'T1', status: 'done' },
            { name: 'Meena Iyer',   dept: 'Finance',     tier: 'T3', status: 'done' },
            { name: 'Ravi Shankar', dept: 'Sales',       tier: 'T2', status: 'active' },
          ].map(r => (
            <div key={r.name} className={`fv2-onboard-row fv2-onboard-row--${r.status}`}>
              <div className="fv2-avatar">{r.name[0]}</div>
              <div className="fv2-onboard-info">
                <span className="fv2-onboard-name">{r.name}</span>
                <span className="fv2-onboard-dept">{r.dept}</span>
              </div>
              <span className="fv2-onboard-tier">{r.tier}</span>
              {r.status === 'done' ? (
                <svg className="fv2-onboard-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <div className="fv2-onboard-spinner" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  ),

  reports: (
    <div className="fv2">
      <div className="fv2-chrome">
        <span className="fv2-dot" /><span className="fv2-dot" /><span className="fv2-dot" />
        <span className="fv2-url">moiter-workz.app/reports</span>
      </div>
      <div className="fv2-body">
        <div className="fv2-row fv2-row--between">
          <div className="fv2-h">Spend Analytics</div>
          <span className="fv2-text-muted fv2-text-xs">May 2025</span>
        </div>
        <div className="fv2-report-stats">
          <div className="fv2-report-stat"><span className="fv2-report-stat-value">&#x20B9;35.6L</span><span className="fv2-report-stat-label">Total spend</span></div>
          <div className="fv2-report-stat"><span className="fv2-report-stat-value">142</span><span className="fv2-report-stat-label">Trips</span></div>
          <div className="fv2-report-stat"><span className="fv2-report-stat-value">98%</span><span className="fv2-report-stat-label">Compliance</span></div>
        </div>
        <div className="fv2-report-bars">
          {[
            { dept: 'Engineering', pct: 78, amount: '₹12.4L', color: '#3B82F6' },
            { dept: 'Sales',       pct: 52, amount: '₹8.1L',  color: '#F59E0B' },
            { dept: 'Operations',  pct: 65, amount: '₹10.2L', color: '#10B981' },
            { dept: 'HR',          pct: 31, amount: '₹4.9L',  color: '#EC4899' },
          ].map(r => (
            <div key={r.dept} className="fv2-report-bar-row">
              <span className="fv2-report-dept">{r.dept}</span>
              <div className="fv2-report-bar-track"><div className="fv2-report-bar-fill" style={{ width: `${r.pct}%`, background: r.color }} /></div>
              <span className="fv2-report-amt">{r.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),

  comply: (
    <div className="fv2">
      <div className="fv2-chrome">
        <span className="fv2-dot" /><span className="fv2-dot" /><span className="fv2-dot" />
        <span className="fv2-url">moiter-workz.app/audit-log</span>
      </div>
      <div className="fv2-body">
        <div className="fv2-h">Security &amp; Compliance</div>
        <div className="fv2-comply-checks">
          {[
            { label: 'KYC verification', status: 'Verified',  icon: 'shield' },
            { label: 'Data access scope', status: 'Role-based', icon: 'lock' },
            { label: 'Audit trail',       status: 'Active',    icon: 'log' },
          ].map(c => (
            <div key={c.label} className="fv2-comply-row">
              <div className="fv2-comply-icon">
                {c.icon === 'shield' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                {c.icon === 'lock' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>}
                {c.icon === 'log' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
              </div>
              <span className="fv2-comply-label">{c.label}</span>
              <span className="fv2-badge fv2-badge--green fv2-badge--sm">{c.status}</span>
            </div>
          ))}
        </div>
        <div className="fv2-divider" />
        <div className="fv2-comply-log">
          <div className="fv2-comply-entry"><span className="fv2-comply-time">10:32</span><span>Finance approved TR-3899</span><span className="fv2-badge fv2-badge--blue fv2-badge--sm">approve</span></div>
          <div className="fv2-comply-entry"><span className="fv2-comply-time">10:28</span><span>Manager approved TR-3899</span><span className="fv2-badge fv2-badge--blue fv2-badge--sm">approve</span></div>
          <div className="fv2-comply-entry"><span className="fv2-comply-time">09:45</span><span>Rohan K. submitted TR-3899</span><span className="fv2-badge fv2-badge--amber fv2-badge--sm">create</span></div>
        </div>
      </div>
    </div>
  ),
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
   FEATURE ROW — individual scroll-triggered storytelling row
   ═══════════════════════════════════════════════════════════════ */

function FeatureRow({ feature, index, reversed }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  const textVariant = {
    hidden: { opacity: 0, x: reversed ? 60 : -60 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } },
  }
  const visualVariant = {
    hidden: { opacity: 0, x: reversed ? -60 : 60, scale: 0.95 },
    visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] } },
  }

  return (
    <div
      ref={ref}
      className={`feat-story ${reversed ? 'feat-story--rev' : ''}`}
      style={{ '--f-accent': feature.color, '--f-accent-end': feature.colorEnd }}
    >
      <div className="feat-story-glow" />
      <motion.div className="feat-story-text" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={textVariant}>
        <div className="feat-story-num">{String(index + 1).padStart(2, '0')}</div>
        <span className="feat-story-tag">{feature.tag}</span>
        <h3 className="feat-story-title">{feature.title}</h3>
        <p className="feat-story-desc">{feature.desc}</p>
        <ul className="feat-story-highlights">
          {feature.highlights.map(h => (
            <li key={h}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--f-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </motion.div>
      <motion.div className="feat-story-visual" initial="hidden" animate={inView ? 'visible' : 'hidden'} variants={visualVariant}>
        {FEATURE_VISUALS[feature.id]}
      </motion.div>
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

      {/* ── HERO — sliding travel carousel + clean content ──── */}
      <section className="lp-hero">
        {/* Sliding background carousel */}
        <BgSlider images={HERO_IMAGES} interval={7000} className="bgslider--hero" />

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
                <span className="lp-marquee-mark">{LOGO_MARKS[logo.id]}</span>
                <span className="lp-marquee-name" style={{ color: logo.color }}>{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES — PREMIUM STORYTELLING ─────────────────── */}
      <section id="features" className="feat-section">
        <div className="feat-section-header">
          <span className="feat-section-eyebrow">What you get</span>
          <h2 className="feat-section-title">Everything your travel &amp; expense workflow needs</h2>
          <p className="feat-section-sub">From the first request to the final ledger entry — Moiter Workz is the single source of truth for every rupee your company spends on travel.</p>
        </div>
        {FEATURES.map((f, i) => (
          <FeatureRow key={f.id} feature={f} index={i} reversed={i % 2 !== 0} />
        ))}
      </section>

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
