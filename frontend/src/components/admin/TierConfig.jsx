import { useState, useEffect } from 'react'
import { dashboardAPI } from '../../services/api'
import { Card, PageTitle, Alert, Spinner } from '../shared/UI'

export default function TierConfig() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    dashboardAPI.allTiers().then(d => setData(d.data)).catch(e => setError(e.message)).finally(()=>setLoading(false))
  }, [])

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36} /></div>

  const groupedLimits = {}
  ;(data?.limits||[]).forEach(l => {
    if (!groupedLimits[l.role]) groupedLimits[l.role] = []
    groupedLimits[l.role].push(l)
  })

  return (
    <div className="fade-up">
      <PageTitle title="Tier Configuration" sub="Travel entitlements and expense limits per role" />
      {error && <Alert type="error">{error}</Alert>}

      {/* Tier cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
        {(data?.tiers||[]).map(t => (
          <Card key={t.role} style={{ padding:22, borderLeft:`3px solid ${t.color}` }}>
            <div className="syne" style={{ fontSize:15, fontWeight:700, color:t.color, marginBottom:14 }}>{t.role}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
              {[
                ['Allowed Modes',  (t.allowed_modes||[]).join(', ') || 'None'],
                ['Max Budget',     `₹${Number(t.max_trip_budget||0).toLocaleString('en-IN')}`],
                ['Daily Allow.',   `₹${t.daily_allowance||0}/day`],
                ['Hotel/Night',    `₹${t.max_hotel_per_night||0}`],
                ['Approvals',      t.requires_manager && t.requires_finance ? 'TL/Mgr + Finance' : t.requires_finance ? 'Finance only' : 'Auto'],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'#1A1A22', borderRadius:9, padding:12 }}>
                  <div style={{ fontSize:10, color:'#3A3A4A', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>{k}</div>
                  <div style={{ fontSize:12, color:'#ccc', lineHeight:1.5 }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Expense limits table */}
      <Card style={{ padding:22 }}>
        <div style={{ fontSize:13, color:'#888', fontWeight:500, marginBottom:16 }}>Expense Limits by Category</div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ borderBottom:'1px solid #1E1E2A' }}>
            {['Role','Category','Daily Limit','Trip Limit'].map(h=>(
              <th key={h} style={{ padding:'10px 13px', textAlign:'left', fontSize:10, color:'#3A3A4A', fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(data?.limits||[]).map((l,i) => (
              <tr key={i} style={{ borderBottom:'1px solid #14141E' }}>
                <td style={{ padding:'9px 13px', fontSize:12, color:'#ccc' }}>{l.role}</td>
                <td style={{ padding:'9px 13px', fontSize:12, color:'#888', textTransform:'capitalize' }}>{l.category}</td>
                <td style={{ padding:'9px 13px', fontSize:12, color:'#E2E2E8' }}>₹{Number(l.daily_limit).toLocaleString('en-IN')}</td>
                <td style={{ padding:'9px 13px', fontSize:12, color:'#E2E2E8' }}>₹{Number(l.trip_limit).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Distance rules */}
      <Card style={{ padding:22, marginTop:16 }}>
        <div style={{ fontSize:13, color:'#888', fontWeight:500, marginBottom:14 }}>Route Distance Rules</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            ['Short Distance', 'Train / Bus / other tier-allowed modes', '#0A84FF', ['Chennai–Bangalore','Chennai–Hyderabad','Chennai–Coimbatore']],
            ['Long Distance',  'Flight mandatory', '#FF9F0A', ['Chennai–Mumbai','Chennai–Delhi','Chennai–Kolkata','Mumbai–Delhi']],
            ['International',  'Flight mandatory', '#FF453A', ['Chennai–Singapore','Chennai–Dubai','Chennai–London']],
          ].map(([label, rule, color, examples]) => (
            <div key={label} style={{ background:'#1A1A22', borderRadius:10, padding:14 }}>
              <div style={{ fontSize:11, color, fontWeight:600, marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:11, color:'#555', marginBottom:10 }}>{rule}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {examples.map(e => (
                  <div key={e} style={{ fontSize:10, color:'#444', background:'#16161E', padding:'3px 8px', borderRadius:4 }}>{e}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, fontSize:11, color:'#444' }}>
          ◈ Routes not in the list default to <strong style={{ color:'#888' }}>short distance</strong> rules. You can extend the distance rules in the backend <code style={{ color:'#0A84FF', background:'#0A84FF14', padding:'1px 6px', borderRadius:3 }}>v_distance_rules</code> view.
        </div>
      </Card>
    </div>
  )
}
