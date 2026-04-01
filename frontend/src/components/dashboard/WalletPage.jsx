import { useState, useEffect, useCallback } from 'react'
import { walletAPI, requestsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, PageTitle, WalletCard, Button, Modal, Alert, Spinner, Select, Input } from '../shared/UI'

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

  const ppiWallet = user.ppiWallet

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [w, t, r] = await Promise.all([walletAPI.balance(), walletAPI.transactions(), requestsAPI.list('approved')])
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

      {/* PPI Wallet Balance */}
      {ppiWallet && (
        <Card style={{ padding:20, marginBottom:16, background:'#0E0E16', borderColor:'#1E1E2A', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', right:-20, top:-20, width:120, height:120, borderRadius:'50%', background:user.color||'#0A84FF', opacity:.06, pointerEvents:'none' }} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>PPI Wallet Balance</div>
              <div className="syne" style={{ fontSize:36, fontWeight:800, color:user.color||'#0A84FF', letterSpacing:'-.04em' }}>
                ₹{Number(ppiWallet.balance||0).toLocaleString('en-IN')}
              </div>
              <div style={{ display:'flex', gap:6, marginTop:8 }}>
                <span style={{ fontSize:10, background:'#30D15818', color:'#30D158', padding:'2px 8px', borderRadius:10 }}>● {ppiWallet.walletStatus}</span>
                <span style={{ fontSize:10, background:'#0A84FF18', color:'#0A84FF', padding:'2px 8px', borderRadius:10 }}>KYC: {ppiWallet.kycStatus}</span>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'#444', marginBottom:4 }}>{ppiWallet.walletNumber}</div>
              <div style={{ fontSize:10, color:'#444' }}>Expires: {ppiWallet.expiryDate}</div>
              <div style={{ fontSize:10, color:'#444', marginTop:4 }}>Daily limit: ₹{Number(ppiWallet.dailyTxnLimit||0).toLocaleString('en-IN')}</div>
              <div style={{ fontSize:10, color:'#444' }}>Max balance: ₹{Number(ppiWallet.maxBalanceLimit||0).toLocaleString('en-IN')}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Wallet summary */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr', gap:14, marginBottom:22 }}>
        <WalletCard wallet={wallet} color={user.color||'#0A84FF'} />
        <Card style={{ padding:20 }}>
          <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Total Credited</div>
          <div className="syne" style={{ fontSize:28, fontWeight:800, color:'#30D158' }}>₹{Number(wallet?.total_credited||0).toLocaleString('en-IN')}</div>
          <div style={{ fontSize:11, color:'#444', marginTop:6 }}>from approved requests</div>
        </Card>
        <Card style={{ padding:20 }}>
          <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Total Spent</div>
          <div className="syne" style={{ fontSize:28, fontWeight:800, color:'#BF5AF2' }}>₹{Number(wallet?.total_debited||0).toLocaleString('en-IN')}</div>
          <div style={{ fontSize:11, color:'#444', marginTop:6 }}>all categories</div>
        </Card>
      </div>

      {/* Log expense */}
      {requests.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <Button variant="primary" style={{ background:user.color||'#0A84FF' }} onClick={() => { setModal(true); setError('') }}>
            + Log Expense (Self Booking)
          </Button>
          <span style={{ fontSize:11, color:'#555', marginLeft:10 }}>For self-booking requests only</span>
        </div>
      )}

      {/* Flow info */}
      <Card style={{ padding:18, marginBottom:20 }}>
        <div style={{ fontSize:11, color:'#3A3A4A', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>How Your Wallet Works</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {['Request approved →','Travel + Hotel + Allowance credited separately','Self booking: log expenses yourself','Company booking: Admin deducts via booking panel','All transactions permanently logged'].map((s,i) => (
            <span key={i} style={{ fontSize:11, background:'#1A1A22', color:'#666', padding:'5px 10px', borderRadius:6 }}>{s}</span>
          ))}
        </div>
      </Card>

      {/* Transaction history */}
      <Card style={{ padding:22 }}>
        <div style={{ fontSize:13, color:'#888', fontWeight:500, marginBottom:16 }}>Transaction History</div>
        {txns.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#333', fontSize:13 }}>No transactions yet</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ borderBottom:'1px solid #1E1E2A' }}>
              {['Date','Description','Category','Type','Amount','Balance After'].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, color:'#3A3A4A', fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {txns.map((t,i) => (
                <tr key={t.id} style={{ borderBottom: i<txns.length-1?'1px solid #14141E':'none' }}>
                  <td style={{ padding:'10px 12px', fontSize:10, color:'#555' }}>{new Date(t.created_at).toLocaleDateString('en-IN')}</td>
                  <td style={{ padding:'10px 12px', fontSize:12, color:'#ccc', maxWidth:220 }}>
                    <div>{t.description}</div>
                    {t.reference && <div style={{ fontSize:10, color:'#444', marginTop:2 }}>Ref: {t.reference}</div>}
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:12 }}>{CAT_ICONS[t.category]||'📋'}</span>
                    <span style={{ fontSize:11, color:'#777', marginLeft:5, textTransform:'capitalize' }}>{t.category}</span>
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:t.txn_type==='credit'?'#30D15818':'#FF453A18', color:t.txn_type==='credit'?'#30D158':'#FF453A' }}>
                      {t.txn_type}
                    </span>
                  </td>
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:13, fontWeight:500, color:t.txn_type==='credit'?'#30D158':'#FF453A' }}>
                      {t.txn_type==='credit'?'+':'−'}₹{Number(t.amount).toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td style={{ padding:'10px 12px', fontSize:12, color:'#888' }}>₹{Number(t.balance_after).toLocaleString('en-IN')}</td>
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
              <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:10 }}>Category</label>
              <div style={{ display:'flex', gap:8 }}>
                {['travel','hotel','allowance','other'].map(cat => (
                  <button type="button" key={cat} onClick={() => setForm(p=>({...p,category:cat}))} style={{
                    flex:1, padding:'12px 8px', borderRadius:9, textAlign:'center', cursor:'pointer',
                    background:form.category===cat?(user.color||'#0A84FF')+'22':'#1A1A22',
                    border:`1px solid ${form.category===cat?(user.color||'#0A84FF')+'55':'#2A2A35'}`,
                  }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>{CAT_ICONS[cat]}</div>
                    <div style={{ fontSize:10, color:form.category===cat?(user.color||'#0A84FF'):'#777', textTransform:'capitalize' }}>{cat}</div>
                  </button>
                ))}
              </div>
            </div>

            <Input label="Amount (₹)" type="number" min="1" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} placeholder="Enter amount" />
            <Input label="Description" value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="e.g. Rapido to station, lunch" />
            <Input label="Reference / Receipt No. (optional)" value={form.reference} onChange={e=>setForm(p=>({...p,reference:e.target.value}))} placeholder="e.g. UPI ref, receipt number" />

            <div style={{ background:'#1A1A22', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#555' }}>
              Current balance: <span style={{ color:user.color||'#0A84FF', fontWeight:600 }}>₹{Number(wallet?.balance||0).toLocaleString('en-IN')}</span>
            </div>

            {error && <Alert type="error">{error}</Alert>}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <Button variant="ghost" onClick={() => { setModal(false); setError('') }}>Cancel</Button>
              <Button type="submit" variant="primary" style={{ background:user.color||'#0A84FF' }} disabled={submitting}>
                {submitting ? 'Processing...' : 'Deduct from Wallet'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
