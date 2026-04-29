import { useState, useEffect, useCallback } from 'react'
import { walletAPI, requestsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, PageTitle, Button, Modal, Alert, Spinner, Select, Input } from '../shared/UI'

const CAT_ICONS = { travel:'✈️', hotel:'🏨', allowance:'🎯', credit:'💳', other:'📋' }

export default function WalletPage() {
  const { user, updateWallet } = useAuth()
  const [wallet,   setWallet]   = useState(null)
  const [txns,     setTxns]     = useState([])
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ request_id:'', amount:'', category:'allowance', description:'', reference:'' })

  const [ppiWallet, setPpiWallet] = useState(user.ppiWallet || null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [w, t, r] = await Promise.all([
        walletAPI.balance(),
        walletAPI.transactions(),
        requestsAPI.list('approved'),
        walletAPI.ppiBalance().then(d => { if (d?.data) setPpiWallet(d.data) }).catch(() => {}),
      ])
      setWallet(w.data)
      updateWallet?.(w.data)
      setTxns(t.data||[])
      setRequests((r.data||[]).filter(req => req.booking_type === 'self'))
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDebit(e) {
    e.preventDefault()
    if (!form.request_id||!form.amount||!form.category||!form.description) {
      setError('All fields required'); return
    }
    try {
      setSubmitting(true); setError(''); setSuccess('')
      const res = await walletAPI.debit({ ...form, amount:Number(form.amount) })
      setSuccess(`₹${form.amount} deducted. New balance: ₹${Number(res.data.new_balance).toLocaleString('en-IN')}`)
      setModal(false)
      setForm({ request_id:'', amount:'', category:'allowance', description:'', reference:'' })
      load()
    } catch(e) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title="My Wallet" sub="Prepaid travel account — all transactions tracked" />

      {error   && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* Suspended / Closed warning */}
      {ppiWallet && (ppiWallet.walletStatus || '').toUpperCase() === 'SUSPENDED' && (
        <div style={{ background:'color-mix(in srgb, var(--warning) 6%, transparent)', border:'1px solid color-mix(in srgb, var(--warning) 15%, transparent)', borderRadius:12, padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:24 }}>⏸</span>
          <div>
            <div style={{ fontSize:14, color: 'var(--text-warning)', fontWeight:600 }}>Wallet Suspended</div>
            <div style={{ fontSize:12, color:'var(--text-muted, var(--text-faint))', marginTop:2 }}>Your wallet is temporarily frozen. You cannot make transactions or log expenses. Please contact your administrator.</div>
          </div>
        </div>
      )}
      {ppiWallet && (ppiWallet.walletStatus || '').toUpperCase() === 'CLOSED' && (
        <div style={{ background:'color-mix(in srgb, var(--danger) 6%, transparent)', border:'1px solid color-mix(in srgb, var(--danger) 15%, transparent)', borderRadius:12, padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:24 }}>⛔</span>
          <div>
            <div style={{ fontSize:14, color: 'var(--text-danger)', fontWeight:600 }}>Wallet Closed</div>
            <div style={{ fontSize:12, color:'var(--text-muted, var(--text-faint))', marginTop:2 }}>Your wallet has been permanently closed. No further transactions are possible. Please contact your administrator.</div>
          </div>
        </div>
      )}

      {/* Wallet Balance Card */}
      <Card style={{ padding:22, marginBottom:16, background:'var(--bg-card-deep, var(--bg-app))', borderColor:'var(--border, var(--border))', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-20, top:-20, width:120, height:120, borderRadius:'50%', background:user.color||'var(--accent)', opacity:.06, pointerEvents:'none' }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text-faint, var(--text-dim))', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Wallet Balance</div>
            <div className="syne" style={{ fontSize:36, fontWeight:800, color:user.color||'var(--accent)', letterSpacing:'-.04em' }}>
              ₹{Number(ppiWallet?.balance ?? wallet?.balance ?? 0).toLocaleString('en-IN')}
            </div>
            <div style={{ display:'flex', gap:6, marginTop:8 }}>
              {ppiWallet ? (
                <>
                  <span style={{ fontSize:10, background:'color-mix(in srgb, var(--success) 9%, transparent)', color: 'var(--text-success)', padding:'2px 8px', borderRadius:10 }}>● {ppiWallet.walletStatus}</span>
                  <span style={{ fontSize:10, background:'color-mix(in srgb, var(--accent) 9%, transparent)', color:'var(--accent)', padding:'2px 8px', borderRadius:10 }}>KYC: {ppiWallet.kycStatus}</span>
                  <span style={{ fontSize:10, background:'color-mix(in srgb, var(--purple) 9%, transparent)', color:'var(--purple)', padding:'2px 8px', borderRadius:10 }}>{ppiWallet.walletNumber}</span>
                </>
              ) : (
                <span style={{ fontSize:10, background:'color-mix(in srgb, var(--success) 9%, transparent)', color: 'var(--text-success)', padding:'2px 8px', borderRadius:10 }}>● Active</span>
              )}
            </div>
          </div>
          {ppiWallet && (
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'var(--text-muted, var(--text-faint))' }}>Expires</div>
              <div style={{ fontSize:13, color:'var(--text-body, var(--text-body))', fontWeight:500 }}>{ppiWallet.expiryDate || '-'}</div>
            </div>
          )}
        </div>
        {/* Limits + Stats */}
        <div style={{ display:'grid', gridTemplateColumns: ppiWallet ? 'repeat(6,1fr)' : 'repeat(2,1fr)', gap:10 }}>
          {ppiWallet && [
            ['Max Balance',      ppiWallet.maxBalanceLimit,  'var(--accent)'],
            ['Monthly Load',     ppiWallet.monthlyLoadLimit, 'var(--success)'],
            ['Daily Txn Limit',  ppiWallet.dailyTxnLimit,   'var(--warning)'],
            ['Monthly Txn Limit',ppiWallet.monthlyTxnLimit,  'var(--purple)'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background:'var(--bg-card, var(--bg-card))', border:'1px solid var(--bg-input)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:9, color:'var(--text-dim, var(--text-dim))', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>{label}</div>
              <div className="syne" style={{ fontSize:15, fontWeight:700, color }}>
                ₹{Number(value||0).toLocaleString('en-IN')}
              </div>
            </div>
          ))}
          <div style={{ background:'var(--bg-card, var(--bg-card))', border:'1px solid var(--bg-input)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:9, color:'var(--text-dim, var(--text-dim))', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Total Credited</div>
            <div className="syne" style={{ fontSize:15, fontWeight:700, color: 'var(--text-success)' }}>
              ₹{Number(wallet?.total_credited||0).toLocaleString('en-IN')}
            </div>
          </div>
          <div style={{ background:'var(--bg-card, var(--bg-card))', border:'1px solid var(--bg-input)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:9, color:'var(--text-dim, var(--text-dim))', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Total Spent</div>
            <div className="syne" style={{ fontSize:15, fontWeight:700, color: 'var(--text-danger)' }}>
              ₹{Number(wallet?.total_debited||0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </Card>

      {/* Log expense — blocked if wallet not ACTIVE */}
      {requests.length > 0 && (!ppiWallet || (ppiWallet.walletStatus || '').toUpperCase() === 'ACTIVE') && (
        <div style={{ marginBottom:20 }}>
          <Button variant="primary" style={{ background:user.color||'var(--accent)' }} onClick={() => { setModal(true); setError('') }}>
            + Log Expense (Self Booking)
          </Button>
          <span style={{ fontSize:11, color:'var(--text-faint, var(--text-dim))', marginLeft:10 }}>For self-booking requests only</span>
        </div>
      )}

      {/* Flow info */}
      <Card style={{ padding:18, marginBottom:20 }}>
        <div style={{ fontSize:11, color:'var(--text-label, var(--border-strong))', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>How Your Wallet Works</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {['Request approved →','Travel + Hotel + Allowance credited separately','Self booking: log expenses yourself','Company booking: Admin deducts via booking panel','All transactions permanently logged'].map((s,i) => (
            <span key={i} style={{ fontSize:11, background:'var(--bg-card, var(--bg-input))', color:'var(--text-faint)', padding:'5px 10px', borderRadius:6 }}>{s}</span>
          ))}
        </div>
      </Card>

      {/* Transaction history */}
      <Card style={{ padding:22 }}>
        <div style={{ fontSize:13, color:'var(--text-muted, var(--text-faint))', fontWeight:500, marginBottom:16 }}>Transaction History</div>
        {txns.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--text-faint)', fontSize:13 }}>No transactions yet</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
              {['Date','Description','Category','Type','Amount','Balance After'].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, color:'var(--text-label, var(--border-strong))', fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {txns.map((t,i) => (
                <tr key={t.id} style={{ borderBottom: i<txns.length-1?'1px solid var(--border-soft, var(--bg-card))':'none' }}>
                  <td style={{ padding:'10px 12px', fontSize:10, color:'var(--text-faint, var(--text-dim))' }}>{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                  <td style={{ padding:'10px 12px', fontSize:12, color:'var(--text-body, var(--text-body))', maxWidth:220 }}>
                    <div>{t.description}</div>
                    {t.reference && <div style={{ fontSize:10, color:'var(--text-dim, var(--text-dim))', marginTop:2 }}>Ref: {t.reference}</div>}
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:12 }}>{CAT_ICONS[t.category]||'📋'}</span>
                    <span style={{ fontSize:11, color:'var(--text-faint, var(--text-faint))', marginLeft:5, textTransform:'capitalize' }}>{t.category}</span>
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:t.txn_type==='credit'?'color-mix(in srgb, var(--success) 9%, transparent)':'color-mix(in srgb, var(--danger) 9%, transparent)', color:t.txn_type==='credit'?'var(--success)':'var(--danger)' }}>
                      {t.txn_type}
                    </span>
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:13, fontWeight:500, color:t.txn_type==='credit'?'var(--success)':'var(--danger)' }}>
                      {t.txn_type==='credit'?'+':'−'}₹{Number(t.amount).toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td style={{ padding:'10px 12px', fontSize:12, color:'var(--text-muted, var(--text-faint))' }}>₹{Number(t.balance_after).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Log expense modal */}
      {modal && (
        <Modal title="Log Wallet Expense" onClose={() => { setModal(false); setError('') }}>
          <form onSubmit={handleDebit}>
            <Select label="Travel Request" value={form.request_id} onChange={e=>setForm(p=>({...p,request_id:e.target.value}))}>
              <option value="">Select approved self-booking request</option>
              {requests.map(r=>(
                <option key={r.id} value={r.id}>{r.id} — {r.from_location}→{r.to_location} (₹{Number(r.approved_total||r.estimated_total).toLocaleString('en-IN')})</option>
              ))}
            </Select>

            {/* Category selection */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'var(--text-faint, var(--text-dim))', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:10 }}>Category</label>
              <div style={{ display:'flex', gap:8 }}>
                {['travel','hotel','allowance','other'].map(cat => (
                  <button type="button" key={cat} onClick={() => setForm(p=>({...p,category:cat}))} style={{
                    flex:1, padding:'12px 8px', borderRadius:9, textAlign:'center', cursor:'pointer',
                    background:form.category===cat?(user.color||'var(--accent)')+'22':'var(--bg-card, var(--bg-input))',
                    border:`1px solid ${form.category===cat?(user.color||'var(--accent)')+'55':'var(--border, var(--border-input))'}`,
                  }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>{CAT_ICONS[cat]}</div>
                    <div style={{ fontSize:10, color:form.category===cat?(user.color||'var(--accent)'):'var(--text-faint)', textTransform:'capitalize' }}>{cat}</div>
                  </button>
                ))}
              </div>
            </div>

            <Input label="Amount (₹)" type="number" min="1" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} placeholder="Enter amount" />
            <Input label="Description" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="e.g. Rapido to station, lunch" />
            <Input label="Reference / Receipt No. (optional)" value={form.reference} onChange={e=>setForm(p=>({...p,reference:e.target.value}))} placeholder="e.g. UPI ref, receipt number" />

            <div style={{ background:'var(--bg-card, var(--bg-input))', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color:'var(--text-faint, var(--text-dim))' }}>
              Current balance: <span style={{ color:user.color||'var(--accent)', fontWeight:600 }}>₹{Number(wallet?.balance||0).toLocaleString('en-IN')}</span>
            </div>

            {error && <Alert type="error">{error}</Alert>}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <Button variant="ghost" onClick={() => { setModal(false); setError('') }}>Cancel</Button>
              <Button type="submit" variant="primary" style={{ background:user.color||'var(--accent)' }} disabled={submitting}>
                {submitting ? 'Processing...' : 'Deduct from Wallet'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
