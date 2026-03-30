// ── Card ──────────────────────────────────────────────────────
export function Card({ children, style={}, className='' }) {
  return (
    <div className={className} style={{ background:'#111118', border:'1px solid #1E1E2A', borderRadius:14, ...style }}>
      {children}
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────
export function StatCard({ label, value, sub, color, icon, onClick }) {
  return (
    <Card style={{ padding:20, cursor:onClick?'pointer':'default' }} onClick={onClick}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <span style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</span>
        <span style={{ fontSize:18, color, opacity:.7 }}>{icon}</span>
      </div>
      <div className="syne" style={{ fontSize:26, fontWeight:800, color, letterSpacing:'-.03em', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#444', marginTop:5 }}>{sub}</div>}
    </Card>
  )
}

// ── WalletCard ────────────────────────────────────────────────
export function WalletCard({ wallet, color='#0A84FF' }) {
  const bal = Number(wallet?.balance||0)
  return (
    <Card style={{ padding:22, background:'#0E0E16', borderColor:'#1E1E2A', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', right:-20, top:-20, width:120, height:120, borderRadius:'50%', background:color, opacity:.06, pointerEvents:'none' }} />
      <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Wallet Balance</div>
      <div className="syne" style={{ fontSize:36, fontWeight:800, color, letterSpacing:'-.04em', marginBottom:4 }}>
        ₹{bal.toLocaleString('en-IN')}
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <span style={{ fontSize:10, background:'#30D15818', color:'#30D158', padding:'2px 8px', borderRadius:10 }}>● Amount Loaded</span>
      </div>
    </Card>
  )
}

// ── Button ────────────────────────────────────────────────────
export function Button({ children, onClick, variant='primary', size='md', disabled=false, style:s={}, type='button' }) {
  const vs = {
    primary: { background:'#0A84FF', color:'#fff', border:'none' },
    success: { background:'#30D15820', color:'#30D158', border:'1px solid #30D15840' },
    danger:  { background:'#FF453A18', color:'#FF453A', border:'1px solid #FF453A33' },
    ghost:   { background:'none',      color:'#666',    border:'1px solid #2A2A35'   },
    warning: { background:'#FFD60A18', color:'#FFD60A', border:'1px solid #FFD60A33' },
    purple:  { background:'#BF5AF218', color:'#BF5AF2', border:'1px solid #BF5AF233' },
  }
  const sz = { sm:{padding:'5px 12px',fontSize:11}, md:{padding:'9px 18px',fontSize:13}, lg:{padding:'12px 26px',fontSize:14} }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      borderRadius:8, cursor:disabled?'not-allowed':'pointer', fontWeight:500,
      transition:'opacity .15s', opacity:disabled?.4:1, display:'inline-flex', alignItems:'center', gap:6,
      ...vs[variant], ...sz[size], ...s,
    }}
      onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.opacity='.75' }}
      onMouseLeave={e=>{ if(!disabled) e.currentTarget.style.opacity='1' }}
    >{children}</button>
  )
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ label, error, style:s={}, wrapStyle={}, ...props }) {
  return (
    <div style={{ marginBottom:16, ...wrapStyle }}>
      {label && <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }}>{label}</label>}
      <input {...props} style={{
        width:'100%', background:'#1A1A22', border:`1px solid ${error?'#FF453A':'#2A2A35'}`,
        borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'10px 12px', outline:'none', ...s,
      }} onFocus={e=>{e.target.style.borderColor=error?'#FF453A':'#3A3A55'}} onBlur={e=>{e.target.style.borderColor=error?'#FF453A':'#2A2A35'}} />
      {error && <div style={{ fontSize:11, color:'#FF453A', marginTop:4 }}>{error}</div>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────
export function Select({ label, error, children, wrapStyle={}, ...props }) {
  return (
    <div style={{ marginBottom:16, ...wrapStyle }}>
      {label && <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }}>{label}</label>}
      <select {...props} style={{
        width:'100%', background:'#1A1A22', border:`1px solid ${error?'#FF453A':'#2A2A35'}`,
        borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'10px 12px', outline:'none', cursor:'pointer',
      }}>{children}</select>
      {error && <div style={{ fontSize:11, color:'#FF453A', marginTop:4 }}>{error}</div>}
    </div>
  )
}

// ── Textarea ──────────────────────────────────────────────────
export function Textarea({ label, error, style:s={}, ...props }) {
  return (
    <div style={{ marginBottom:16 }}>
      {label && <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }}>{label}</label>}
      <textarea {...props} style={{
        width:'100%', background:'#1A1A22', border:`1px solid ${error?'#FF453A':'#2A2A35'}`,
        borderRadius:8, color:'#E2E2E8', fontSize:13, padding:'10px 12px', outline:'none', resize:'vertical', ...s,
      }} />
      {error && <div style={{ fontSize:11, color:'#FF453A', marginTop:4 }}>{error}</div>}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ children, onClose, title, width=520 }) {
  return (
    <div className="fade-in" onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#111118', border:'1px solid #1E1E2A', borderRadius:18, padding:28, width, maxWidth:'96vw', maxHeight:'92vh', overflowY:'auto' }} className="fade-up">
        {title && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div className="syne" style={{ fontSize:17, fontWeight:700, color:'#F0F0F4' }}>{title}</div>
            <button onClick={onClose} style={{ background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:20, lineHeight:1 }}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ── StatusPill ────────────────────────────────────────────────
export function StatusPill({ status }) {
  const M = {
    pending:         { label:'Pending',          c:'#FFD60A', bg:'#FFD60A14' },
    pending_finance: { label:'Awaiting Finance', c:'#FF9F0A', bg:'#FF9F0A14' },
    approved:        { label:'Approved',         c:'#30D158', bg:'#30D15814' },
    rejected:        { label:'Rejected',         c:'#FF453A', bg:'#FF453A14' },
    cancelled:       { label:'Cancelled',        c:'#888',    bg:'#88888814' },
    booked:          { label:'Booked',           c:'#40C8E0', bg:'#40C8E014' },
    draft:           { label:'Draft',            c:'#555',    bg:'#55555514' },
    confirmed:       { label:'Confirmed',        c:'#30D158', bg:'#30D15814' },
    completed:       { label:'Completed',        c:'#BF5AF2', bg:'#BF5AF214' },
  }
  const m = M[status] || { label:status, c:'#888', bg:'#88888814' }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500, background:m.bg, color:m.c }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:m.c }} />{m.label}
    </span>
  )
}

// ── BookingBadge ──────────────────────────────────────────────
export function BookingBadge({ type }) {
  const isSelf = type === 'self'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500,
      background:isSelf?'#0A84FF18':'#BF5AF218', color:isSelf?'#0A84FF':'#BF5AF2' }}>
      {isSelf ? '◈ Self' : '◎ Company'}
    </span>
  )
}

// ── Alert ─────────────────────────────────────────────────────
export function Alert({ type='info', children, style:s={} }) {
  const C = { info:{bg:'#0A84FF14',b:'#0A84FF30',c:'#0A84FF'}, success:{bg:'#30D15814',b:'#30D15830',c:'#30D158'}, error:{bg:'#FF453A14',b:'#FF453A30',c:'#FF453A'}, warning:{bg:'#FFD60A14',b:'#FFD60A30',c:'#FFD60A'} }
  const m = C[type]
  return <div style={{ background:m.bg, border:`1px solid ${m.b}`, borderRadius:8, padding:'10px 14px', fontSize:12, color:m.c, marginBottom:14, ...s }}>{children}</div>
}

// ── ProgressBar ───────────────────────────────────────────────
export function ProgressBar({ pct, color='#0A84FF', height=6 }) {
  return (
    <div style={{ height, borderRadius:height/2, background:'#1E1E2A', overflow:'hidden' }}>
      <div style={{ height:'100%', borderRadius:height/2, width:`${Math.min(Math.max(pct,0),100)}%`, background:color, transition:'width .5s' }} />
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size=28, color='#0A84FF' }) {
  return <div style={{ width:size, height:size, border:`2px solid #1E1E2A`, borderTopColor:color, borderRadius:'50%', animation:'spin .7s linear infinite', flexShrink:0 }} />
}

// ── PageTitle ─────────────────────────────────────────────────
export function PageTitle({ title, sub }) {
  return (
    <div style={{ marginBottom:26 }}>
      <h1 className="syne" style={{ fontSize:26, fontWeight:800, letterSpacing:'-.03em', color:'#F0F0F4' }}>{title}</h1>
      {sub && <p style={{ color:'#555', fontSize:13, marginTop:4 }}>{sub}</p>}
    </div>
  )
}

// ── FileUploadZone ────────────────────────────────────────────
export function FileUploadZone({ onFile, accept='.pdf,image/*', label='Upload Ticket (PDF or Image)' }) {
  const [drag, setDrag] = useState(false)
  const [file, setFile] = useState(null)

  function handleFile(f) { if (!f) return; setFile(f); onFile(f) }

  return (
    <div>
      <div
        onDragOver={e=>{e.preventDefault();setDrag(true)}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}}
        onClick={()=>document.getElementById('__fuz').click()}
        style={{ border:`2px dashed ${drag?'#0A84FF':'#2A2A35'}`, borderRadius:10, padding:'24px 16px', textAlign:'center', cursor:'pointer',
          background:drag?'#0A84FF08':'#1A1A22', transition:'all .2s' }}>
        <div style={{ fontSize:28, marginBottom:8 }}>📎</div>
        <div style={{ fontSize:13, color:file?'#30D158':'#888' }}>{file ? `✓ ${file.name}` : label}</div>
        <div style={{ fontSize:11, color:'#444', marginTop:4 }}>PDF or image, max 10MB</div>
        <input id="__fuz" type="file" accept={accept} style={{ display:'none' }} onChange={e=>handleFile(e.target.files[0])} />
      </div>
    </div>
  )
}

// Need to import useState for FileUploadZone
import { useState } from 'react'
