import { useState, useEffect } from 'react'
import { dashboardAPI, walletAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, StatCard, Alert, Spinner, PageTitle, StatusPill, BookingBadge } from '../shared/UI'

const MODE_ICONS = { Train:'🚂', Bus:'🚌', Flight:'✈️', Metro:'🚇', Cab:'🚕', Rapido:'🏍', Auto:'🛺' }

export default function Dashboard({ setTab }) {
  const { user, updateWallet } = useAuth()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [ppiBal,  setPpiBal]  = useState(user.ppiWallet || null)

  useEffect(() => {
    Promise.all([
      dashboardAPI.summary().then(d => {
        setData(d.data)
        if (d.data?.wallet) updateWallet?.(d.data.wallet)
      }),
      walletAPI.ppiBalance().then(d => { if (d?.data) setPpiBal(d.data) }).catch(() => {}),
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

  const { wallet, stats, pendingForMe, recentTxns, recentRequests, tier, breakdown } = data
  const isBkAdmin = user.role === 'Booking Admin'

  const expBreakdown = {
    travel:    breakdown?.find(b => b.category==='travel'),
    hotel:     breakdown?.find(b => b.category==='hotel'),
    allowance: breakdown?.find(b => b.category==='allowance'),
  }

  const walletStatus = (ppiBal?.walletStatus || '').toUpperCase()
  const userColor = user.color || 'var(--accent)'

  return (
    <div className="fade-up">
      <PageTitle
        title="Dashboard"
        sub={new Date().toLocaleDateString('en-IN',{ weekday:'long', day:'numeric', month:'long', year:'numeric' })}
      />

      {/* Wallet suspended/closed warnings — semantic alerts with rich content */}
      {walletStatus === 'SUSPENDED' && (
        <Alert type="warning" className="alert-rich">
          <span className="alert-rich-icon">⏸</span>
          <div>
            <div className="alert-rich-title">Wallet Suspended</div>
            <div className="alert-rich-body">Your wallet is temporarily frozen. You cannot make transactions or log expenses. Please contact your administrator.</div>
          </div>
        </Alert>
      )}
      {walletStatus === 'CLOSED' && (
        <Alert type="error" className="alert-rich">
          <span className="alert-rich-icon">⛔</span>
          <div>
            <div className="alert-rich-title">Wallet Closed</div>
            <div className="alert-rich-body">Your wallet has been permanently closed. No further transactions are possible.</div>
          </div>
        </Alert>
      )}

      {/* Top stats row */}
      <div className={`dashboard-stats-grid${isBkAdmin ? ' dashboard-stats-grid--3' : ''}`}>
        {!isBkAdmin && (
          <Card className="card-deep wallet-stat-card" onClick={() => setTab('my-wallet')}>
            <div className="wallet-stat-card-glow" style={{ background: userColor }} />
            <div className="text-2xs text-faint uppercase tracking-wide">Wallet Balance</div>
            <div className="wallet-stat-card-amount" style={{ color: userColor }}>
              ₹{Number(ppiBal?.balance ?? wallet?.balance ?? 0).toLocaleString('en-IN')}
            </div>
            <div className="wallet-stat-card-meta">
              {ppiBal ? (
                <>
                  <span className="wallet-stat-card-tag" style={{ background:'var(--success-soft)', color:'var(--success)' }}>● {ppiBal.walletStatus}</span>
                  <span className="wallet-stat-card-tag" style={{ background:'var(--accent-soft)',  color:'var(--accent)'  }}>{ppiBal.walletNumber}</span>
                </>
              ) : (
                <span className="wallet-stat-card-tag" style={{ background:'var(--success-soft)', color:'var(--success)' }}>● Amount Loaded</span>
              )}
            </div>
          </Card>
        )}
        <StatCard label="Total Requests" value={Number(stats?.total||0)}    sub="all time"             color='var(--accent)'  icon="◈" onClick={() => setTab('my-requests')} />
        <StatCard label="Approved"       value={Number(stats?.approved||0)} sub={`₹${Number(stats?.total_approved||0).toLocaleString('en-IN')}`} color='var(--success)' icon="◎" />
        <StatCard
          label={isBkAdmin ? 'Pending Bookings' : 'Pending Actions'}
          value={isBkAdmin ? Number(stats?.pending_booking||0) : (pendingForMe||0)}
          sub={isBkAdmin ? 'company requests' : 'need your review'}
          color='var(--warning)'
          icon="◉"
          onClick={() => setTab(isBkAdmin?'booking-panel':'approvals')}
        />
      </div>

      {/* Recent requests */}
      {recentRequests?.length > 0 && (
        <Card className="section-card" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="section-head">
            <div className="section-head-title">Recent Requests</div>
            <button className="section-link" onClick={() => setTab('my-requests')}>View all →</button>
          </div>
          <div>
            {recentRequests.map(r => (
              <div key={r.id} className="list-row">
                <span className="list-row-icon">{MODE_ICONS[r.travel_mode]||'🚀'}</span>
                <div className="list-row-main">
                  <div className="list-row-title">{r.from_location} → {r.to_location}</div>
                  <div className="list-row-meta">{r.start_date?.slice(0,10)} → {r.end_date?.slice(0,10)}</div>
                </div>
                <div className="list-row-tags">
                  <StatusPill status={r.status} />
                  <BookingBadge type={r.booking_type} />
                  {r.wallet_credited && (
                    <span className="pill" style={{ background:'var(--success-soft)', color:'var(--success)' }}>💳 Wallet Loaded</span>
                  )}
                  {r.doc_count > 0 && (
                    <span className="pill" style={{ background:'var(--accent-soft)', color:'var(--accent)' }}>
                      📎 {r.doc_count} ticket{r.doc_count>1?'s':''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Donut chart + Recent activity */}
      <div className="dashboard-pair">

        {!isBkAdmin && (() => {
          const cats = [
            { key:'travel',    label:'Travel',    icon:'✈',  color:'var(--accent)',  spent:Number(expBreakdown.travel?.spent||0),    credited:Number(expBreakdown.travel?.credited||0),    remaining:Number(wallet?.travel_balance||0) },
            { key:'hotel',     label:'Hotel',     icon:'🏨', color:'var(--purple)',  spent:Number(expBreakdown.hotel?.spent||0),     credited:Number(expBreakdown.hotel?.credited||0),     remaining:Number(wallet?.hotel_balance||0) },
            { key:'allowance', label:'Allowance', icon:'🎯', color:'var(--success)', spent:Number(expBreakdown.allowance?.spent||0), credited:Number(expBreakdown.allowance?.credited||0), remaining:Number(wallet?.allowance_balance||0) },
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
            <Card className="section-card section-card--tall">
              <div className="section-head">
                <div className="section-head-title">Expense Breakdown</div>
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
                            <span className="donut-legend-label">{c.icon} {c.label}</span>
                            <span className="donut-legend-pct" style={{ color:c.color }}>{pct}%</span>
                          </div>
                          <div className="donut-legend-meta">
                            ₹{c.spent.toLocaleString('en-IN')} / ₹{c.credited.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          )
        })()}

        {/* Recent transactions */}
        <Card className={`section-card section-card--tall${isBkAdmin ? ' section-card--span-2' : ''}`}>
          <div className="section-head">
            <div className="section-head-title">Recent Wallet Activity</div>
            <button className="section-link" onClick={() => setTab('transactions')}>View all →</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', minHeight:0, paddingRight: 'var(--space-1)' }}>
            {!recentTxns?.length ? (
              <div className="empty-state">No transactions yet</div>
            ) : recentTxns.map((t,i) => (
              <div key={i} className="activity-row">
                <div>
                  <div className="activity-row-title">{t.description}</div>
                  <div className="activity-row-meta">{t.category} · {new Date(t.created_at).toLocaleDateString('en-IN')}</div>
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
        </Card>
      </div>

      {/* Tier info */}
      {tier && !isBkAdmin && (
        <Card className="section-card">
          <div className="section-head" style={{ marginBottom: 'var(--space-3)' }}>
            <div className="section-head-title" style={{ textTransform:'uppercase', letterSpacing:'var(--ls-wide)', fontSize:'var(--fs-2xs)', color:'var(--text-label)' }}>
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
        </Card>
      )}

      {/* Pending action prompt */}
      {pendingForMe > 0 && !isBkAdmin && (
        <div
          className="pending-banner"
          onClick={() => setTab('approvals')}
          style={{ background:`color-mix(in srgb, ${userColor} 8%, transparent)`, border:`1px solid color-mix(in srgb, ${userColor} 24%, transparent)` }}
        >
          <div>
            <div className="pending-banner-title">{pendingForMe} request{pendingForMe>1?'s':''} waiting for your approval</div>
            <div className="pending-banner-sub">Click to review →</div>
          </div>
          <div className="pending-banner-count" style={{ color: userColor }}>{pendingForMe}</div>
        </div>
      )}
    </div>
  )
}
