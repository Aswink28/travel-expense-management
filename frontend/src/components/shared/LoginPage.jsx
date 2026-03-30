import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

const DEMO = [
  { name:'Arjun Sharma',   email:'arjun@company.in',  role:'Employee',      color:'#0A84FF', avatar:'AS', password:'pass123' },
  { name:'Deepa Krishnan', email:'deepa@company.in',  role:'Tech Lead',     color:'#BF5AF2', avatar:'DK', password:'pass123' },
  { name:'Ravi Kumar',     email:'ravi@company.in',   role:'Manager',       color:'#FF9F0A', avatar:'RK', password:'pass123' },
  { name:'Anil Menon',     email:'anil@company.in',   role:'Finance',       color:'#40C8E0', avatar:'AM', password:'pass123' },
  { name:'Meena Iyer',     email:'meena@company.in',  role:'Booking Admin', color:'#FF6B6B', avatar:'MI', password:'pass123' },
  { name:'Super Admin',    email:'admin@company.in',  role:'Super Admin',   color:'#30D158', avatar:'SA', password:'admin123' },
]

export default function LoginPage() {
  const { login, error, setError } = useAuth()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [showPwd,  setShowPwd]  = useState(false)

  function pick(u) { setSelected(u); setEmail(u.email); setPassword(u.password); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    await login(email, password)
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#07070D', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      {/* Background glow */}
      <div style={{ position:'fixed', width:600, height:600, borderRadius:'50%', background:'#0A84FF', filter:'blur(140px)', opacity:.05, top:'-200px', left:'-100px', pointerEvents:'none' }} />
      <div style={{ position:'fixed', width:500, height:500, borderRadius:'50%', background:'#BF5AF2', filter:'blur(120px)', opacity:.04, bottom:'-150px', right:'-100px', pointerEvents:'none' }} />

      <div style={{ display:'flex', width:'100%', maxWidth:980, minHeight:600, borderRadius:20, overflow:'hidden', border:'1px solid #1A1A24', boxShadow:'0 40px 80px rgba(0,0,0,.6)', position:'relative', zIndex:1 }}>

        {/* Left — role cards */}
        <div style={{ width:340, background:'#0C0C15', borderRight:'1px solid #171720', padding:'30px 22px', display:'flex', flexDirection:'column' }}>
          <div style={{ marginBottom:24 }}>
            <div className="syne" style={{ fontSize:22, fontWeight:800, color:'#F0F0F4' }}>Travel<span style={{ color:'#0A84FF' }}>Desk</span></div>
            <div style={{ fontSize:12, color:'#3A3A4A', marginTop:2 }}>Travel & Expense Management v3</div>
          </div>
          <div style={{ fontSize:10, color:'#333', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10 }}>Select role to login</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
            {DEMO.map(u => (
              <button key={u.email} onClick={() => pick(u)} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 13px',
                background:selected?.email===u.email ? u.color+'18':'#111118',
                border:`1px solid ${selected?.email===u.email ? u.color+'45':'#1C1C26'}`,
                borderRadius:10, cursor:'pointer', textAlign:'left', transition:'all .15s', width:'100%',
              }}
                onMouseEnter={e=>{ if(selected?.email!==u.email){e.currentTarget.style.background='#18181F';e.currentTarget.style.borderColor=u.color+'25'} }}
                onMouseLeave={e=>{ if(selected?.email!==u.email){e.currentTarget.style.background='#111118';e.currentTarget.style.borderColor='#1C1C26'} }}
              >
                <div style={{ width:32, height:32, borderRadius:'50%', background:u.color+'22', border:`1.5px solid ${u.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:u.color, flexShrink:0 }}>
                  {u.avatar}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:'#DDD', fontWeight:500 }}>{u.name}</div>
                  <div style={{ fontSize:10, color:u.color, marginTop:1 }}>{u.role}</div>
                </div>
                {selected?.email===u.email && <div style={{ width:16, height:16, borderRadius:'50%', background:u.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#000' }}>✓</div>}
              </button>
            ))}
          </div>
          <div style={{ marginTop:14, padding:'9px 12px', background:'#111118', borderRadius:8, border:'1px solid #1A1A24', fontSize:11, color:'#2E2E3A' }}>
            Click a role above to auto-fill
          </div>
        </div>

        {/* Right — form */}
        <div style={{ flex:1, background:'#0E0E18', padding:'50px 44px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
          {selected && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:6, background:selected.color+'14', border:`1px solid ${selected.color}30`, borderRadius:20, padding:'4px 14px', fontSize:11, color:selected.color, fontWeight:500, marginBottom:20, width:'fit-content' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:selected.color }} />{selected.role} Portal
            </span>
          )}

          <h1 className="syne" style={{ fontSize:28, fontWeight:800, letterSpacing:'-.04em', color:'#F0F0F4', marginBottom:4 }}>
            {selected ? `Hi, ${selected.name.split(' ')[0]}!` : 'Sign in'}
          </h1>
          <p style={{ fontSize:13, color:'#444', marginBottom:32 }}>
            {selected ? 'Credentials auto-filled. Click Sign in to continue.' : 'Enter your credentials to continue.'}
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }}>Email</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError('')}} placeholder="you@company.in" required
                style={{ width:'100%', background:'#0B0B14', border:'1px solid #252530', borderRadius:10, color:'#E2E2E8', fontSize:14, padding:'12px 14px', outline:'none' }} />
            </div>
            <div style={{ marginBottom:22 }}>
              <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }}>Password</label>
              <div style={{ position:'relative' }}>
                <input type={showPwd?'text':'password'} value={password} onChange={e=>{setPassword(e.target.value);setError('')}} placeholder="••••••••" required
                  style={{ width:'100%', background:'#0B0B14', border:'1px solid #252530', borderRadius:10, color:'#E2E2E8', fontSize:14, padding:'12px 42px 12px 14px', outline:'none' }} />
                <button type="button" onClick={()=>setShowPwd(v=>!v)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:11 }}>
                  {showPwd?'Hide':'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background:'#FF453A14', border:'1px solid #FF453A30', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#FF453A', marginBottom:18 }}>
                ✕ {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width:'100%', background:selected?.color||'#0A84FF', color:'#fff', border:'none',
              borderRadius:10, padding:14, fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer',
              opacity:loading?.7:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
              {loading ? (
                <><div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }} />Signing in...</>
              ) : `Sign in${selected?` as ${selected.name.split(' ')[0]}`:''}`}
            </button>
          </form>

          {selected && (
            <div style={{ marginTop:18, padding:'9px 13px', background:'#111118', border:'1px solid #1A1A24', borderRadius:8, fontSize:11, color:'#3A3A4A', display:'flex', gap:14 }}>
              <span><span style={{ color:'#555' }}>Email: </span><span style={{ fontFamily:'monospace', color:'#666' }}>{selected.email}</span></span>
              <span><span style={{ color:'#555' }}>Pass: </span><span style={{ fontFamily:'monospace', color:'#666' }}>{selected.password}</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
