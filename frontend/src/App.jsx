import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage      from './components/shared/LoginPage'
import Sidebar        from './components/shared/Sidebar'
import { Spinner }    from './components/shared/UI'
import Dashboard      from './components/dashboard/Dashboard'
import WalletPage     from './components/dashboard/WalletPage'
import NewRequestForm from './components/forms/NewRequestForm'
import RequestsList   from './components/forms/RequestsList'
import ApprovalsQueue from './components/forms/ApprovalsQueue'
import BookingPanel from './components/admin/BookingPanel'
import AdHocBookingPanel from './components/admin/AdHocBookingPanel'
import AdminBookingsView from './components/admin/AdminBookingsView'
import SelfBookingPanel from './components/booking/SelfBookingPanel'
import MyTicketsPage    from './components/booking/MyTicketsPage'
import TierConfig     from './components/admin/TierConfig'
import { requestsAPI } from './services/api'

function WelcomeBanner() {
  const { user } = useAuth()
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const msgs = {
    'Employee':      'Submit requests, track wallet balance, and download tickets from the dashboard.',
    'Tech Lead':     'Approve team requests. Both hierarchy and Finance lanes must complete before wallet loads.',
    'Manager':       'Review and approve escalated requests. Finance approves budget amounts in parallel.',
    'Finance':       'You set the final approved amounts. Wallet is credited after your approval.',
    'Booking Admin': 'Book travel and hotels using employee wallet. Upload tickets to their portal.',
    'Super Admin':   'Full access. Your approval covers both hierarchy and Finance lanes simultaneously.',
  }
  return (
    <div style={{ background:`${user.color}0C`, border:`1px solid ${user.color}20`, borderRadius:12, padding:'12px 18px', marginBottom:22, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <div>
        <div style={{ fontSize:13, color:'#E2E2E8', fontWeight:500 }}>
          {greet}, <span style={{ color:user.color }}>{user.name.split(' ')[0]}</span> 👋
        </div>
        <div style={{ fontSize:11, color:'#444', marginTop:2 }}>{msgs[user.role]}</div>
      </div>
      <div style={{ fontSize:11, color:user.color, background:`${user.color}12`, border:`1px solid ${user.color}25`, borderRadius:20, padding:'4px 12px' }}>
        {user.empId} · {user.dept}
      </div>
    </div>
  )
}

function InnerApp() {
  const { user } = useAuth()
  const [tab,          setTab]          = useState('dashboard')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (['Tech Lead','Manager','Finance','Super Admin'].includes(user.role)) {
      requestsAPI.queue().then(d => setPendingCount(d.count||0)).catch(()=>{})
    }
    const interval = setInterval(() => {
      if (['Tech Lead','Manager','Finance','Super Admin'].includes(user.role)) {
        requestsAPI.queue().then(d => setPendingCount(d.count||0)).catch(()=>{})
      }
    }, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [user.role, tab])

  function onNewRequest()  { setTab('new-request') }
  function afterNewReq()   { setTab('my-requests') }

  const pages = {
    'dashboard':      <Dashboard setTab={setTab} />,
    'my-requests':    <RequestsList onNewRequest={onNewRequest} />,
    'requests':       <RequestsList onNewRequest={onNewRequest} />,
    'new-request':    <NewRequestForm onSuccess={afterNewReq} />,
    'approvals':      <ApprovalsQueue />,
    'my-wallet':      <WalletPage />,
    'booking-panel':  <BookingPanel showHistory={false} />,
    'booking-history':<BookingPanel showHistory={true} />,
    'ad-hoc-booking': <AdHocBookingPanel />,
    'admin-bookings-view': <AdminBookingsView />,
    'tiers':          <TierConfig />,
    'book':           <SelfBookingPanel />,
    'my-tickets':     <MyTicketsPage />,
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <Sidebar active={tab} setActive={setTab} pendingCount={pendingCount} />
      <main style={{ marginLeft:220, flex:1, padding:'30px 36px', minHeight:'100vh', maxWidth:'calc(100vw - 220px)', overflowX:'hidden' }}>
        <WelcomeBanner />
        {pages[tab] || pages['dashboard']}
      </main>
    </div>
  )
}

function AppRoot() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#09090E' }}>
      <div style={{ textAlign:'center' }}>
        <div className="syne" style={{ fontSize:22, fontWeight:800, color:'#F0F0F4', marginBottom:18 }}>
          Travel<span style={{ color:'#0A84FF' }}>Desk</span>
        </div>
        <Spinner size={32} />
      </div>
    </div>
  )
  return user ? <InnerApp /> : <LoginPage />
}

export default function App() {
  return <AuthProvider><AppRoot /></AuthProvider>
}
