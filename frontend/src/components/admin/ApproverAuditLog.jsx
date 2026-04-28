import { useState, useEffect } from 'react'
import { employeesAPI } from '../../services/api'
import { Card, PageTitle, Alert, Spinner } from '../shared/UI'

export default function ApproverAuditLog() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const res = await employeesAPI.auditLog()
      setRows(res.data || [])
      setError('')
    } catch (e) { setError(e.message) }
    finally   { setLoading(false) }
  }

  if (loading) return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title="Approver Audit Log" sub="Tracks reassignments when approvers are deactivated or chains are edited" />
      {error && <Alert type="error" style={{ marginBottom: 12 }}>{error}</Alert>}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg-card-deep)' }}>
                {['When','Action','Affected employee','Step','Old approver','New approver','Reason','By'].map((h, i) => (
                  <th key={i} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding:'28px 16px', textAlign:'center', fontSize: 12, color:'var(--text-muted)' }}>
                    No reassignments recorded yet.
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={td}>{new Date(r.acted_at).toLocaleString('en-IN')}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding:'3px 8px', borderRadius: 999,
                      background: actionStyle(r.action_type).bg,
                      color:      actionStyle(r.action_type).fg,
                      letterSpacing:'0.05em', textTransform:'uppercase',
                    }}>{r.action_type.replace(/_/g, ' ')}</span>
                  </td>
                  <td style={td}>{r.affected_name || '—'}</td>
                  <td style={td}>{r.step_designation || '—'}</td>
                  <td style={td}>{r.old_name || '—'}</td>
                  <td style={td}>{r.new_name || '—'}</td>
                  <td style={{ ...td, color:'var(--text-muted)' }}>{r.reason || '—'}</td>
                  <td style={{ ...td, color:'var(--text-muted)' }}>{r.acted_by_name || 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

const th = { textAlign:'left', padding:'12px 16px', fontSize: 10, fontWeight: 700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-muted)' }
const td = { padding:'10px 16px', fontSize: 12, color:'var(--text-primary)' }

function actionStyle(type) {
  if (type === 'reassign_pending') return { bg:'color-mix(in srgb, var(--warning) 9%, transparent)', fg:'var(--warning)' }
  if (type === 'manual_edit')      return { bg:'color-mix(in srgb, var(--accent) 9%, transparent)', fg:'var(--accent)' }
  return { bg:'var(--bg-input)', fg:'var(--text-muted)' }
}
