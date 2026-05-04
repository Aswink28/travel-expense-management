import { useState, useEffect } from 'react'
import { requestsAPI, docsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, PageTitle, StatusPill, BookingBadge, Button, Alert, Spinner, Modal } from '../shared/UI'

const MODE_ICONS = { Train:'🚂', Bus:'🚌', Flight:'✈️', Metro:'🚇', Cab:'🚕', Rapido:'🏍', Auto:'🛺' }

function TicketsPanel({ tickets = [], documents = [] }) {
  const hasItems = tickets.length > 0 || documents.length > 0;

  if (!hasItems) return (
    <div style={{ padding:'16px 14px', background:'var(--bg-card, var(--bg-input))', borderRadius:8, fontSize:12, color:'var(--text-faint)', textAlign:'center' }}>
      No tickets or documents available yet
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {tickets.map(t => (
        <div key={`t-${t.id}`} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-card, var(--bg-input))', borderRadius:8 }}>
          <div>
            <div style={{ fontSize:12, color:'var(--text-body, var(--text-body))' }}>
              🎟️ API Confirmed E-Ticket
            </div>
            <div style={{ fontSize:10, color:'var(--text-faint, var(--text-dim))', marginTop:2 }}>
              {t.vendor} · PNR: {t.pnr_number}
            </div>
          </div>
          <div style={{ fontSize:11, background:'color-mix(in srgb, var(--success) 9%, transparent)', color: 'var(--text-success)', border:'1px solid color-mix(in srgb, var(--success) 19%, transparent)', padding:'4px 10px', borderRadius:6 }}>
            Confirmed
          </div>
        </div>
      ))}
      {documents.map(d => (
        <div key={`d-${d.id}`} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-card, var(--bg-input))', borderRadius:8 }}>
          <div>
            <div style={{ fontSize:12, color:'var(--text-body, var(--text-body))' }}>
              {d.doc_type === 'ticket' ? '🎟️' : d.doc_type === 'hotel_voucher' ? '🏨' : '📄'} {d.original_name}
            </div>
            <div style={{ fontSize:10, color:'var(--text-faint, var(--text-dim))', marginTop:2 }}>
              {d.doc_type} · Uploaded {new Date(d.created_at).toLocaleDateString('en-IN')}
              {d.description && ` · ${d.description}`}
            </div>
          </div>
          <a href={docsAPI.download(d.id)} target="_blank" rel="noopener noreferrer"
             style={{ fontSize:11, background:'color-mix(in srgb, var(--accent) 9%, transparent)', color:'var(--accent, var(--accent))', border:'1px solid color-mix(in srgb, var(--accent) 19%, transparent)', padding:'4px 10px', borderRadius:6, textDecoration:'none', whiteSpace:'nowrap' }}>
            ⬇ Download
          </a>
        </div>
      ))}
    </div>
  )
}

export default function RequestsList({ onNewRequest }) {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter,   setFilter]   = useState('all')

  useEffect(() => {
    requestsAPI.list()
      .then(d => setRequests(d.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function loadDetail(id) {
    setDetailLoading(true)
    try {
      const d = await requestsAPI.get(id)
      setDetail(d.data)
    } catch {}
    finally { setDetailLoading(false) }
  }

  function selectRow(r) {
    if (selected?.id === r.id) { setSelected(null); setDetail(null); return }
    setSelected(r); loadDetail(r.id)
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter || r.booking_status === filter)

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24 }}>
        <PageTitle title="My Requests" sub={`${filtered.length} total`} />
        <div style={{ display:'flex', gap:10 }}>
          {/* Status filter is only useful when there's something to filter — hide
             the dropdown entirely on a fresh / empty list so the toolbar isn't
             cluttered with a control that has nothing to act on. The check uses
             the unfiltered `requests` length (not `filtered`) so a user who
             filters down to zero results can still pick a different status. */}
          {requests.length > 0 && (
            <select value={filter} onChange={e=>setFilter(e.target.value)} style={{ background:'var(--bg-card, var(--bg-input))', border:'1px solid var(--border, var(--border-input))', borderRadius:8, color:'var(--text-body, var(--text-body))', fontSize:12, padding:'7px 12px', outline:'none' }}>
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="pending_finance">Pending Finance</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="booked">Booked</option>
            </select>
          )}
          {user.role !== 'Booking Admin' && (
            <Button variant="primary" style={{ background:user.color||'var(--accent)' }} onClick={onNewRequest}>+ New Request</Button>
          )}
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-faint)' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>◈</div>
          <div style={{ fontSize:14 }}>No requests found</div>
        </div>
      ) : (
        <Card style={{ overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border, var(--border))' }}>
                {['ID','Employee','Route','Mode','Booking','Dates','Budget','Status','Tickets'].map(h => (
                  <th key={h} style={{ padding:'11px 13px', textAlign:'left', fontSize:10, color:'var(--text-label, var(--border-strong))', fontWeight:500, textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}
                  onClick={() => selectRow(r)}
                  style={{ borderBottom:'1px solid var(--border-soft, var(--bg-card))', cursor:'pointer', background:selected?.id===r.id?'var(--bg-row-hover, #1A1A26)':'transparent', transition:'background .1s' }}
                  onMouseEnter={e=>{ if(selected?.id!==r.id) e.currentTarget.style.background='var(--bg-row-hover, #161620)' }}
                  onMouseLeave={e=>{ if(selected?.id!==r.id) e.currentTarget.style.background='transparent' }}>
                  <td style={{ padding:'11px 13px', fontSize:10, color:'var(--text-faint, var(--text-dim))', fontFamily:'monospace' }}>{r.id}</td>
                  <td style={{ padding:'11px 13px' }}>
                    <div style={{ fontSize:12, color:'#DDD', fontWeight:500 }}>{r.user_name}</div>
                    <div style={{ fontSize:10, color:'var(--text-faint, var(--text-dim))', marginTop:1 }}>{r.user_role}</div>
                  </td>
                  <td style={{ padding:'11px 13px', fontSize:12, color:'var(--text-muted, var(--text-faint))' }}>{r.from_location} → {r.to_location}</td>
                  <td style={{ padding:'11px 13px', fontSize:13 }}>{MODE_ICONS[r.travel_mode]||'🚀'} <span style={{ fontSize:11, color:'var(--text-faint)' }}>{r.travel_mode}</span></td>
                  <td style={{ padding:'11px 13px' }}><BookingBadge type={r.booking_type} /></td>
                  <td style={{ padding:'11px 13px', fontSize:11, color:'var(--text-faint)' }}>{r.start_date?.slice(0,10)} → {r.end_date?.slice(0,10)}</td>
                  <td style={{ padding:'11px 13px' }}>
                    {r.approved_total ? (
                      <div style={{ fontSize:12, color: 'var(--text-success)', fontWeight:500 }}>₹{Number(r.approved_total).toLocaleString('en-IN')}</div>
                    ) : (
                      <div style={{ fontSize:11, color:'var(--text-faint, var(--text-dim))' }}>₹{Number(r.estimated_total).toLocaleString('en-IN')} est.</div>
                    )}
                    {r.wallet_credited && <div style={{ fontSize:10, color: 'var(--text-success)', marginTop:2 }}>💳 Wallet loaded</div>}
                  </td>
                  <td style={{ padding:'11px 13px' }}>
                    <StatusPill status={r.status} />
                    {r.status === 'rejected' && (() => {
                      const rej = r.approvals?.find(a => a.action === 'rejected')
                      return rej?.note ? (
                        <div style={{ fontSize:10, color: 'var(--text-danger)', marginTop:4, maxWidth:160, lineHeight:1.4 }}>
                          ✗ {rej.note}
                        </div>
                      ) : null
                    })()}
                  </td>
                  <td style={{ padding:'11px 13px' }}>
                    {r.documents?.length > 0 && (
                      <span style={{ fontSize:10, background:'color-mix(in srgb, var(--accent) 9%, transparent)', color:'var(--accent, var(--accent))', padding:'3px 8px', borderRadius:6 }}>
                        📎 {r.documents.length}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Detail panel */}
      {selected && (
        <Card style={{ padding:24, marginTop:14 }} className="fade-up">
          {detailLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:30 }}><Spinner /></div>
          ) : detail ? (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:18 }}>
                <div>
                  <div className="syne" style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>{detail.id} — {detail.user_name}</div>
                  <div style={{ fontSize:12, color:'var(--text-faint, var(--text-dim))', marginTop:3 }}>{detail.purpose} · {detail.from_location} → {detail.to_location} · {MODE_ICONS[detail.travel_mode]} {detail.travel_mode}</div>
                </div>
                <button onClick={() => { setSelected(null); setDetail(null) }} style={{ background:'none', border:'none', color:'var(--text-faint)', cursor:'pointer', fontSize:20 }}>✕</button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:18 }}>
                {[
                  ['Travel Cost', `₹${Number(detail.approved_travel_cost||detail.estimated_travel_cost||0).toLocaleString('en-IN')}`, 'var(--accent)'],
                  ['Hotel Cost',  `₹${Number(detail.approved_hotel_cost||detail.estimated_hotel_cost||0).toLocaleString('en-IN')}`,  'var(--purple)'],
                  ['Allowance',   `₹${Number(detail.approved_allowance||0).toLocaleString('en-IN')}`, 'var(--success)'],
                  ['Total',       `₹${Number(detail.approved_total||detail.estimated_total||0).toLocaleString('en-IN')}`, user.color||'var(--accent)'],
                ].map(([k,v,c]) => (
                  <div key={k} style={{ background:'var(--bg-card, var(--bg-input))', borderRadius:9, padding:14 }}>
                    <div style={{ fontSize:10, color:'var(--text-label, var(--border-strong))', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>{k}</div>
                    <div className="syne" style={{ fontSize:16, fontWeight:700, color:c }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Approval trail */}
              {detail.approvals?.length > 0 && (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:11, color:'var(--text-label, var(--border-strong))', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:8 }}>Approval Trail</div>
                  {detail.approvals.map((a,i) => (
                    <div key={i} style={{ padding:'10px 12px', background: a.action==='rejected' ? 'color-mix(in srgb, var(--danger) 5%, transparent)' : 'var(--bg-card, var(--bg-input))', border: a.action==='rejected' ? '1px solid color-mix(in srgb, var(--danger) 20%, transparent)' : '1px solid transparent', borderRadius:8, marginBottom:4 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <span style={{ fontSize:12, color:a.action==='approved'?'var(--success)':'var(--danger)' }}>{a.action==='approved'?'✓':'✗'}</span>
                        <span style={{ fontSize:12, color:'var(--text-body, var(--text-body))', flex:1 }}>{a.approver_name} <span style={{ color:'var(--text-faint, var(--text-dim))' }}>({a.approver_role})</span></span>
                        <span style={{ fontSize:10, color:'var(--text-faint)' }}>{new Date(a.acted_at).toLocaleString('en-IN')}</span>
                      </div>
                      {a.note && (
                        <div style={{ marginTop:6, paddingLeft:24 }}>
                          <span style={{ fontSize:10, color: a.action==='rejected' ? 'var(--danger)' : 'var(--text-faint)', textTransform:'uppercase', letterSpacing:'.04em', fontWeight:600 }}>
                            {a.action==='rejected' ? 'Rejection Reason' : 'Note'}:
                          </span>
                          <span style={{ fontSize:12, color: a.action==='rejected' ? 'var(--danger)' : 'var(--text-muted)', marginLeft:6, fontStyle:'italic' }}>"{a.note}"</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tickets / Documents */}
              <div>
                <div style={{ fontSize:11, color:'var(--text-label, var(--border-strong))', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Tickets & Documents</div>
                <TicketsPanel tickets={detail.tickets} documents={detail.documents} />
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  )
}
