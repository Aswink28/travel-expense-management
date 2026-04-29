import { useState, useEffect, useRef } from 'react'
import { bulkEmployeesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { Card, Button, Spinner, Modal, PageTitle, ProgressBar } from '../shared/UI'
import { Upload, Download, RefreshCw, XCircle, FileSpreadsheet } from 'lucide-react'

const STATUS_COLORS = {
  pending: 'var(--warning)', processing: 'var(--accent)', completed: 'var(--success)',
  completed_with_errors: 'var(--warning)', cancelled: 'var(--text-faint)',
}

// ── Parse a row error_message into structured { field, message } parts. ──
// Backend stores errors as `[field] message; [field2] message2`. Anything
// without the [field] tag is rendered as a generic message.
function parseRowErrors(msg) {
  if (!msg) return []
  return msg.split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const m = s.match(/^\[([^\]]+)\]\s*(.+)$/)
      return m ? { field: m[1], message: m[2] } : { field: null, message: s }
    })
}

// ── Friendly error messages for top-level upload errors ──────
function friendlyError(msg) {
  if (!msg) return 'Something went wrong. Please try again.'
  const m = msg.toLowerCase()
  if (m.includes('duplicate') && m.includes('email'))   return 'This email address is already registered. Please use a different email.'
  if (m.includes('duplicate') && m.includes('mobile'))  return 'This mobile number is already in use. Please check and use a unique number.'
  if (m.includes('duplicate'))                           return 'A duplicate entry was found. Please check your data for repeated values.'
  if (m.includes('email already exists'))                return 'This email is already taken by another employee.'
  if (m.includes('mobile number already'))               return 'This mobile number belongs to an existing employee.'
  if (m.includes('missing required columns'))            return 'Your file is missing some required columns. Please download the template and match the column names exactly.'
  if (m.includes('no data rows'))                        return 'The uploaded file is empty. Please add employee data and try again.'
  if (m.includes('maximum allowed'))                     return 'Too many rows in the file. Please split into smaller files (max 25,000 rows each).'
  if (m.includes('only .xlsx'))                          return 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.'
  if (m.includes('no file'))                             return 'No file was selected. Please choose a file to upload.'
  if (m.includes('connect') && m.includes('refused'))    return 'Unable to reach the wallet service. The server may be down — please try again later.'
  if (m.includes('ppi') || m.includes('wallet service')) return 'Wallet creation failed for this employee. The wallet service returned an error — please retry later.'
  if (m.includes('network') || m.includes('fetch'))      return 'Network error. Please check your connection and try again.'
  return msg
}

export default function BulkEmployeeUpload() {
  const { user } = useAuth()
  const accent = user.color || 'var(--success)'
  const fileRef = useRef(null)

  const [jobs, setJobs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [uploading, setUploading]   = useState(false)
  const [popup, setPopup]           = useState(null)
  const [detailJob, setDetailJob]   = useState(null)
  const [detailRows, setDetailRows] = useState([])
  const [detailTotal, setDetailTotal] = useState(0)
  const [detailPage, setDetailPage] = useState(1)
  const [detailFilter, setDetailFilter] = useState('')
  const [polling, setPolling]       = useState(null)

  useEffect(() => { loadJobs() }, [])

  // Poll active jobs
  useEffect(() => {
    const activeJob = jobs.find(j => ['pending', 'processing'].includes(j.status))
    if (activeJob && !polling) {
      const id = setInterval(() => {
        loadJobs()
        if (detailJob?.id === activeJob.id) loadJobDetail(activeJob.id, detailFilter, detailPage)
      }, 3000)
      setPolling(id)
    }
    if (!activeJob && polling) {
      clearInterval(polling)
      setPolling(null)
    }
    return () => { if (polling) clearInterval(polling) }
  }, [jobs.map(j => j.status).join(',')])

  async function loadJobs() {
    try {
      const res = await bulkEmployeesAPI.listJobs()
      setJobs(res.data)
    } catch (e) {
      setPopup({ type: 'error', title: 'Failed to Load Jobs', message: friendlyError(e.message) })
    }
    finally { setLoading(false) }
  }

  async function loadJobDetail(jobId, status, page) {
    try {
      const params = { page, limit: 50 }
      if (status) params.status = status
      const res = await bulkEmployeesAPI.jobDetail(jobId, params)
      setDetailJob(res.data.job)
      setDetailRows(res.data.rows)
      setDetailTotal(res.data.total)
    } catch (e) {
      setPopup({ type: 'error', title: 'Failed to Load Details', message: friendlyError(e.message) })
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    fileRef.current.value = ''

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await bulkEmployeesAPI.upload(fd)
      const d = res.data
      setPopup({
        type: 'success',
        title: 'File Uploaded Successfully',
        message: `Your file has been uploaded and processing has started.`,
        details: {
          'File Name': file.name,
          'Total Rows': d.totalRows,
          'Valid Rows': d.validRows,
          'Validation Errors': d.invalidRows,
        },
      })
      loadJobs()
    } catch (err) {
      setPopup({ type: 'error', title: 'Upload Failed', message: friendlyError(err.message) })
    } finally { setUploading(false) }
  }

  async function retryFailed(jobId) {
    try {
      const res = await bulkEmployeesAPI.retryFailed(jobId)
      setPopup({ type: 'success', title: 'Retry Started', message: res.message || 'Failed rows have been re-queued for processing.' })
      loadJobs()
      if (detailJob?.id === jobId) loadJobDetail(jobId, detailFilter, detailPage)
    } catch (e) {
      setPopup({ type: 'error', title: 'Retry Failed', message: friendlyError(e.message) })
    }
  }

  async function deleteJob(jobId) {
    try {
      await bulkEmployeesAPI.deleteJob(jobId)
      setPopup({ type: 'success', title: 'Job Deleted', message: 'The bulk upload job and all its records have been removed.' })
      loadJobs()
    } catch (e) {
      setPopup({ type: 'error', title: 'Delete Failed', message: friendlyError(e.message) })
    }
  }

  function openDetail(job) {
    setDetailJob(job); setDetailFilter(''); setDetailPage(1)
    loadJobDetail(job.id, '', 1)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={36} /></div>

  return (
    <div className="fade-up">
      <PageTitle title="Bulk Employee Onboarding" sub="Upload Excel/CSV to create multiple employees with PPI wallets" />

      {/* Upload panel */}
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-body)', fontWeight: 500, marginBottom: 4 }}>Upload Employee File</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Accepted: .xlsx, .xls, .csv — Max 25,000 rows per file</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <a href={bulkEmployeesAPI.template()} download style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm"><Download size={14} /> Download Template</Button>
            </a>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} style={{ display: 'none' }} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <><Spinner size={14} /> Uploading...</> : <><Upload size={14} /> Upload File</>}
            </Button>
          </div>
        </div>
      </Card>

      {/* Required columns */}
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Required Columns</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {['name', 'email', 'password', 'mobile_number', 'date_of_birth', 'gender', 'pan_number', 'aadhaar_number', 'designation'].map(c => (
            <span key={c} style={{ fontSize: 11, background: 'color-mix(in srgb, var(--danger) 7%, transparent)', color: 'var(--text-danger)', padding: '3px 10px', borderRadius: 6, fontFamily: 'monospace' }}>{c} *</span>
          ))}
          {['role', 'department', 'tier_id'].map(c => (
            <span key={c} style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-faint)', padding: '3px 10px', borderRadius: 6, fontFamily: 'monospace' }}>{c}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--text-faint)' }}>Note:</span>{' '}
          <code style={{ color: 'var(--text-warning)' }}>designation</code> must be mapped to a tier in Tier Config (it drives the approval flow).{' '}
          <code style={{ color: 'var(--text-warning)' }}>role</code> defaults to <code>Employee</code> and must exist in master data.
        </div>
      </Card>

      {/* Jobs list */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontWeight: 500 }}>Bulk Upload Jobs</div>
          <Button size="sm" variant="ghost" onClick={loadJobs}><RefreshCw size={12} /> Refresh</Button>
        </div>

        {!jobs.length ? (
          <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)', fontSize: 13 }}>
            <FileSpreadsheet size={32} style={{ opacity: .3, marginBottom: 10 }} /><br />
            No bulk jobs yet. Upload an Excel file to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['File', 'Progress', 'Success', 'Failed', 'Skipped', 'Status', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const pct = job.total_rows > 0 ? (job.processed / job.total_rows) * 100 : 0
                const isActive = ['pending', 'processing'].includes(job.status)
                return (
                  <tr key={job.id} style={{ borderBottom: '1px solid var(--bg-card-deep)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ color: 'var(--text-body)', fontWeight: 500 }}>{job.file_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{job.total_rows} rows</div>
                    </td>
                    <td style={{ padding: '10px 16px', minWidth: 120 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>{job.processed}/{job.total_rows}</div>
                      <ProgressBar pct={pct} color={STATUS_COLORS[job.status] || 'var(--text-faint)'} height={4} />
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-success)', fontWeight: 600 }}>{job.succeeded}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-danger)', fontWeight: 600 }}>{job.failed}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-faint)' }}>{job.skipped}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontSize: 10, padding: '3px 10px', borderRadius: 20, fontWeight: 500,
                        background: (STATUS_COLORS[job.status] || 'var(--text-faint)') + '18',
                        color: STATUS_COLORS[job.status] || 'var(--text-faint)',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        {isActive && <Spinner size={10} color={STATUS_COLORS[job.status]} />}
                        {job.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-dim)' }}>
                      {new Date(job.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="ghost" onClick={() => openDetail(job)}>Details</Button>
                        <Button size="sm" variant="danger" onClick={() => deleteJob(job.id)}><XCircle size={12} /></Button>
                        {job.status === 'completed_with_errors' && (
                          <Button size="sm" variant="warning" onClick={() => retryFailed(job.id)}><RefreshCw size={12} /> Retry</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── Job Detail Modal ───────────────────────────────── */}
      {detailJob && (
        <Modal title={`Job: ${detailJob.file_name}`} onClose={() => setDetailJob(null)} width={800}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              ['Total', detailJob.total_rows, accent],
              ['Processed', detailJob.processed, 'var(--accent)'],
              ['Success', detailJob.succeeded, 'var(--success)'],
              ['Failed', detailJob.failed, 'var(--danger)'],
              ['Skipped', detailJob.skipped, 'var(--text-faint)'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
                <div className="syne" style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <ProgressBar pct={detailJob.total_rows > 0 ? (detailJob.processed / detailJob.total_rows) * 100 : 0} color={STATUS_COLORS[detailJob.status]} height={6} />
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, textAlign: 'right' }}>
              {Math.round((detailJob.processed / Math.max(detailJob.total_rows, 1)) * 100)}% complete
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
            {['', 'success', 'failed', 'skipped', 'pending'].map(s => (
              <button key={s} onClick={() => { setDetailFilter(s); setDetailPage(1); loadJobDetail(detailJob.id, s, 1) }}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none',
                  background: detailFilter === s ? `color-mix(in srgb, ${accent} 13%, transparent)` : 'var(--bg-input)', color: detailFilter === s ? accent : 'var(--text-faint)',
                }}>
                {s || 'All'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {detailJob.failed > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await bulkEmployeesAPI.exportErrors(detailJob.id, `bulk_errors_${detailJob.file_name.replace(/\.[^.]+$/, '')}.xlsx`)
                  } catch (e) {
                    setPopup({ type: 'error', title: 'Export Failed', message: friendlyError(e.message) })
                  }
                }}
              >
                <Download size={12} /> Export Errors
              </Button>
            )}
          </div>

          <div style={{ maxHeight: 350, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                  {['Row', 'Name', 'Email', 'Mobile', 'Status', 'Error / Wallet ID'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text-dim)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!detailRows.length ? (
                  <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>No rows</td></tr>
                ) : detailRows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--bg-card-deep)' }}>
                    <td style={{ padding: '6px 10px', color: 'var(--text-faint)' }}>#{r.row_number}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-body)' }}>{r.raw_data?.name || '—'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-faint)' }}>{r.raw_data?.email || '—'}</td>
                    <td style={{ padding: '6px 10px', color: 'var(--text-faint)' }}>{r.raw_data?.mobile_number || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10,
                        background: r.status === 'success' ? 'color-mix(in srgb, var(--success) 8%, transparent)' : r.status === 'failed' ? 'color-mix(in srgb, var(--danger) 8%, transparent)' : r.status === 'skipped' ? '#88888814' : 'color-mix(in srgb, var(--warning) 8%, transparent)',
                        color: r.status === 'success' ? 'var(--success)' : r.status === 'failed' ? 'var(--danger)' : r.status === 'skipped' ? 'var(--text-faint)' : 'var(--warning)',
                      }}>{r.status}</span>
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 11 }}>
                      {(r.status === 'failed' || r.status === 'skipped') ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {parseRowErrors(r.error_message).map((err, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              {err.field && (
                                <span style={{
                                  fontSize: 10, padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace',
                                  background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--text-danger)', flexShrink: 0,
                                }}>{err.field}</span>
                              )}
                              <span style={{ color: 'var(--text-warning)' }}>{err.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : r.ppi_wallet_id ? (
                        <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: 10 }}>{r.ppi_wallet_id.slice(0, 12)}...</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detailTotal > 50 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{detailTotal} total rows</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <Button size="sm" variant="ghost" disabled={detailPage <= 1}
                  onClick={() => { setDetailPage(p => p - 1); loadJobDetail(detailJob.id, detailFilter, detailPage - 1) }}>Prev</Button>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', padding: '5px 10px' }}>Page {detailPage}</span>
                <Button size="sm" variant="ghost" disabled={detailPage * 50 >= detailTotal}
                  onClick={() => { setDetailPage(p => p + 1); loadJobDetail(detailJob.id, detailFilter, detailPage + 1) }}>Next</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Result Popup (Success / Error) ──────────────────── */}
      {popup && (
        <Modal title="" onClose={() => setPopup(null)} width={440}>
          <div style={{ textAlign: 'center', padding: '10px 0 6px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
              background: popup.type === 'success' ? 'color-mix(in srgb, var(--success) 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)',
              border: `2px solid ${popup.type === 'success' ? 'color-mix(in srgb, var(--success) 19%, transparent)' : 'color-mix(in srgb, var(--danger) 19%, transparent)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
            }}>
              {popup.type === 'success' ? '✓' : '✕'}
            </div>
            <div className="syne" style={{
              fontSize: 18, fontWeight: 700, marginBottom: 8,
              color: popup.type === 'success' ? 'var(--success)' : 'var(--danger)',
            }}>
              {popup.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              {popup.message}
            </div>
            {popup.type === 'success' && popup.details && (
              <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '14px 18px', textAlign: 'left', marginBottom: 16 }}>
                {Object.entries(popup.details).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{k}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-body)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant={popup.type === 'success' ? 'success' : 'danger'}
              onClick={() => setPopup(null)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {popup.type === 'success' ? 'Done' : 'Close'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
