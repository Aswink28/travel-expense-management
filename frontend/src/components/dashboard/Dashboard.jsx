import { useState, useEffect } from 'react'
import { dashboardAPI, walletAPI, requestsAPI, bookingsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, StatCard, Alert, Spinner, StatusPill, BookingBadge } from '../shared/UI'
import { fmtDate, fmtTime, fmtDateTime } from '../../utils/formatDate'

/* ──────────────────────────────────────────────────────────────
   Inline SVG icon set — same stroke/size language as the sidebar
   icons so dashboard iconography stays visually unified.
   ────────────────────────────────────────────────────────────── */
const SvgIcon = ({ size = 16, children }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    {children}
  </svg>
)
const I = {
  pieChart: <SvgIcon><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></SvgIcon>,
  list:     <SvgIcon><line x1="8" y1="6"  x2="21" y2="6"  /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6"  x2="3.01" y2="6"  /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></SvgIcon>,
  activity: <SvgIcon><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></SvgIcon>,
  plane:    <SvgIcon><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.71 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.71A2 2 0 0 1 22 16.92z" /></SvgIcon>,
  hotel:    <SvgIcon><path d="M3 21V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v13" /><path d="M3 13h18" /><path d="M8 6V3" /><path d="M16 6V3" /><path d="M7 17h2" /><path d="M15 17h2" /></SvgIcon>,
  wallet:   <SvgIcon><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></SvgIcon>,
  layers:   <SvgIcon><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></SvgIcon>,
  pause:    <SvgIcon><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></SvgIcon>,
  block:    <SvgIcon><circle cx="12" cy="12" r="9" /><line x1="5.6" y1="5.6" x2="18.4" y2="18.4" /></SvgIcon>,
  paperclip:<SvgIcon><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></SvgIcon>,
  card:     <SvgIcon><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /><path d="M6 16h4" /></SvgIcon>,
  arrowRight: <SvgIcon size={14}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></SvgIcon>,
}

const MODE_ICONS = { Train:'🚂', Bus:'🚌', Flight:'✈️', Metro:'🚇', Cab:'🚕', Rapido:'🏍', Auto:'🛺' }

export default function Dashboard({ setTab }) {
  const { user, updateWallet } = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [ppiBal,  setPpiBal]  = useState(user.ppiWallet || null)

  // Stat-card counts are derived from the same API endpoints the list
  // pages use so dashboard numbers always match what the user sees on click.
  const [counts, setCounts] = useState({ total: 0, approved: 0, totalApproved: 0, pending: 0 })

  useEffect(() => {
    const isBk = user.role === 'Booking Admin'
    Promise.all([
      dashboardAPI.summary().then(d => {
        setData(d.data)
        if (d.data?.wallet) updateWallet?.(d.data.wallet)
      }),
      walletAPI.ppiBalance().then(d => { if (d?.data) setPpiBal(d.data) }).catch(() => {}),
      // Fetch from the real list endpoints for stat-card counts
      requestsAPI.list().then(d => {
        const list = d.data || []
        setCounts(prev => ({
          ...prev,
          total: list.length,
          approved: list.filter(r => r.status === 'approved').length,
          totalApproved: list.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.approved_total || 0), 0),
        }))
      }).catch(() => {}),
      // Pending count: queue for approvers, bookings/pending for Booking Admin
      isBk
        ? bookingsAPI.pending().then(d => {
            setCounts(prev => ({ ...prev, pending: d.count || (d.data || []).length }))
          }).catch(() => {})
        : requestsAPI.queue().then(d => {
            setCounts(prev => ({ ...prev, pending: d.count || (d.data || []).length }))
          }).catch(() => {}),
    ])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display:'flex', justifyContent:'center', padding: 'var(--space-20)' }}>
        <Spinner size={36} />
      </div>
    )
  }
  if (error) return <Alert type="error">{error}</Alert>
  if (!data) return null

  const { wallet, recentTxns, recentRequests, tier, breakdown } = data
  const isBkAdmin = user.role === 'Booking Admin'

  const expBreakdown = {
    travel:    breakdown?.find(b => b.category==='travel'),
    hotel:     breakdown?.find(b => b.category==='hotel'),
    allowance: breakdown?.find(b => b.category==='allowance'),
  }

  const walletStatus = (ppiBal?.walletStatus || '').toUpperCase()
  const userColor = user.color || 'var(--accent)'
  const firstName = (user.name || '').split(' ')[0] || 'User'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="dash">
      {/* ── Hero Welcome Section ─────────────────────── */}
      <div className="dash-hero">
        <div className="dash-hero-glow" />
        <div className="dash-hero-content">
          <div>
            <div className="dash-hero-greeting">{greeting}, {firstName}</div>
            <div className="dash-hero-sub">{fmtDate()} — Here's your travel desk overview</div>
          </div>
          <div className="dash-hero-actions">
            {counts.pending > 0 && !isBkAdmin && (
              <button className="dash-hero-badge dash-hero-badge--alert" onClick={() => setTab('approvals')}>
                <span className="dash-hero-badge-count">{counts.pending}</span>
                <span>Pending approval{counts.pending > 1 ? 's' : ''}</span>
                <span style={{ display: 'inline-flex' }}>{I.arrowRight}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Wallet suspended/closed warnings */}
      {walletStatus === 'SUSPENDED' && (
        <Alert type="warning" className="alert-rich">
          <span className="alert-rich-icon" style={{ display: 'inline-flex' }}>{I.pause}</span>
          <div>
            <div className="alert-rich-title">Wallet Suspended</div>
            <div className="alert-rich-body">Your wallet is temporarily frozen. You cannot make transactions or log expenses. Please contact your administrator.</div>
          </div>
        </Alert>
      )}
      {walletStatus === 'CLOSED' && (
        <Alert type="error" className="alert-rich">
          <span className="alert-rich-icon" style={{ display: 'inline-flex' }}>{I.block}</span>
          <div>
            <div className="alert-rich-title">Wallet Closed</div>
            <div className="alert-rich-body">Your wallet has been permanently closed. No further transactions are possible.</div>
          </div>
        </Alert>
      )}

      {/* ── Stats Grid ───────────────────────────────── */}
      <div className={`dashboard-stats-grid${isBkAdmin ? ' dashboard-stats-grid--3' : ''}`}>
        {!isBkAdmin && (
          <div className="wallet-stat-wrap" onClick={() => setTab('my-wallet')}>
            <div className="wallet-stat-accent" style={{ background: `linear-gradient(135deg, ${userColor}, color-mix(in srgb, ${userColor} 50%, transparent))` }} />
            <div className="card card-hover card-deep wallet-stat-card">
              <div className="card-shine" />
              <div className="wallet-stat-card-glow" style={{ background: userColor }} />
              <div className="wallet-stat-label">Wallet Balance</div>
              <div className="wallet-stat-card-amount syne" style={{ color: userColor }}>
                ₹{Number(ppiBal?.balance ?? wallet?.balance ?? 0).toLocaleString('en-IN')}
              </div>
              <div className="wallet-stat-card-meta">
                {ppiBal ? (() => {
                  const ws = (ppiBal.walletStatus || '').toUpperCase()
                  const statusToken = ws === 'ACTIVE' ? 'success'
                                    : ws === 'SUSPENDED' ? 'warning'
                                    : ws === 'CLOSED' ? 'danger'
                                    : 'accent'
                  return (
                    <>
                      <span
                        className="wallet-stat-card-tag"
                        style={{
                          background: `var(--${statusToken}-soft)`,
                          color: `var(--text-${statusToken}, var(--${statusToken}))`,
                        }}
                      >● {ppiBal.walletStatus}</span>
                      <span className="wallet-stat-card-tag" style={{ background:'var(--accent-soft)',  color:'var(--accent)'  }}>{ppiBal.walletNumber}</span>
                    </>
                  )
                })() : (
                  <span className="wallet-stat-card-tag" style={{ background:'var(--accent-soft)', color: 'var(--accent)' }}>● Amount Loaded</span>
                )}
              </div>
            </div>
          </div>
        )}
        <StatCard label="Total Requests" value={counts.total}    sub="all time"             color='var(--accent)'  icon="◈" onClick={() => setTab('my-requests')} />
        <StatCard label="Approved"       value={counts.approved} sub={`₹${Number(counts.totalApproved||0).toLocaleString('en-IN')}`} color='var(--success)' icon="◎" />
        <StatCard
          label={isBkAdmin ? 'Pending Bookings' : 'Pending Actions'}
          value={counts.pending}
          sub={isBkAdmin ? 'company requests' : 'need your review'}
          color='var(--warning)'
          icon="◉"
          onClick={() => setTab(isBkAdmin?'booking-panel':'approvals')}
        />
      </div>

      {/* ── Recent Requests ──────────────────────────── */}
      {recentRequests?.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-header">
            <div className="dash-section-title">
              <span className="dash-section-icon">{I.list}</span>
              Recent Requests
            </div>
            <button className="section-link" onClick={() => setTab('my-requests')}>View all →</button>
          </div>
          <div className="dash-section-body">
            {recentRequests.map(r => (
              <div key={r.id} className="list-row">
                <span className="list-row-icon">{MODE_ICONS[r.travel_mode]||'🚀'}</span>
                <div className="list-row-main">
                  <div className="list-row-title">{r.from_location} → {r.to_location}</div>
                  <div className="list-row-meta">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</div>
                </div>
                <div className="list-row-tags">
                  <StatusPill status={r.status} />
                  <BookingBadge type={r.booking_type} />
                  {r.wallet_credited && (
                    <span
                      className="pill"
                      style={{
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                        borderColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {I.card} Wallet Loaded
                    </span>
                  )}
                  {r.doc_count > 0 && (
                    <span
                      className="pill"
                      style={{
                        background: 'var(--accent-soft)',
                        color: 'var(--accent)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {I.paperclip} {r.doc_count} ticket{r.doc_count>1?'s':''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Donut chart + Recent activity ─────────────── */}
      <div className="dashboard-pair">

        {!isBkAdmin && (() => {
          const cats = [
            { key:'travel',    label:'Travel',    icon: I.plane,  color:'var(--accent)',  spent:Number(expBreakdown.travel?.spent||0),    credited:Number(expBreakdown.travel?.credited||0),    remaining:Number(wallet?.travel_balance||0) },
            { key:'hotel',     label:'Hotel',     icon: I.hotel,  color:'var(--purple)',  spent:Number(expBreakdown.hotel?.spent||0),     credited:Number(expBreakdown.hotel?.credited||0),     remaining:Number(wallet?.hotel_balance||0) },
            { key:'allowance', label:'Allowance', icon: I.wallet, color:'var(--info)',    spent:Number(expBreakdown.allowance?.spent||0), credited:Number(expBreakdown.allowance?.credited||0), remaining:Number(wallet?.allowance_balance||0) },
          ]
          const totalSpent    = cats.reduce((s, c) => s + c.spent, 0)
          const totalCredited = cats.reduce((s, c) => s + c.credited, 0)

          // Donut geometry
          const size   = 160
          const stroke = 22
          const radius = (size - stroke) / 2
          const cx     = size / 2
          const cy     = size / 2
          const circumference = 2 * Math.PI * radius

          const useSpent = totalSpent > 0
          const total    = useSpent ? totalSpent : (totalCredited || 1)
          let cumulativeOffset = 0
          const segments = cats.map(c => {
            const value      = useSpent ? c.spent : c.credited
            const fraction   = value / total
            const dashLength = fraction * circumference
            const segment = {
              color:      c.color,
              dashArray:  `${dashLength} ${circumference - dashLength}`,
              dashOffset: -cumulativeOffset,
            }
            cumulativeOffset += dashLength
            return segment
          })

          return (
            <div className="dash-section dash-section--tall">
              <div className="dash-section-header">
                <div className="dash-section-title">
                  <span className="dash-section-icon">{I.pieChart}</span>
                  Expense Breakdown
                </div>
              </div>

              <div className="donut-body">
                <div className="donut-wrap">
                  <svg width={size} height={size} className="donut-svg">
                    <circle
                      cx={cx} cy={cy} r={radius}
                      fill="none" stroke="var(--bg-card-deep)" strokeWidth={stroke}
                    />
                    {segments.map((seg, i) => (
                      <circle
                        key={i}
                        cx={cx} cy={cy} r={radius}
                        fill="none" stroke={seg.color} strokeWidth={stroke}
                        strokeDasharray={seg.dashArray}
                        strokeDashoffset={seg.dashOffset}
                        strokeLinecap="butt"
                        style={{ transition:'all .4s ease' }}
                      />
                    ))}
                  </svg>
                  <div className="donut-center">
                    <div className="donut-center-label">{useSpent ? 'Spent' : 'Credited'}</div>
                    <div className="donut-center-value">
                      ₹{(useSpent ? totalSpent : totalCredited).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                <div className="donut-legend">
                  {cats.map(c => {
                    const value = useSpent ? c.spent : c.credited
                    const pct   = total > 0 ? Math.round((value / total) * 100) : 0
                    return (
                      <div key={c.key} className="donut-legend-row">
                        <div className="donut-legend-swatch" style={{ background:c.color }} />
                        <div className="donut-legend-main">
                          <div className="donut-legend-head">
                            <span className="donut-legend-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: c.color }}>
                              {c.icon}
                              <span style={{ color: 'var(--text-primary)' }}>{c.label}</span>
                            </span>
                            <span className="donut-legend-pct" style={{ color:c.color }}>{pct}%</span>
                          </div>
                          <div className="donut-legend-meta">
                            ₹{fmtDateTime(c.spent)} / ₹{fmtDateTime(c.credited)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Recent transactions */}
        <div className={`dash-section dash-section--tall${isBkAdmin ? ' section-card--span-2' : ''}`}>
          <div className="dash-section-header">
            <div className="dash-section-title">
              <span className="dash-section-icon">{I.activity}</span>
              Recent Wallet Activity
            </div>
            <button className="section-link" onClick={() => setTab('transactions')}>View all →</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', minHeight:0, paddingRight: 'var(--space-1)' }}>
            {!recentTxns?.length ? (
              <div className="empty-state">No transactions yet</div>
            ) : recentTxns.map((t,i) => (
              <div key={i} className="activity-row">
                <div>
                  <div className="activity-row-title">{t.description}</div>
                  <div className="activity-row-meta">{t.category} · {fmtDate(t.created_at)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div className="activity-row-amount" style={{ color: t.txn_type==='credit' ? 'var(--success)' : 'var(--danger)' }}>
                    {t.txn_type==='credit'?'+':'−'}₹{Number(t.amount).toLocaleString('en-IN')}
                  </div>
                  <div className="activity-row-bal">Bal: ₹{Number(t.balance_after).toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tier info ────────────────────────────────── */}
      {tier && !isBkAdmin && (
        <div className="dash-section">
          <div className="dash-section-header">
            <div className="dash-section-title">
              <span className="dash-section-icon" style={{ color: 'var(--accent)' }}>{I.layers}</span>
              Your Tier — {user.role}
            </div>
          </div>
          <div className="tier-grid">
            {[
              ['Allowed Modes', (tier.allowed_modes||[]).join(', ')],
              ['Max Budget',    `₹${Number(tier.max_trip_budget||0).toLocaleString('en-IN')}`],
              ['Daily Allow.',  `₹${tier.daily_allowance||0}/day`],
              ['Hotel/Night',   `₹${tier.max_hotel_per_night||0}`],
            ].map(([k,v]) => (
              <div key={k} className="tier-chip">
                <div className="tier-chip-label">{k}</div>
                <div className="tier-chip-value" style={{ color: userColor }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
