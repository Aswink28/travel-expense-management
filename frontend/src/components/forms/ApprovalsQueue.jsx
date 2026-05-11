import { useState, useEffect, useCallback } from 'react'
import { requestsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, StatusPill, BookingBadge, Button, Modal, Alert, Spinner } from '../shared/UI'
import { fmtDate, fmtTime, fmtDateTime } from '../../utils/formatDate'

const MODE_ICONS = { Train:'🚂', Bus:'🚌', Flight:'✈️', Metro:'🚇', Cab:'🚕', Rapido:'🏍', Auto:'🛺' }

export default function ApprovalsQueue({ onAction }) {
  const { user } = useAuth()
  const [queue,   setQueue]   = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [note,    setNote]    = useState('')
  const [amounts, setAmounts] = useState({ travel:'', hotel:'', allowance:'' })
  const [acting,  setActing]  = useState(false)
  const [error,   setError]   = useState('')
  const [walletWarning, setWalletWarning] = useState(null)
  const [toast,   setToast]   = useState(null) // { type:'success'|'error', message }

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

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
    const requestName = modal.user_name
    const requestId   = modal.id
    try {
      setActing(true); setError('')
      const result = await requestsAPI.action(modal.id, {
        action, note: note || undefined,
        approved_travel_cost: amounts.travel ? Number(amounts.travel) : undefined,
        approved_hotel_cost:  amounts.hotel  ? Number(amounts.hotel)  : undefined,
        approved_allowance:   amounts.allowance ? Number(amounts.allowance) : undefined,
      })
      // Optimistically remove the actioned request from the queue immediately
      setQueue(prev => prev.filter(r => r.id !== requestId))
      setModal(null); setNote('')
      // Show success toast
      setToast({
        type: 'success',
        message: action === 'approved'
          ? `Request by ${requestName} has been approved successfully`
          : `Request by ${requestName} has been rejected`,
      })
      if (result.walletWarning) {
        setWalletWarning(result.walletWarning)
      }
      // Notify parent to refresh sidebar badge count immediately
      onAction?.()
      // Full reload to sync history table and catch any server-side state changes
      load()
    } catch(e) {
      setError(e.message)
      setToast({
        type: 'error',
        message: `Failed to ${action === 'approved' ? 'approve' : 'reject'} request — ${e.message}`,
      })
    }
    finally { setActing(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up page-approvals">
      <div className="page-hero">
        <div className="page-hero-content">
          <h1 className="page-hero-title">{user.role === 'Finance' ? 'Finance Approvals' : 'Approval Queue'}</h1>
          <p className="page-hero-sub">{queue.length} request{queue.length !== 1 ? 's' : ''} need your action</p>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999, minWidth: 340, maxWidth: 480,
          padding: '14px 18px', borderRadius: 12,
          background: toast.type === 'success' ? 'var(--bg-card)' : 'var(--bg-card)',
          border: `1px solid ${toast.type === 'success' ? 'color-mix(in srgb, var(--success) 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`,
          boxShadow: `0 8px 32px color-mix(in srgb, ${toast.type === 'success' ? 'var(--success)' : 'var(--danger)'} 10%, transparent), 0 2px 8px rgba(0,0,0,.12)`,
          display: 'flex', alignItems: 'flex-start', gap: 12,
          animation: 'fadeUp .3s ease',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            background: toast.type === 'success'
              ? 'color-mix(in srgb, var(--success) 12%, transparent)'
              : 'color-mix(in srgb, var(--danger) 12%, transparent)',
            color: toast.type === 'success' ? 'var(--success)' : 'var(--danger)',
          }}>
            {toast.type === 'success' ? '\u2713' : '\u2717'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: toast.type === 'success' ? 'var(--text-success)' : 'var(--text-danger)', marginBottom: 2 }}>
              {toast.type === 'success' ? 'Action Completed' : 'Action Failed'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{toast.message}</div>
          </div>
          <button onClick={() => setToast(null)} style={{
            background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
            fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0, marginTop: 2,
          }}>&times;</button>
        </div>
      )}

      {error && !modal && <Alert type="error">{error}</Alert>}

      {/* Role authority card */}
      <Card style={{ padding:16, marginBottom:22 }} className="authority-card">
        <div style={{ fontSize:11, color:'var(--border-strong)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Your approval authority as {user.role}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
          {user.role === 'Request Approver' && <span style={{ fontSize:12, background:'color-mix(in srgb, var(--purple) 9%, transparent)', color:'var(--purple)', padding:'4px 12px', borderRadius:6 }}>Approves at your tier — your designation drives the order in the sequential chain</span>}
          {user.role === 'Finance'           && <span style={{ fontSize:12, background:'color-mix(in srgb, var(--info) 9%, transparent)', color:'var(--info)', padding:'4px 12px', borderRadius:6 }}>Mandatory finance approval + sets final amounts</span>}
          {user.designation && (
            <span style={{ fontSize:11, background:'var(--bg-input)', color:'var(--text-faint)', padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)' }}>
              Designation: <strong style={{ color:'var(--text-body)' }}>{user.designation}</strong>
            </span>
          )}
        </div>
        <div style={{ fontSize:11, color:'var(--text-dim)' }}>Hierarchy approvals run sequentially by tier; Finance approves the budget in its own lane. Wallet loads only after both complete.</div>
      </Card>

      {queue.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◎</div>
          <div className="empty-state-text">All caught up!</div>
          <div className="empty-state-sub">No pending approval requests in your queue</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:28 }}>
          {queue.map(r => (
            <Card key={r.id} className="approval-card" style={{ padding:22, borderLeft:`3px solid ${user.color||'var(--accent)'}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:5 }}>
                    <span className="syne" style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>{r.user_name}</span>
                    <StatusPill status={r.status} />
                    <BookingBadge type={r.booking_type} />
                    <span style={{ fontSize:16 }}>{MODE_ICONS[r.travel_mode]}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--text-faint)', marginBottom:3 }}>{r.user_role} · {r.from_location} → {r.to_location}</div>
                  <div style={{ fontSize:12, color:'var(--text-dim)', marginBottom:8 }}>{fmtDate(r.start_date)} → {fmtDate(r.end_date)} ({r.total_days} days) · {r.purpose}</div>
                  {r.approvals?.length > 0 && (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {r.approvals.map((a,i) => (
                        <span key={i} style={{ fontSize:10, background:a.action==='approved'?'color-mix(in srgb, var(--success) 9%, transparent)':'color-mix(in srgb, var(--danger) 9%, transparent)', color:a.action==='approved'?'var(--success)':'var(--danger)', padding:'2px 8px', borderRadius:5 }}>
                          {a.action==='approved'?'✓':'✗'} {a.approver_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign:'right', flexShrink:0, marginLeft:20 }}>
                  <div className="syne" style={{ fontSize:24, fontWeight:800, color:'var(--text-primary)' }}>₹{Number(r.estimated_total).toLocaleString('en-IN')}</div>
                  <div style={{ fontSize:10, color:'var(--text-dim)', marginBottom:12 }}>{r.id}</div>
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
          <div className="section-label">Approval History</div>
          <Card style={{ overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                {['Request','Employee','Route','Amount','Your Action','Final Status'].map(h=>(
                  <th key={h} style={{ padding:'10px 13px', textAlign:'left', fontSize:10, color:'var(--border-strong)', fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {history.slice(0,12).map(r => {
                  const my = r.approvals?.find(a=>a.approver_name===user.name)
                  return (
                    <tr key={r.id} style={{ borderBottom:'1px solid var(--bg-card)' }}>
                      <td style={{ padding:'10px 13px', fontSize:10, color:'var(--text-dim)', fontFamily:'monospace' }}>{r.id}</td>
                      <td style={{ padding:'10px 13px', fontSize:12, color:'var(--text-body)' }}>{r.user_name}</td>
                      <td style={{ padding:'10px 13px', fontSize:11, color:'var(--text-faint)' }}>{r.from_location}→{r.to_location}</td>
                      <td style={{ padding:'10px 13px', fontSize:12, color:'var(--text-muted)' }}>₹{Number(r.estimated_total||0).toLocaleString('en-IN')}</td>
                      <td style={{ padding:'10px 13px' }}>
                        {my && <span style={{ fontSize:11, color:my.action==='approved'?'var(--success)':'var(--danger)' }}>{my.action==='approved'?'✓ Approved':'✗ Rejected'}</span>}
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
          <div style={{ fontSize:12, color:'var(--text-dim)', marginBottom:14 }}>
            {modal.user_name} ({modal.user_role}) · {modal.from_location} → {modal.to_location} · {MODE_ICONS[modal.travel_mode]} {modal.travel_mode}
          </div>

          <div style={{ background:'var(--bg-input)', borderRadius:10, padding:14, marginBottom:16 }}>
            {[
              ['Travel Cost (est.)',  `₹${Number(modal.estimated_travel_cost||0).toLocaleString('en-IN')}`],
              ['Hotel Cost (est.)',   `₹${Number(modal.estimated_hotel_cost||0).toLocaleString('en-IN')}`],
              ['Allowance',          `₹${Number(modal.total_days||1) * 500} (${modal.total_days} days × ₹500)`],
              ['Total Estimated',    `₹${Number(modal.estimated_total||0).toLocaleString('en-IN')}`],
              ['Purpose',            modal.purpose],
              ['Dates',              `${fmtDate(modal.start_date)} → ${fmtDate(modal.end_date)}`],
            ].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border-input)' }}>
                <span style={{ fontSize:11, color:'var(--text-dim)' }}>{k}</span>
                <span style={{ fontSize:11, color:'var(--text-body)' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Finance can set amounts */}
          {['Finance','Super Admin','Request Approver'].includes(user.role) && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:'var(--text-dim)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.04em' }}>
                Approved Amounts (leave blank to approve as estimated)
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {[['Travel',amounts.travel,'travel'],['Hotel',amounts.hotel,'hotel'],['Allowance',amounts.allowance,'allowance']].map(([label,val,key])=>(
                  <div key={key}>
                    <label style={{ fontSize:10, color:'var(--text-dim)', display:'block', marginBottom:4 }}>{label} (₹)</label>
                    <input type="number" min="0" value={val} onChange={e=>setAmounts(p=>({...p,[key]:e.target.value}))}
                      placeholder="As estimated" style={{ width:'100%', background:'var(--bg-input)', border:'1px solid var(--border-input)', borderRadius:6, color:'var(--text-body)', fontSize:12, padding:'7px 10px', outline:'none' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }}>
              Note <span style={{ color: 'var(--text-danger)' }}>* required to reject</span>
            </label>
            <textarea rows={3} value={note} onChange={e=>{ setNote(e.target.value); setError('') }} placeholder="Add a rejection reason or approval note..."
              style={{ width:'100%', background:'var(--bg-input)', border: error && !note.trim() ? '1px solid var(--danger)' : '1px solid var(--border-input)', borderRadius:8, color:'var(--text-body)', fontSize:13, padding:'10px 12px', outline:'none', resize:'none', transition:'border 0.2s' }} />
          </div>

          <Alert type="info">◈ Parallel approval — your action is independent. Wallet loads when both lanes complete.</Alert>
          {error && <Alert type="error">{error}</Alert>}

          <div className="modal-footer">
            <Button variant="ghost"   onClick={() => { setModal(null); setNote(''); setError('') }} disabled={acting}>Cancel</Button>
            <Button variant="danger"  onClick={() => doAction('rejected')} disabled={acting}>{acting?'Saving...':'Reject'}</Button>
            <Button variant="success" onClick={() => doAction('approved')} disabled={acting}>{acting?'Saving...':'Approve ✓'}</Button>
          </div>
        </Modal>
      )}

      {/* Wallet Warning Popup */}
      {walletWarning && (
        <Modal title="" onClose={() => setWalletWarning(null)} width={440}>
          <div style={{ textAlign:'center', padding:'10px 0 6px' }}>
            <div style={{
              width:56, height:56, borderRadius:'50%', margin:'0 auto 14px',
              background:'color-mix(in srgb, var(--warning) 8%, transparent)', border:'2px solid color-mix(in srgb, var(--warning) 19%, transparent)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:28,
            }}>⚠</div>
            <div className="syne" style={{ fontSize:18, fontWeight:700, marginBottom:8, color: 'var(--text-warning)' }}>
              Wallet Load Skipped
            </div>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:20, lineHeight:1.6, padding:'0 10px' }}>
              {walletWarning}
            </div>
            <Button style={{ width:'100%', justifyContent:'center', background:'var(--warning)', color:'var(--bg-app)' }} onClick={() => setWalletWarning(null)}>
              Understood
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
