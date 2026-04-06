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

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

        {/* Expense breakdown */}
        {!isBkAdmin && (
          <Card style={{ padding:22 }}>
            <div style={{ fontSize:13, color:'#888', fontWeight:500, marginBottom:16 }}>Expense Breakdown</div>
            {[
              ['✈ Travel',    expBreakdown.travel,    wallet?.travel_balance,    '#0A84FF'],
              ['🏨 Hotel',    expBreakdown.hotel,     wallet?.hotel_balance,     '#BF5AF2'],
              ['🎯 Allowance',expBreakdown.allowance, wallet?.allowance_balance, '#30D158'],
            ].map(([label, bkd, remaining, color]) => {
              const credited = Number(bkd?.credited||0)
              const spent    = Number(bkd?.spent||0)
              const pct      = credited > 0 ? (spent/credited)*100 : 0
              return (
                <div key={label} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'#ccc' }}>{label}</span>
                    <span style={{ fontSize:12, color:'#555' }}>₹{spent.toLocaleString('en-IN')} / ₹{credited.toLocaleString('en-IN')}</span>
                  </div>
                  <ProgressBar pct={pct} color={color} height={5} />
                  <div style={{ fontSize:10, color:'#444', marginTop:4 }}>₹{Number(remaining||0).toLocaleString('en-IN')} remaining</div>
                </div>
              )
            })}
          </Card>
        )}

        {/* Recent transactions */}
        <Card style={{ padding:22, gridColumn: isBkAdmin ? 'span 2' : 'auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div style={{ fontSize:13, color:'#888', fontWeight:500 }}>Recent Wallet Activity</div>
            <button onClick={() => setTab('transactions')} style={{ fontSize:11, color:'#0A84FF', background:'none', border:'none', cursor:'pointer' }}>View all →</button>
          </div>
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
