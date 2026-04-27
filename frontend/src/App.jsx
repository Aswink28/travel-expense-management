import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
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
import TierConfig             from './components/admin/TierConfig'
import DesignationManagement from './components/admin/DesignationManagement'
import EmployeeManagement from './components/admin/EmployeeManagement'
import RoleManagement     from './components/admin/RoleManagement'
import BulkEmployeeUpload from './components/admin/BulkEmployeeUpload'
import TransactionsPage   from './components/dashboard/TransactionsPage'
import { requestsAPI } from './services/api'

function WelcomeBanner() {
  const { user } = useAuth()
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const msgs = {
    'Employee':         'Submit requests, track wallet balance, and download tickets from the dashboard.',
    'Request Approver': 'Approve travel requests at your tier in the chain. Both hierarchy and Finance lanes must complete before wallet loads.',
    'Finance':       'You set the final approved amounts. Wallet is credited after your approval.',
    'Booking Admin': 'Book travel and hotels using employee wallet. Upload tickets to their portal.',
    'Super Admin':   'Full access. Your approval covers both hierarchy and Finance lanes simultaneously.',
  }
  return (
    <div
      className="welcome-banner"
      style={{ background: `${user.color}0C`, borderColor: `${user.color}20` }}
    >
      <div>
        <div className="welcome-greeting">
          {greet}, <span style={{ color: user.color }}>{user.name.split(' ')[0]}</span> 👋
        </div>
        <div className="welcome-sub">{msgs[user.role]}</div>
      </div>
      <div
        className="welcome-badge"
        style={{ color: user.color, background: `${user.color}12`, borderColor: `${user.color}25` }}
      >
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
    if (['Request Approver','Finance','Super Admin'].includes(user.role)) {
      requestsAPI.queue().then(d => setPendingCount(d.count||0)).catch(()=>{})
    }
    const interval = setInterval(() => {
      if (['Request Approver','Finance','Super Admin'].includes(user.role)) {
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
    'new-request':    <NewRequestForm onSuccess={afterNewReq} />,
    'approvals':      <ApprovalsQueue />,
    'my-wallet':      <WalletPage />,
    'booking-panel':  <BookingPanel showHistory={false} />,
    'booking-history':<BookingPanel showHistory={true} />,
    'ad-hoc-booking': <AdHocBookingPanel />,
    'admin-bookings-view': <AdminBookingsView />,
    'employees':      <EmployeeManagement setTab={setTab} />,
    'bulk-employees': <BulkEmployeeUpload />,
    'roles':          <RoleManagement />,
    'tiers':          <TierConfig />,
    'designations':   <DesignationManagement />,
    'book':           <SelfBookingPanel />,
    'my-tickets':     <MyTicketsPage />,
    'transactions':   <TransactionsPage />,
  }

  return (
    <div className="app-shell">
      <Sidebar active={tab} setActive={setTab} pendingCount={pendingCount} />
      <main className="app-main">
        <WelcomeBanner />
        {pages[tab] || pages['dashboard']}
      </main>
    </div>
  )
}

function AppRoot() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="app-loading">
      <div className="app-loading-inner">
        <div className="app-loading-brand">
          Moiter <span className="login-gradient-text">Workz</span>
        </div>
        <Spinner size={32} />
      </div>
    </div>
  )
  return user ? <InnerApp /> : <LoginPage />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </ThemeProvider>
  )
}
