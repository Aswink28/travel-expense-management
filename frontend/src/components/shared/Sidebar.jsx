import { useAuth } from '../../context/AuthContext'
import moiterLogo from '../../assets/moiter_workz-logo.png'

const FALLBACK_NAV = [{ id:'dashboard', label:'Dashboard', icon:'▦' }]

export default function Sidebar({ active, setActive, pendingCount }) {
  const { user, logout } = useAuth()
  if (!user) return null
  const items  = user.pages?.length ? user.pages : FALLBACK_NAV
  const accent = user.color || '#0A84FF'
  const ppiBal = user.ppiWallet

  return (
    <aside style={{ width:220, background:'#080810', borderRight:'1px solid #14141E', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, height:'100vh', zIndex:100 }}>
      {/* Logo */}
      <div style={{ padding:'26px 22px 20px' }}>
        <img src={moiterLogo} alt="Moiter Workz" style={{ height:32, objectFit:'contain', display:'block' }} />
        <div style={{ fontSize:10, color:'#2E2E3A', marginTop:2 }}>{user.role}</div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'0 10px', display:'flex', flexDirection:'column', gap:2 }}>
        {items.map(item => {
          const isActive = active === item.id
          const hasBadge = item.id === 'approvals' && pendingCount > 0
          return (
            <button key={item.id} onClick={() => setActive(item.id)} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
              background:isActive ? accent+'16':'none', border:'none',
              borderRadius:9, borderLeft:`2px solid ${isActive?accent:'transparent'}`,
              color:isActive?'#E2E2E8':'#3E3E4E', fontSize:13, cursor:'pointer',
              textAlign:'left', width:'100%', transition:'all .12s', position:'relative',
            }}
              onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.color='#777' }}
              onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.color='#3E3E4E' }}
            >
              <span style={{ fontSize:13, opacity:isActive?1:.6 }}>{item.icon}</span>
              {item.label}
              {hasBadge && (
                <span style={{ marginLeft:'auto', background:'#FF453A', color:'#fff', fontSize:9, fontWeight:700, borderRadius:'50%', width:17, height:17, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Wallet quick */}
      {items.some(i => i.id === 'my-wallet') && (
        <div onClick={() => setActive('my-wallet')} style={{ margin:'0 12px 10px', background:'#111118', border:'1px solid #1E1E2A', borderRadius:10, padding:'12px 14px', cursor:'pointer' }}>
          <div style={{ fontSize:10, color:'#444', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>
            {ppiBal !== null ? 'PPI Wallet' : 'Wallet'}
          </div>
          <div className="syne" style={{ fontSize:17, fontWeight:700, color:accent }}>
            ₹{Number(ppiBal?.balance ?? user.wallet?.balance ?? 0).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize:10, color:'#30D158', marginTop:2 }}>● {ppiBal ? 'Live' : 'Loaded'}</div>
        </div>
      )}

      {/* User footer */}
      <div style={{ padding:'10px 12px 16px', borderTop:'1px solid #14141E' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 11px', background:'#111118', borderRadius:9, marginBottom:8 }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:accent+'22', border:`1.5px solid ${accent}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:accent, flexShrink:0 }}>
            {user.avatar}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12, color:'#ccc', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.name}</div>
            <div style={{ fontSize:10, color:accent }}>{user.empId}</div>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', padding:'0 4px' }}>
          <span style={{ fontSize:11, color:'#30D158' }}>● Online</span>
          <button onClick={logout} style={{ background:'none', border:'none', fontSize:11, color:'#3E3E4E', cursor:'pointer' }}
            onMouseEnter={e=>e.currentTarget.style.color='#FF453A'} onMouseLeave={e=>e.currentTarget.style.color='#3E3E4E'}>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
