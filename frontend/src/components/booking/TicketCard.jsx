// TicketCard.jsx — renders a ticket visually + print/download
export default function TicketCard({ ticket, onClose }) {
  if (!ticket) return null

  const isTransport = ticket.ticket_type === 'transport'
  const data        = ticket.ticket_data || {}

  const modeColors = {
    Train:  'var(--success)', Bus: 'var(--warning)', Flight: 'var(--accent)',
    Cab:    'var(--warning)', Metro:'var(--purple)', Rapido:'var(--danger)',
  }
  const modeIcons = {
    Train:'🚂', Bus:'🚌', Flight:'✈️', Cab:'🚕',
    Metro:'🚇', Rapido:'🏍', Auto:'🛺',
  }

  const accentColor = isTransport
    ? (modeColors[ticket.travel_mode] || 'var(--accent)')
    : 'var(--purple)'

  function printTicket() {
    const w = window.open('', '_blank', 'width=700,height=900')
    w.document.write(`
      <html><head>
        <title>Ticket — ${ticket.pnr_number}</title>
        <style>
          * { box-sizing:border-box; margin:0; padding:0 }
          body { font-family:'Segoe UI',Arial,sans-serif; background:var(--text-primary); padding:20px }
          .ticket { background:#fff; border-radius:12px; overflow:hidden; max-width:600px; margin:0 auto; box-shadow:0 4px 20px rgba(0,0,0,.15) }
          .header { background:${accentColor}; color:#fff; padding:20px 24px }
          .header h1 { font-size:22px; font-weight:700 }
          .header p  { font-size:13px; opacity:.85; margin-top:4px }
          .body   { padding:24px }
          .row    { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--text-body) }
          .label  { font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.05em }
          .value  { font-size:13px; color:var(--border-strong); font-weight:500 }
          .pnr    { background:var(--text-primary); border-radius:8px; padding:16px; margin-top:16px; text-align:center }
          .pnr .num { font-size:28px; font-weight:800; letter-spacing:.1em; color:${accentColor} }
          .footer { border-top:2px dashed var(--text-body); padding:16px 24px; text-align:center; font-size:11px; color:var(--text-muted) }
          @media print { body { padding:0 } }
        </style>
      </head><body>
        <div class="ticket">
          <div class="header">
            <h1>${isTransport ? `${ticket.travel_mode || 'Transport'} Ticket` : 'Hotel Booking Voucher'}</h1>
            <p>${ticket.passenger_name} &nbsp;·&nbsp; ${data.empId || ''}</p>
          </div>
          <div class="body">
            ${isTransport ? `
              <div class="row"><span class="label">From</span><span class="value">${ticket.from_location||''}</span></div>
              <div class="row"><span class="label">To</span><span class="value">${ticket.to_location||''}</span></div>
              <div class="row"><span class="label">Date</span><span class="value">${ticket.travel_date?.slice(0,10)||''}</span></div>
              <div class="row"><span class="label">Time</span><span class="value">${ticket.travel_time||'As per schedule'}</span></div>
              <div class="row"><span class="label">Class / Seat</span><span class="value">${ticket.seat_class||'—'} ${ticket.seat_number ? '/ '+ticket.seat_number : ''}</span></div>
              <div class="row"><span class="label">Vendor</span><span class="value">${ticket.vendor||'—'}</span></div>
            ` : `
              <div class="row"><span class="label">Hotel</span><span class="value">${ticket.hotel_name||''}</span></div>
              <div class="row"><span class="label">Check-in</span><span class="value">${ticket.check_in_date?.slice(0,10)||''}</span></div>
              <div class="row"><span class="label">Check-out</span><span class="value">${ticket.check_out_date?.slice(0,10)||''}</span></div>
              <div class="row"><span class="label">Room Type</span><span class="value">${ticket.room_type||'Standard'}</span></div>
              <div class="row"><span class="label">Vendor</span><span class="value">${ticket.vendor||'—'}</span></div>
            `}
            <div class="row"><span class="label">Amount Paid</span><span class="value">₹${Number(ticket.amount).toLocaleString('en-IN')}</span></div>
            <div class="row"><span class="label">Purpose</span><span class="value">${data.purpose||''}</span></div>
            <div class="pnr">
              <div class="label" style="margin-bottom:6px">PNR / Booking Reference</div>
              <div class="num">${ticket.pnr_number}</div>
              <div style="font-size:12px;color:var(--text-faint);margin-top:4px">Ref: ${ticket.booking_ref}</div>
            </div>
          </div>
          <div class="footer">
            Issued by Moiter Workz &nbsp;·&nbsp; ${new Date(ticket.created_at).toLocaleString('en-IN')}
            &nbsp;·&nbsp; ${ticket.status?.toUpperCase()}
          </div>
        </div>
      </body></html>
    `)
    w.document.close()
    setTimeout(() => { w.print() }, 500)
  }

  return (
    <div style={{
      background:'var(--bg-app)', border:`1px solid ${accentColor}30`, borderRadius:16,
      overflow:'hidden', maxWidth:520,
    }}>
      {/* Ticket header */}
      <div style={{ background:`linear-gradient(135deg, ${accentColor}22, ${accentColor}08)`, borderBottom:`1px solid ${accentColor}25`, padding:'18px 22px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:22, marginBottom:6 }}>
              {isTransport ? (modeIcons[ticket.travel_mode]||'🚀') : '🏨'}
            </div>
            <div className="syne" style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>
              {isTransport ? `${ticket.travel_mode} Ticket` : 'Hotel Voucher'}
            </div>
            <div style={{ fontSize:11, color:'var(--text-faint)', marginTop:2 }}>{ticket.passenger_name}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>PNR</div>
            <div className="syne" style={{ fontSize:18, fontWeight:800, color:accentColor, letterSpacing:'.1em' }}>
              {ticket.pnr_number}
            </div>
            <div style={{ fontSize:10, color:'var(--text-dim)', marginTop:2 }}>Ref: {ticket.booking_ref}</div>
          </div>
        </div>
      </div>

      {/* Ticket body */}
      <div style={{ padding:'18px 22px' }}>
        {isTransport ? (
          <>
            {/* Route visual */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'12px 14px', background:'var(--bg-input)', borderRadius:10 }}>
              <div style={{ textAlign:'center', flex:1 }}>
                <div style={{ fontSize:11, color:'var(--text-dim)', marginBottom:4 }}>FROM</div>
                <div style={{ fontSize:14, color:'var(--text-primary)', fontWeight:600 }}>{ticket.from_location}</div>
              </div>
              <div style={{ fontSize:18, color:accentColor }}>→</div>
              <div style={{ textAlign:'center', flex:1 }}>
                <div style={{ fontSize:11, color:'var(--text-dim)', marginBottom:4 }}>TO</div>
                <div style={{ fontSize:14, color:'var(--text-primary)', fontWeight:600 }}>{ticket.to_location}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                ['Date',    ticket.travel_date?.slice(0,10) || '—'],
                ['Time',    ticket.travel_time || 'As scheduled'],
                ['Class',   ticket.seat_class  || '—'],
                ['Seat',    ticket.seat_number || '—'],
                ['Vendor',  ticket.vendor      || '—'],
                ['Amount',  `₹${Number(ticket.amount).toLocaleString('en-IN')}`],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'var(--bg-input)', borderRadius:7, padding:'8px 10px' }}>
                  <div style={{ fontSize:9, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{k}</div>
                  <div style={{ fontSize:12, color:'var(--text-body)' }}>{v}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ padding:'12px 14px', background:'var(--bg-input)', borderRadius:10, marginBottom:12 }}>
              <div style={{ fontSize:15, color:'var(--text-primary)', fontWeight:600, marginBottom:4 }}>{ticket.hotel_name}</div>
              {ticket.ticket_data?.hotelAddress && <div style={{ fontSize:11, color:'var(--text-dim)' }}>{ticket.ticket_data.hotelAddress}</div>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                ['Check-in',   ticket.check_in_date?.slice(0,10)  || '—'],
                ['Check-out',  ticket.check_out_date?.slice(0,10) || '—'],
                ['Room',       ticket.room_type  || 'Standard'],
                ['Nights',     ticket.ticket_data?.numNights || '—'],
                ['Vendor',     ticket.vendor || '—'],
                ['Amount',     `₹${Number(ticket.amount).toLocaleString('en-IN')}`],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'var(--bg-input)', borderRadius:7, padding:'8px 10px' }}>
                  <div style={{ fontSize:9, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{k}</div>
                  <div style={{ fontSize:12, color:'var(--text-body)' }}>{v}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Status + issued */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, paddingTop:12, borderTop:'1px solid var(--border)' }}>
          <span style={{ fontSize:10, background: ticket.status==='confirmed'?'color-mix(in srgb, var(--success) 9%, transparent)':'color-mix(in srgb, var(--danger) 9%, transparent)', color:ticket.status==='confirmed'?'var(--success)':'var(--danger)', padding:'3px 10px', borderRadius:20 }}>
            ● {ticket.status?.toUpperCase()}
          </span>
          <span style={{ fontSize:10, color:'var(--text-dim)' }}>Issued: {new Date(ticket.created_at).toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding:'12px 22px', borderTop:'1px solid var(--bg-input)', display:'flex', gap:8 }}>
        <button onClick={printTicket} style={{
          flex:1, padding:'9px 14px', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:500,
          background:`${accentColor}18`, color:accentColor, border:`1px solid ${accentColor}35`,
        }}>🖨️ Print / Save PDF</button>
        {onClose && (
          <button onClick={onClose} style={{ padding:'9px 14px', borderRadius:8, cursor:'pointer', fontSize:12, background:'none', border:'1px solid var(--border-input)', color:'var(--text-faint)' }}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}
