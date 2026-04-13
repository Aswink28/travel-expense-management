import { useState, useEffect } from 'react'
import { selfBookingAPI } from '../../services/api'
import TicketCard from './TicketCard'
import { Spinner, Alert } from '../shared/UI'

const MODE_ICONS  = { Flight:'✈️', Train:'🚂', Bus:'🚌', Cab:'🚕', Metro:'🚇', Hotel:'🏨' }
const TYPE_LABELS = { transport:'Travel Ticket', hotel:'Hotel Voucher' }

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [viewing, setViewing] = useState(null)
  const [filter,  setFilter]  = useState('all') // 'all' | 'transport' | 'hotel'

  useEffect(() => {
    selfBookingAPI.myTickets()
      .then(r => setTickets(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const displayed = filter === 'all' ? tickets : tickets.filter(t => t.ticket_type === filter)

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:80 }}>
      <Spinner size={36} />
    </div>
  )

  return (
    <div className="fade-up" style={{ paddingBottom:60 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:22, fontWeight:700, color:'#F0F0F4' }}>My Tickets</div>
        <div style={{ fontSize:13, color:'#666', marginTop:4 }}>All flight & travel tickets booked for you</div>
      </div>

      {error && <Alert type="error" style={{ marginBottom:16 }}>{error}</Alert>}

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {[['all','All Tickets'],['transport','Travel'],['hotel','Hotels']].map(([v,label]) => (
          <button key={v} onClick={() => setFilter(v)}
            style={{ padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: filter===v ? '#7C6FFF' : '#1A1A22',
              color:       filter===v ? '#fff'    : '#666',
              transition:'all .15s' }}>
            {label}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:12, color:'#444', alignSelf:'center' }}>
          {displayed.length} ticket{displayed.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Viewing modal */}
      {viewing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)' }}
          onClick={() => setViewing(null)}>
          <div onClick={e => e.stopPropagation()}>
            <TicketCard ticket={viewing} onClose={() => setViewing(null)} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {displayed.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#666' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🎫</div>
          <div style={{ fontSize:15, color:'#555' }}>No tickets yet</div>
          <div style={{ fontSize:12, color:'#666', marginTop:6 }}>
            Tickets booked by your Booking Admin will appear here automatically.
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {displayed.map(t => {
            const isTransport = t.ticket_type === 'transport'
            const accentMap   = { Flight:'#0A84FF', Train:'#30D158', Bus:'#FFD60A', Cab:'#FF9F0A', Hotel:'#BF5AF2' }
            const accent      = isTransport ? (accentMap[t.travel_mode] || '#7C6FFF') : '#BF5AF2'
            const icon        = isTransport ? (MODE_ICONS[t.travel_mode] || '🚀') : '🏨'
            const bookedOn    = new Date(t.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
            const travelOn    = isTransport
              ? t.travel_date?.slice(0,10)
              : `${t.check_in_date?.slice(0,10)} → ${t.check_out_date?.slice(0,10)}`

            return (
              <div key={t.id}
                style={{ background:'#12121E', border:`1px solid ${t.status==='cancelled'?'#FF453A22':accent+'25'}`,
                  borderRadius:14, padding:'18px 22px', display:'grid',
                  gridTemplateColumns:'48px 1fr 1fr 1fr 120px', alignItems:'center', gap:16,
                  opacity: t.status === 'cancelled' ? 0.55 : 1 }}>

                {/* Icon */}
                <div style={{ width:48, height:48, borderRadius:12,
                  background:`${accent}18`, border:`1px solid ${accent}30`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                  {icon}
                </div>

                {/* Type + route */}
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#E0E0E8' }}>
                    {isTransport ? t.travel_mode : 'Hotel'}
                    {' '}
                    <span style={{ fontSize:10, fontWeight:400, color:accent }}>
                      {TYPE_LABELS[t.ticket_type] || t.ticket_type}
                    </span>
                  </div>
                  <div style={{ fontSize:12, color:'#888', marginTop:3 }}>
                    {isTransport
                      ? `${t.from_location || '—'} → ${t.to_location || '—'}`
                      : (t.hotel_name || t.vendor || '—')}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <div style={{ fontSize:10, color:'#555', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>
                    {isTransport ? 'Travel Date' : 'Stay'}
                  </div>
                  <div style={{ fontSize:12, color:'#aaa' }}>{travelOn}</div>
                  <div style={{ fontSize:10, color:'#444', marginTop:2 }}>Booked {bookedOn}</div>
                </div>

                {/* PNR + amount */}
                <div>
                  <div style={{ fontSize:10, color:'#555', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>PNR</div>
                  <div style={{ fontSize:13, fontWeight:800, color:accent, letterSpacing:'.05em' }}>{t.pnr_number}</div>
                  <div style={{ fontSize:11, color:'#666', marginTop:2 }}>₹{Number(t.amount).toLocaleString('en-IN')}</div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
                  <span style={{ fontSize:10, padding:'3px 10px', borderRadius:20, fontWeight:600,
                    background: t.status==='cancelled' ? '#FF453A18' : '#30D15818',
                    color:      t.status==='cancelled' ? '#FF453A'   : '#30D158' }}>
                    ● {(t.status || 'confirmed').toUpperCase()}
                  </span>
                  {t.status !== 'cancelled' && (
                    <button onClick={() => setViewing(t)}
                      style={{ background:`${accent}18`, color:accent, border:`1px solid ${accent}30`,
                        padding:'6px 14px', borderRadius:8, cursor:'pointer', fontSize:11, fontWeight:600 }}>
                      View & Print
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
