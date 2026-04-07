import { useState, useEffect } from 'react'
import { dashboardAPI, walletAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, StatCard, WalletCard, Alert, Spinner, PageTitle, StatusPill, ProgressBar, BookingBadge } from '../shared/UI'

const BASE = '/api'
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

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:80 }}><Spinner size={36} /></div>
  if (error)   return <Alert type="error">{error}</Alert>
  if (!data)   return null

  const { wallet, stats, pendingForMe, recentTxns, recentRequests, tier, breakdown } = data
  const isBkAdmin = user.role === 'Booking Admin'

  const expBreakdown = {
    travel:    breakdown?.find(b => b.category==='travel'),
    hotel:     breakdown?.find(b => b.category==='hotel'),
    allowance: breakdown?.find(b => b.category==='allowance'),
  }

  return (
    <div className="fade-up">
      <PageTitle title="Dashboard" sub={`${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`} />

      {/* Wallet suspended/closed warning */}
      {ppiBal && (ppiBal.walletStatus || '').toUpperCase() === 'SUSPENDED' && (
        <div style={{ background:'#FFD60A10', border:'1px solid #FFD60A25', borderRadius:12, padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:24 }}>⏸</span>
          <div>
            <div style={{ fontSize:14, color:'#FFD60A', fontWeight:600 }}>Wallet Suspended</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Your wallet is temporarily frozen. You cannot make transactions or log expenses. Please contact your administrator.</div>
          </div>
        </div>
      )}
      {ppiBal && (ppiBal.walletStatus || '').toUpperCase() === 'CLOSED' && (
        <div style={{ background:'#FF453A10', border:'1px solid #FF453A25', borderRadius:12, padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:24 }}>⛔</span>
          <div>
            <div style={{ fontSize:14, color:'#FF453A', fontWeight:600 }}>Wallet Closed</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Your wallet has been permanently closed. No further transactions are possible.</div>
          </div>
        </div>
      )}

      {/* Top row */}
      <div style={{ display:'grid', gridTemplateColumns: isBkAdmin ? 'repeat(3,1fr)' : '1.4fr 1fr 1fr 1fr', gap:14, marginBottom:22 }}>
        {!isBkAdmin && (
          <Card style={{ padding:22, background:'#0E0E16', borderColor:'#1E1E2A', position:'relative', overflow:'hidden', cursor:'pointer' }} onClick={() => setTab('my-wallet')}>
            <div style={{ position:'absolute', right:-20, top:-20, width:120, height:120, borderRadius:'50%', background:user.color||'#0A84FF', opacity:.06, pointerEvents:'none' }} />
            <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
              Wallet Balance
            </div>
            <div className="syne" style={{ fontSize:36, fontWeight:800, color:user.color||'#0A84FF', letterSpacing:'-.04em', marginBottom:4 }}>
              ₹{Number(ppiBal?.balance ?? wallet?.balance ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {ppiBal ? (
                <>
                  <span style={{ fontSize:10, background:'#30D15818', color:'#30D158', padding:'2px 8px', borderRadius:10 }}>● {ppiBal.walletStatus}</span>
                  <span style={{ fontSize:10, background:'#0A84FF18', color:'#0A84FF', padding:'2px 8px', borderRadius:10 }}>{ppiBal.walletNumber}</span>
                </>
              ) : (
                <span style={{ fontSize:10, background:'#30D15818', color:'#30D158', padding:'2px 8px', borderRadius:10 }}>● Amount Loaded</span>
              )}
            </div>
          </Card>
        )}
        <StatCard label="Total Requests" value={Number(stats?.total||0)} sub="all time" color="#0A84FF" icon="◈" onClick={() => setTab('my-requests')} />
        <StatCard label="Approved" value={Number(stats?.approved||0)} sub={`₹${Number(stats?.total_approved||0).toLocaleString('en-IN')}`} color="#30D158" icon="◎" />
        <StatCard label={isBkAdmin ? 'Pending Bookings' : 'Pending Actions'} value={isBkAdmin ? Number(stats?.pending_booking||0) : (pendingForMe||0)} sub={isBkAdmin ? 'company requests' : 'need your review'} color="#FFD60A" icon="◉" onClick={() => setTab(isBkAdmin?'booking-panel':'approvals')} />
      </div>

      {/* Recent requests + tickets */}
      {recentRequests?.length > 0 && (
        <Card style={{ padding:22, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:13, color:'#888', fontWeight:500 }}>Recent Requests</div>
            <button onClick={() => setTab('my-requests')} style={{ fontSize:11, color:'#0A84FF', background:'none', border:'none', cursor:'pointer' }}>View all →</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {recentRequests.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'#1A1A22', borderRadius:10 }}>
                <span style={{ fontSize:18 }}>{MODE_ICONS[r.travel_mode]||'🚀'}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:'#ccc' }}>{r.from_location} → {r.to_location}</div>
                  <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{r.start_date?.slice(0,10)} → {r.end_date?.slice(0,10)}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <StatusPill status={r.status} />
                  <BookingBadge type={r.booking_type} />
                  {r.wallet_credited && <span style={{ fontSize:10, background:'#30D15818', color:'#30D158', padding:'2px 8px', borderRadius:6 }}>💳 Wallet Loaded</span>}
                  {r.doc_count > 0 && (
                    <span style={{ fontSize:10, background:'#0A84FF18', color:'#0A84FF', padding:'2px 8px', borderRadius:6 }}>
                      📎 {r.doc_count} ticket{r.doc_count>1?'s':''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16, gridAutoRows:'260px' }}>

        {/* Expense breakdown — Donut chart */}
        {!isBkAdmin && (() => {
          const cats = [
            { key:'travel',    label:'Travel',    icon:'✈',  color:'#0A84FF', spent:Number(expBreakdown.travel?.spent||0),    credited:Number(expBreakdown.travel?.credited||0),    remaining:Number(wallet?.travel_balance||0) },
            { key:'hotel',     label:'Hotel',     icon:'🏨', color:'#BF5AF2', spent:Number(expBreakdown.hotel?.spent||0),     credited:Number(expBreakdown.hotel?.credited||0),     remaining:Number(wallet?.hotel_balance||0) },
            { key:'allowance', label:'Allowance', icon:'🎯', color:'#30D158', spent:Number(expBreakdown.allowance?.spent||0), credited:Number(expBreakdown.allowance?.credited||0), remaining:Number(wallet?.allowance_balance||0) },
          ]
          const totalSpent = cats.reduce((s, c) => s + c.spent, 0)
          const totalCredited = cats.reduce((s, c) => s + c.credited, 0)

          // Donut chart geometry
          const size = 160
          const stroke = 22
          const radius = (size - stroke) / 2
          const cx = size / 2
          const cy = size / 2
          const circumference = 2 * Math.PI * radius

          // Calculate segments — use spent if any, else use credited as the distribution
          const useSpent = totalSpent > 0
          const total = useSpent ? totalSpent : (totalCredited || 1)
          let cumulativeOffset = 0
          const segments = cats.map(c => {
            const value = useSpent ? c.spent : c.credited
            const fraction = value / total
            const dashLength = fraction * circumference
            const segment = {
              color: c.color,
              dashArray: `${dashLength} ${circumference - dashLength}`,
              dashOffset: -cumulativeOffset,
            }
            cumulativeOffset += dashLength
            return segment
          })

          return (
            <Card style={{ padding:22, display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ fontSize:13, color:'#888', fontWeight:500, marginBottom:16, flexShrink:0 }}>Expense Breakdown</div>

              <div style={{ display:'flex', alignItems:'center', gap:20, flex:1, minHeight:0 }}>
                {/* Donut Chart */}
                <div style={{ position:'relative', flexShrink:0 }}>
                  <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
                    {/* Background ring */}
                    <circle
                      cx={cx} cy={cy} r={radius}
                      fill="none" stroke="#1A1A22" strokeWidth={stroke}
                    />
                    {/* Segments */}
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
                  {/* Center label */}
                  <div style={{ position:'absolute', top:0, left:0, width:size, height:size, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ fontSize:9, color:'#444', textTransform:'uppercase', letterSpacing:'.06em' }}>
                      {useSpent ? 'Spent' : 'Credited'}
                    </div>
                    <div className="syne" style={{ fontSize:18, fontWeight:800, color:'#E2E2E8', lineHeight:1.2, marginTop:2 }}>
                      ₹{(useSpent ? totalSpent : totalCredited).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Legend */}
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10, minWidth:0 }}>
                  {cats.map(c => {
                    const value = useSpent ? c.spent : c.credited
                    const pct = total > 0 ? Math.round((value / total) * 100) : 0
                    return (
                      <div key={c.key} style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:10, height:10, borderRadius:3, background:c.color, flexShrink:0 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                            <span style={{ fontSize:12, color:'#ccc' }}>{c.icon} {c.label}</span>
                            <span style={{ fontSize:11, color:c.color, fontWeight:600 }}>{pct}%</span>
                          </div>
                          <div style={{ fontSize:10, color:'#555', marginTop:2 }}>
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
        <Card style={{ padding:22, gridColumn: isBkAdmin ? 'span 2' : 'auto', display:'flex', flexDirection:'column', minHeight:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexShrink:0 }}>
            <div style={{ fontSize:13, color:'#888', fontWeight:500 }}>Recent Wallet Activity</div>
            <button onClick={() => setTab('transactions')} style={{ fontSize:11, color:'#0A84FF', background:'none', border:'none', cursor:'pointer' }}>View all →</button>
          </div>
          <div style={{ flex:1, overflowY:'auto', minHeight:0, paddingRight:4 }}>
            {!recentTxns?.length ? (
              <div style={{ textAlign:'center', padding:30, color:'#333', fontSize:13 }}>No transactions yet</div>
            ) : recentTxns.map((t,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom: i<recentTxns.length-1?'1px solid #16161E':'none' }}>
                <div>
                  <div style={{ fontSize:12, color:'#ccc' }}>{t.description}</div>
                  <div style={{ fontSize:10, color:'#444', marginTop:2 }}>{t.category} · {new Date(t.created_at).toLocaleDateString('en-IN')}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:600, color:t.txn_type==='credit'?'#30D158':'#FF453A' }}>
                    {t.txn_type==='credit'?'+':'−'}₹{Number(t.amount).toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize:10, color:'#444' }}>Bal: ₹{Number(t.balance_after).toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Tier info */}
      {tier && !isBkAdmin && (
        <Card style={{ padding:18 }}>
          <div style={{ fontSize:11, color:'#3A3A4A', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>Your Tier — {user.role}</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {[
              ['Allowed Modes', (tier.allowed_modes||[]).join(', ')],
              ['Max Budget',    `₹${Number(tier.max_trip_budget||0).toLocaleString('en-IN')}`],
              ['Daily Allow.',  `₹${tier.daily_allowance||0}/day`],
              ['Hotel/Night',   `₹${tier.max_hotel_per_night||0}`],
            ].map(([k,v]) => (
              <div key={k} style={{ background:'#1A1A22', borderRadius:9, padding:'10px 14px', minWidth:140 }}>
                <div style={{ fontSize:10, color:'#3A3A4A', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>{k}</div>
                <div style={{ fontSize:12, color:user.color||'#0A84FF' }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pending action prompt */}
      {pendingForMe > 0 && !isBkAdmin && (
        <div onClick={() => setTab('approvals')} style={{ marginTop:14, background:`${user.color}14`, border:`1px solid ${user.color}28`, borderRadius:12, padding:'14px 20px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:14, color:'#E2E2E8', fontWeight:500 }}>{pendingForMe} request{pendingForMe>1?'s':''} waiting for your approval</div>
            <div style={{ fontSize:12, color:'#555', marginTop:2 }}>Click to review →</div>
          </div>
          <div className="syne" style={{ fontSize:32, fontWeight:800, color:user.color }}>{pendingForMe}</div>
        </div>
      )}
    </div>
  )
}
