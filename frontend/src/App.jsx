import { useState, useEffect, useMemo, useCallback } from "react";
import { AuthProvider, useAuth, hasPermission } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import LandingPage from "./components/shared/LandingPage";
import LoginPage from "./components/shared/LoginPage";
import Sidebar from "./components/shared/Sidebar";
import { Spinner } from "./components/shared/UI";
import Dashboard from "./components/dashboard/Dashboard";
import WalletPage from "./components/dashboard/WalletPage";
import NewRequestForm from "./components/forms/NewRequestForm";
import RequestsList from "./components/forms/RequestsList";
import ApprovalsQueue from "./components/forms/ApprovalsQueue";
import BookingPanel from "./components/admin/BookingPanel";
import AdHocBookingPanel from "./components/admin/AdHocBookingPanel";
import AdminBookingsView from "./components/admin/AdminBookingsView";
import SelfBookingPanel from "./components/booking/SelfBookingPanel";
import MyTicketsPage from "./components/booking/MyTicketsPage";
import TierConfig from "./components/admin/TierConfig";
import DesignationManagement from "./components/admin/DesignationManagement";
import ApproverAuditLog from "./components/admin/ApproverAuditLog";
import EmployeeManagement from "./components/admin/EmployeeManagement";
import RoleManagement from "./components/admin/RoleManagement";
import BulkEmployeeUpload from "./components/admin/BulkEmployeeUpload";
import AdminUsers from "./components/admin/AdminUsers";
import AdminCreateRequest from "./components/admin/AdminCreateRequest";
import TransactionsPage from "./components/dashboard/TransactionsPage";
import { requestsAPI } from "./services/api";

// ── Permission-gated page rendering ────────────────────────────
// Renders a 403 banner instead of the page when the active tab is
// not in user.pages with can_view = true. Catches direct-state
// navigation, programmatic setTab() calls, and any page id that
// hasn't been explicitly granted to this admin user.
//
// Pages that are not in ALL_ADMIN_PAGES (e.g. dashboard, my-requests,
// my-wallet) bypass the gate so existing employee flows keep working
// — admin permission checks only apply to admin-side pages.
const ADMIN_GATED_PAGES = new Set([
  "employees",
  "roles",
  "tiers",
  "designations",
  "audit-log",
  "admin-users",
  "booking-panel",
  "booking-history",
  "bulk-employees",
  "admin-create-request",
]);

function PageGuard({ tab, children }) {
  const { user } = useAuth();
  const requiresGate = ADMIN_GATED_PAGES.has(tab);
  const allowed = !requiresGate || hasPermission(user, tab, "view");
  if (allowed) return children;
  return (
    <div
      style={{
        padding: "var(--space-12) var(--space-6)",
        textAlign: "center",
        maxWidth: 540,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-danger)",
          background: "color-mix(in srgb, var(--danger) 14%, transparent)",
          border:
            "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
          padding: "4px 12px",
          borderRadius: 999,
          display: "inline-block",
          marginBottom: 16,
        }}
      >
        403 · Permission denied
      </div>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: "var(--text-primary)",
          marginBottom: 8,
        }}
      >
        You don't have access to this page
      </h2>
      <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.55 }}>
        Your role does not include view permission for{" "}
        <code
          style={{
            background: "var(--bg-card-deep)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          {tab}
        </code>
        . If you believe this is wrong, ask a Super Admin to review the
        permission matrix on your account.
      </p>
    </div>
  );
}

// All valid page IDs — used to validate URL path on mount and back/forward nav.
const VALID_PAGES = new Set([
  "dashboard", "my-requests", "new-request", "approvals", "my-wallet",
  "booking-panel", "ad-hoc-booking", "admin-bookings-view", "employees",
  "bulk-employees", "roles", "tiers", "designations", "audit-log",
  "admin-users", "admin-create-request", "book", "my-tickets", "transactions",
]);

// Extract page id from the current pathname, stripping the Vite base path.
// e.g. "/moi-corp/designations" → "designations", "/moi-corp/" → ""
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");
function pageFromPath() {
  return window.location.pathname.replace(BASE, "").replace(/^\/+/, "");
}

function InnerApp() {
  const { user } = useAuth();
  // Default to the first page the user actually has access to.
  const firstPage = (user?.pages || []).find((p) => p.can_view !== false)?.id || "dashboard";

  // ── Path-based routing (History API) ────────────────────────
  // Read the URL pathname on mount to restore the active tab after
  // a page refresh. Falls back to firstPage if path is absent or invalid.
  const [tab, setTabState] = useState(() => {
    const page = pageFromPath();
    return page && VALID_PAGES.has(page) ? page : firstPage;
  });

  // Wrap the raw setter so every navigation — sidebar clicks,
  // dashboard shortcuts, programmatic setTab() calls — also
  // updates the URL path. Child components receive this wrapper
  // transparently (same setTab prop name, same call signature).
  const setTab = useCallback((id) => {
    setTabState(id);
    window.history.pushState(null, "", `${BASE}/${id}`);
  }, []);

  // Set initial path in the URL bar when loading at the bare base
  // path, using replaceState to avoid polluting the history stack.
  useEffect(() => {
    const page = pageFromPath();
    if (!page || !VALID_PAGES.has(page)) {
      window.history.replaceState(null, "", `${BASE}/${tab}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync state when the user presses the browser Back / Forward
  // buttons. Uses setTabState (not setTab) to avoid pushing a
  // duplicate history entry for a path that has already changed.
  useEffect(() => {
    function onPopState() {
      const page = pageFromPath();
      if (page && VALID_PAGES.has(page)) setTabState(page);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const [pendingCount, setPendingCount] = useState(0);

  // If the active tab disappears from user.pages after a permission change
  // fall back to the first visible page.
  const visibleIds = useMemo(
    () =>
      new Set(
        (user?.pages || [])
          .filter((p) => p.can_view !== false)
          .map((p) => p.id),
      ),
    [user?.pages],
  );
  useEffect(() => {
    if (ADMIN_GATED_PAGES.has(tab) && !visibleIds.has(tab)) setTab(firstPage);
  }, [tab, visibleIds, firstPage, setTab]);

  // Refresh sidebar pending-approval badge count
  const refreshPendingCount = useCallback(() => {
    if (["Request Approver", "Finance", "Super Admin"].includes(user.role)) {
      requestsAPI
        .queue()
        .then((d) => setPendingCount(d.count || 0))
        .catch(() => {});
    }
  }, [user.role]);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 30000);
    return () => clearInterval(interval);
  }, [refreshPendingCount, tab]);

  function onNewRequest() {
    setTab("new-request");
  }
  function afterNewReq() {
    setTab("my-requests");
  }

  const pages = {
    dashboard: <Dashboard setTab={setTab} />,
    "my-requests": <RequestsList onNewRequest={onNewRequest} />,
    "new-request": <NewRequestForm onSuccess={afterNewReq} />,
    approvals: <ApprovalsQueue onAction={refreshPendingCount} />,
    "my-wallet": <WalletPage />,
    "booking-panel": <BookingPanel showHistory={false} />,
    "ad-hoc-booking": <AdHocBookingPanel />,
    "admin-bookings-view": <AdminBookingsView />,
    employees: <EmployeeManagement setTab={setTab} />,
    "bulk-employees": <BulkEmployeeUpload />,
    roles: <RoleManagement />,
    tiers: <TierConfig />,
    designations: <DesignationManagement />,
    "audit-log": <ApproverAuditLog />,
    "admin-users": <AdminUsers />,
    "admin-create-request": <AdminCreateRequest />,
    book: <SelfBookingPanel />,
    "my-tickets": <MyTicketsPage />,
    transactions: <TransactionsPage />,
  };

  return (
    <div className="app-shell">
      <Sidebar active={tab} setActive={setTab} pendingCount={pendingCount} />
      <main className="app-main">
        <PageGuard tab={tab}>{pages[tab] || pages["dashboard"]}</PageGuard>
      </main>
    </div>
  );
}

function AppRoot() {
  const { user, loading } = useAuth();
  // Public flow: landing → login → app. `view` only matters when unauthed.
  const [view, setView] = useState("landing"); // 'landing' | 'login'

  if (loading)
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <div className="app-loading-brand">
            Moi<span className="login-gradient-text">Corp</span>
          </div>
          <Spinner size={32} />
        </div>
      </div>
    );
  if (user) return <InnerApp />;
  if (view === "login") return <LoginPage />;
  return <LandingPage onSignIn={() => setView("login")} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </ThemeProvider>
  );
}
