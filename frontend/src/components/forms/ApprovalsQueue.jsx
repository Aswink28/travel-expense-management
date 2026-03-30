import { useState, useEffect, useCallback } from 'react'
import { requestsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, PageTitle, StatusPill, BookingBadge, Button, Modal, Alert, Spinner } from '../shared/UI'

const MODE_ICONS = { Train:'🚂', Bus:'🚌', Flight:'✈️', Metro:'🚇', Cab:'🚕', Rapido:'🏍', Auto:'🛺' }

export default function ApprovalsQueue() {
  const { user } = useAuth()
  const [queue,   setQueue]   = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [note,    setNote]    = useState('')
  const [amounts, setAmounts] = useState({ travel:'', hotel:'', allowance:'' })
  const [acting,  setActing]  = useState(false)
  const [error,   setError]   = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([requestsAPI.queue(), requestsAPI.list()])
      .then(([q, all]) => {
        setQueue(q.data||[])
        setHistory((all.data||[]).filter(r => r.approvals?.some(a=>a.approver_name===user.name)))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [user.name])

  useEffect(() => { load() }, [load])

  function openModal(r) {
    setModal(r)
    setAmounts({ travel:r.estimated_travel_cost||'', hotel:r.estimated_hotel_cost||'', allowance:'' })
    setNote(''); setError('')
  }

  async function doAction(action) {
    if (action === 'rejected' && !note.trim()) { setError('Rejection note is required'); return }
    try {
      setActing(true); setError('')
      await requestsAPI.action(modal.id, {
        action, note: note || undefined,
        approved_travel_cost: amounts.travel ? Number(amounts.travel) : undefined,
        approved_hotel_cost:  amounts.hotel  ? Number(amounts.hotel)  : undefined,
        approved_allowance:   amounts.allowance ? Number(amounts.allowance) : undefined,
      })
      setModal(null); setNote('')
      load()
    } catch(e) { setError(e.message) }
    finally { setActing(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title={user.role === 'Finance' ? 'Finance Approvals' : 'Approval Queue'} sub={`${queue.length} requests need your action`} />

      {error && <Alert type="error">{error}</Alert>}

      {/* Role authority card */}
      <Card style={{ padding:16, marginBottom:22 }}>
        <div style={{ fontSize:11, color:'#3A3A4A', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Your approval authority as {user.role}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
          {user.role === 'Tech Lead'   && <span style={{ fontSize:12, background:'#0A84FF18', color:'#0A84FF', padding:'4px 12px', borderRadius:6 }}>Approves Employee requests (hierarchy lane)</span>}
          {user.role === 'Manager'     && <span style={{ fontSize:12, background:'#FF9F0A18', color:'#FF9F0A', padding:'4px 12px', borderRadius:6 }}>Approves Employee + TL requests (hierarchy lane)</span>}
          {user.role === 'Finance'     && <span style={{ fontSize:12, background:'#40C8E018', color:'#40C8E0', padding:'4px 12px', borderRadius:6 }}>Mandatory finance approval + sets final amounts</span>}
          {user.role === 'Super Admin' && <span style={{ fontSize:12, background:'#30D15818', color:'#30D158', padding:'4px 12px', borderRadius:6 }}>Full access — covers both hierarchy + finance lanes</span>}
        </div>
        <div style={{ fontSize:11, color:'#444' }}>Approvals are parallel — hierarchy and Finance act independently. Wallet loads after BOTH lanes approve.</div>
      </Card>

      {queue.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#333' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>◎</div>
          <div style={{ fontSize:14 }}>All caught up!</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:28 }}>
          {queue.map(r => (
            <Card key={r.id} style={{ padding:22, borderLeft:`3px solid ${user.color||'#0A84FF'}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
                    <span className="syne" style={{ fontSize:16, fontWeight:700, color:'#F0F0F4' }}>{r.user_name}</span>
                    <StatusPill status={r.status} />
                    <BookingBadge type={r.booking_type} />
                    <span style={{ fontSize:16 }}>{MODE_ICONS[r.travel_mode]}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#666', marginBottom:3 }}>{r.user_role} · {r.from_location} → {r.to_location}</div>
                  <div style={{ fontSize:12, color:'#555', marginBottom:8 }}>{r.start_date?.slice(0,10)} → {r.end_date?.slice(0,10)} ({r.total_days} days) · {r.purpose}</div>
                  {r.approvals?.length > 0 && (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {r.approvals.map((a,i) => (
                        <span key={i} style={{ fontSize:10, background:a.action==='approved'?'#30D15818':'#FF453A18', color:a.action==='approved'?'#30D158':'#FF453A', padding:'2px 8px', borderRadius:5 }}>
                          {a.action==='approved'?'✓':'✗'} {a.approver_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right', flexShrink:0, marginLeft:20 }}>
                  <div className="syne" style={{ fontSize:24, fontWeight:800, color:'#F0F0F4' }}>₹{Number(r.estimated_total).toLocaleString('en-IN')}</div>
                  <div style={{ fontSize:10, color:'#555', marginBottom:12 }}>{r.id}</div>
                  <div style={{ display:'flex', gap:8 }}>
                    <Button variant="danger"  size="sm" onClick={() => openModal(r)}>Reject</Button>
                    <Button variant="success" size="sm" onClick={() => openModal(r)}>Approve ✓</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <>
          <div style={{ fontSize:11, color:'#3A3A4A', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>Approval History</div>
          <Card style={{ overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ borderBottom:'1px solid #1E1E2A' }}>
                {['Request','Employee','Route','Amount','Your Action','Final Status'].map(h=>(
                  <th key={h} style={{ padding:'10px 13px', textAlign:'left', fontSize:10, color:'#3A3A4A', fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {history.slice(0,12).map(r => {
                  const my = r.approvals?.find(a=>a.approver_name===user.name)
                  return (
                    <tr key={r.id} style={{ borderBottom:'1px solid #14141E' }}>
                      <td style={{ padding:'10px 13px', fontSize:10, color:'#555', fontFamily:'monospace' }}>{r.id}</td>
                      <td style={{ padding:'10px 13px', fontSize:12, color:'#ccc' }}>{r.user_name}</td>
                      <td style={{ padding:'10px 13px', fontSize:11, color:'#777' }}>{r.from_location}→{r.to_location}</td>
                      <td style={{ padding:'10px 13px', fontSize:12, color:'#aaa' }}>₹{Number(r.estimated_total||0).toLocaleString('en-IN')}</td>
                      <td style={{ padding:'10px 13px' }}>
                        {my && <span style={{ fontSize:11, color:my.action==='approved'?'#30D158':'#FF453A' }}>{my.action==='approved'?'✓ Approved':'✗ Rejected'}</span>}
                      </td>
                      <td style={{ padding:'10px 13px' }}><StatusPill status={r.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Action modal */}
      {modal && (
        <Modal title={`Review — ${modal.id}`} onClose={() => { setModal(null); setNote(''); setError('') }}>
          <div style={{ fontSize:12, color:'#555', marginBottom:14 }}>
            {modal.user_name} ({modal.user_role}) · {modal.from_location} → {modal.to_location} · {MODE_ICONS[modal.travel_mode]} {modal.travel_mode}
          </div>

          <div style={{ background:'#1A1A22', borderRadius:10, padding:14, marginBottom:16 }}>
            {[
              ['Travel Cost (est.)',  `₹${Number(modal.estimated_travel_cost||0).toLocaleString('en-IN')}`],
              ['Hotel Cost (est.)',   `₹${Number(modal.estimated_hotel_cost||0).toLocaleString('en-IN')}`],
              ['Allowance',          `₹${Number(modal.total_days||1) * 500} (${modal.total_days} days × ₹500)`],
              ['Total Estimated',    `₹${Number(modal.estimated_total||0).toLocaleString('en-IN')}`],
              ['Purpose',            modal.purpose],
              ['Dates',              `${modal.start_date?.slice(0,10)} → ${modal.end_date?.slice(0,10)}`],
            ].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #222' }}>
                <span style={{ fontSize:11, color:'#555' }}>{k}</span>
                <span style={{ fontSize:11, color:'#ccc' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Finance can set amounts */}
          {['Finance','Super Admin','Manager'].includes(user.role) && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:'#555', marginBottom:8, textTransform:'uppercase', letterSpacing:'.04em' }}>
                Approved Amounts (leave blank to approve as estimated)
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {[['Travel',amounts.travel,'travel'],['Hotel',amounts.hotel,'hotel'],['Allowance',amounts.allowance,'allowance']].map(([label,val,key])=>(
                  <div key={key}>
                    <label style={{ fontSize:10, color:'#555', display:'block', marginBottom:4 }}>{label} (₹)</label>
                    <input type="number" min="0" value={val} onChange={e=>setAmounts(p=>({...p,[key]:e.target.value}))}
                      placeholder="As estimated" style={{ width:'100%', background:'#1A1A22', border:'1px solid #2A2A35', borderRadius:6, color:'#E2E2E8', fontSize:12, padding:'7px 10px', outline:'none' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }}>
              Note <span style={{ color:'#FF453A' }}>* required to reject</span>
            </label>
            <textarea rows={3} value={note} onChange={e=>{ setNote(e.target.value); setError('') }} placeholder="Add a rejection reason or approval note..."
              style={{ width:'100%', background:'#1A1A22', border: error && !note.trim() ? '1px solid #FF453A' : '1px solid #2A2A35', borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'10px 12px', outline:'none', resize:'none', transition:'border 0.2s' }} />
          </div>

          <Alert type="info">◈ Parallel approval — your action is independent. Wallet loads when both lanes complete.</Alert>
          {error && <Alert type="error">{error}</Alert>}

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <Button variant="ghost"   onClick={() => { setModal(null); setNote(''); setError('') }} disabled={acting}>Cancel</Button>
            <Button variant="danger"  onClick={() => doAction('rejected')} disabled={acting}>{acting?'Saving...':'Reject'}</Button>
            <Button variant="success" onClick={() => doAction('approved')} disabled={acting}>{acting?'Saving...':'Approve ✓'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
