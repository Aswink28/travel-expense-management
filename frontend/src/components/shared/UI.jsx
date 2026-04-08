import { useState } from 'react'

// ── Card ──────────────────────────────────────────────────────
export function Card({ children, style = {}, className = '', onClick }) {
  return (
    <div className={`card card-hover ${className}`} onClick={onClick} style={style}>
      {children}
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────
export function StatCard({ label, value, sub, color, icon, onClick }) {
  return (
    <Card style={{ padding: 'var(--space-5)', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="stat-card-head">
        <span className="text-xs text-faint uppercase tracking-wide">{label}</span>
        <span className="stat-card-icon" style={{ color, filter: `drop-shadow(0 0 6px ${color}66)` }}>{icon}</span>
      </div>
      <div className="syne stat-card-value" style={{ color, textShadow: `0 0 18px ${color}33` }}>{value}</div>
      {sub && <div className="text-xs text-dim stat-card-sub">{sub}</div>}
    </Card>
  )
}

// ── WalletCard ────────────────────────────────────────────────
export function WalletCard({ wallet, color = 'var(--accent)' }) {
  const bal = Number(wallet?.balance || 0)
  return (
    <Card className="wallet-card card-deep">
      <div className="wallet-card-glow" style={{ background: color }} />
      <div className="text-xs text-faint uppercase tracking-wide">Wallet Balance</div>
      <div className="syne wallet-card-amount" style={{ color, textShadow: `0 0 24px ${color}40` }}>
        ₹{bal.toLocaleString('en-IN')}
      </div>
      <div>
        <span className="pill text-success">Amount Loaded</span>
      </div>
    </Card>
  )
}

// ── Button ────────────────────────────────────────────────────
export function Button({ children, onClick, variant = 'primary', size = 'md', disabled = false, style = {}, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant} btn-${size} ${className}`}
      style={style}
    >
      {children}
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ label, error, className = '', wrapStyle = {}, style = {}, ...props }) {
  return (
    <div className="field" style={wrapStyle}>
      {label && <label className="field-label">{label}</label>}
      <input
        {...props}
        className={`input ${error ? 'input-error' : ''} ${className}`}
        style={style}
      />
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────
export function Select({ label, error, children, wrapStyle = {}, className = '', ...props }) {
  return (
    <div className="field" style={wrapStyle}>
      {label && <label className="field-label">{label}</label>}
      <select {...props} className={`select ${error ? 'select-error' : ''} ${className}`}>
        {children}
      </select>
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}

// ── Textarea ──────────────────────────────────────────────────
export function Textarea({ label, error, className = '', style = {}, ...props }) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      <textarea
        {...props}
        className={`textarea ${error ? 'textarea-error' : ''} ${className}`}
        style={style}
      />
      {error && <div className="error-text">{error}</div>}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ children, onClose, title, width = 520 }) {
  return (
    <div className="modal-backdrop fade-in" onClick={onClose}>
      <div className="modal-content fade-up" onClick={e => e.stopPropagation()} style={{ width }}>
        {title && (
          <div className="modal-header">
            <div className="modal-title">{title}</div>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── StatusPill ────────────────────────────────────────────────
const STATUS_MAP = {
  pending:         { label: 'Pending',          c: '#FFD60A' },
  pending_finance: { label: 'Awaiting Finance', c: '#FF9F0A' },
  approved:        { label: 'Approved',         c: '#30D158' },
  rejected:        { label: 'Rejected',         c: '#FF453A' },
  cancelled:       { label: 'Cancelled',        c: '#888'    },
  booked:          { label: 'Booked',           c: '#40C8E0' },
  draft:           { label: 'Draft',            c: '#666'    },
  confirmed:       { label: 'Confirmed',        c: '#30D158' },
  completed:       { label: 'Completed',        c: '#BF5AF2' },
}

export function StatusPill({ status }) {
  const m = STATUS_MAP[status] || { label: status, c: '#888' }
  return (
    <span className="pill" style={{ background: m.c + '14', borderColor: m.c + '40', color: m.c }}>
      {m.label}
    </span>
  )
}

// ── BookingBadge ──────────────────────────────────────────────
export function BookingBadge({ type }) {
  const isSelf = type === 'self'
  const c = isSelf ? 'var(--accent)' : 'var(--purple)'
  return (
    <span className="pill" style={{
      background: isSelf ? 'rgba(10,132,255,0.10)' : 'rgba(191,90,242,0.10)',
      borderColor: isSelf ? 'rgba(10,132,255,0.35)' : 'rgba(191,90,242,0.35)',
      color: c,
    }}>
      {isSelf ? 'Self' : 'Company'}
    </span>
  )
}

// ── Alert ─────────────────────────────────────────────────────
export function Alert({ type = 'info', children, style = {}, className = '' }) {
  return (
    <div className={`alert alert-${type} ${className}`} style={style}>
      {children}
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────
export function ProgressBar({ pct, color = 'var(--accent)', height = 6 }) {
  return (
    <div className="progress-bar" style={{ height }}>
      <div
        className="progress-bar-fill"
        style={{
          width: `${Math.min(Math.max(pct, 0), 100)}%`,
          background: color,
          color,
        }}
      />
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 28, color = 'var(--accent)' }) {
  return (
    <div
      className="spinner"
      style={{
        width: size,
        height: size,
        borderTopColor: color,
        boxShadow: `0 0 12px ${color === 'var(--accent)' ? 'rgba(10,132,255,0.4)' : color + '66'}`,
      }}
    />
  )
}

// ── PageTitle ─────────────────────────────────────────────────
export function PageTitle({ title, sub }) {
  return (
    <div className="page-title-wrap">
      <h1 className="page-title">{title}</h1>
      {sub && <p className="page-sub">{sub}</p>}
    </div>
  )
}

// ── FileUploadZone ────────────────────────────────────────────
export function FileUploadZone({ onFile, accept = '.pdf,image/*', label = 'Upload Ticket (PDF or Image)' }) {
  const [drag, setDrag] = useState(false)
  const [file, setFile] = useState(null)

  function handleFile(f) { if (!f) return; setFile(f); onFile(f) }

  return (
    <div
      className={`upload-zone ${drag ? 'upload-zone-drag' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
      onClick={() => document.getElementById('__fuz').click()}
    >
      <div className="upload-zone-icon">📎</div>
      <div className={`upload-zone-text ${file ? 'text-success' : 'text-muted'}`}>
        {file ? `✓ ${file.name}` : label}
      </div>
      <div className="upload-zone-hint text-2xs text-dim">PDF or image, max 10MB</div>
      <input id="__fuz" type="file" accept={accept} style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
    </div>
  )
}
