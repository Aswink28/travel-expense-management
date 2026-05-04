import { useState, useEffect } from "react";
import { employeesAPI, rolesAPI, tiersAPI } from "../../services/api";
import { useAuth, usePermission } from "../../context/AuthContext";
import {
  Card,
  Button,
  Input,
  Select,
  Alert,
  Spinner,
  Modal,
  PageTitle,
} from "../shared/UI";
import { Eye, EyeOff } from "lucide-react";

// PPI productId is configured server-side via PPI_PRODUCT_IDS env var.
// The frontend no longer sends it on Create Employee.

// Authority ranks used to order the approval sequence (lowest authority first).
const ROLE_RANK = {
  "Super Admin": 1,
  "Booking Admin": 2,
  Manager: 3,
  Finance: 3,
  "Tech Lead": 4,
  "Software Engineer": 5,
};

// When a role is picked, auto-apply its default designation. Roles are permission
// classes (Employee, Request Approver, Finance, Booking Admin, Super Admin); the
// default designation here is the most common job title for each class.
const ROLE_DEFAULT_DESIGNATION = {
  "Employee": "Software Engineer",
  "Request Approver": "Tech Lead",
  "Finance": "Finance",
  "Booking Admin": "Booking Admin",
  "Super Admin": "Super Admin",
};
function designationForRole(roleName) {
  return ROLE_DEFAULT_DESIGNATION[roleName] || roleName;
}

const readonlyLabelStyle = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 6,
  display: "block",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const readonlyInputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  outline: "none",
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "not-allowed",
  opacity: 0.85,
};

const INITIAL_FORM = {
  name: "",
  email: "",
  password: "",
  role: "Employee",
  department: "",
  mobile_number: "",
  date_of_birth: "",
  gender: "",
  pan_number: "",
  aadhaar_number: "",
  approver_roles: [],
  // approval_flow / approval_type are intentionally absent from the form —
  // they are derived from the employee's tier on the backend (see
  // resolveApprovalMode in routes/requests.js). Employees never pick a flow.
  designation: "",
  tier_id: null,
  // Per-employee approver chain — one entry per step in the tier's approval sequence.
  // Each entry: { step_designation, step_order, primary_user_id, backup_user_id }
  approver_chain: [],
};

function MLabel({ text, required }) {
  return (
    <>
      {text}
      {required && <span style={{ color: 'var(--text-danger)', marginLeft: 2 }}>*</span>}
    </>
  );
}

export default function EmployeeManagement({ setTab }) {
  const { user } = useAuth();
  // Permission gates — backend enforces these too. UI just hides/disables
  // affordances so users don't see actions that will fail with 403.
  const canCreate = usePermission('employees', 'create');
  const canEdit   = usePermission('employees', 'edit');
  const canDelete = usePermission('employees', 'delete');
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [tierPreview, setTierPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editLoading, setEditLoading] = useState(false); // detail-fetch in flight
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [popup, setPopup] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [walletAction, setWalletAction] = useState(null); // { type:'suspend'|'close', emp }
  const [walletReason, setWalletReason] = useState("");
  const [walletActing, setWalletActing] = useState(false);

  const ROLE_COLORS = roles.reduce((acc, r) => {
    acc[r.name] = r.color;
    return acc;
  }, {});
  const ROLE_NAMES = roles.filter((r) => r.is_active).map((r) => r.name);
  const accent = user.color || 'var(--accent)';

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [empRes, rolesRes, tiersRes] = await Promise.all([
        employeesAPI.list(),
        rolesAPI.list(),
        tiersAPI
          .list()
          .catch(() => ({ data: { tiers: [], designations: [] } })),
      ]);
      setEmployees(empRes.data);
      setRoles(rolesRes.data);
      setTiers(tiersRes.data?.tiers || []);
      setDesignations(tiersRes.data?.designations || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function applyDesignation(designation) {
    setForm((prev) => ({ ...prev, designation }));
    setTierPreview(null);
    if (!designation) {
      setForm((prev) => ({ ...prev, tier_id: null, approver_chain: [] }));
      return;
    }
    try {
      const res = await tiersAPI.preview(designation);
      const t = res?.data;
      if (!t) {
        setForm((prev) => ({ ...prev, tier_id: null, approver_chain: [] }));
        return;
      }
      setTierPreview(t);
      const approvers = Array.isArray(t.approver_roles) ? t.approver_roles : [];
      const mappedRole = t.designation_role || null;

      // Build a fresh approver-chain skeleton keyed by each step in the tier's sequence,
      // ordered lowest-authority-first. Preserve any primary/backup the admin had
      // already picked for that step before the designation changed.
      const orderedSteps = [...approvers].sort(
        (a, b) => (ROLE_RANK[b] ?? 99) - (ROLE_RANK[a] ?? 99)
      );
      setForm((prev) => {
        const existing = Array.isArray(prev.approver_chain) ? prev.approver_chain : [];
        const byStep = new Map(
          existing.map((s) => [s.step_designation?.toLowerCase(), s])
        );
        const nextChain = orderedSteps.map((stepDesg, i) => {
          const prior = byStep.get(stepDesg.toLowerCase());
          return {
            step_designation: stepDesg,
            step_order: i + 1,
            primary_user_id: prior?.primary_user_id || null,
            backup_user_id:  prior?.backup_user_id  || null,
          };
        });
        return {
          ...prev,
          tier_id: t.id,
          approver_roles: approvers.length ? approvers : prev.approver_roles,
          role: mappedRole || prev.role,
          approver_chain: nextChain,
        };
      });
      setFieldErrors((prev) => {
        const n = { ...prev };
        delete n.approver_roles;
        delete n.approver_chain;
        return n;
      });
    } catch (_) {
      /* preview failed — leave form untouched */
    }
  }

  function defaultApproversForRole(roleName, rolesList = roles) {
    const r = rolesList.find((r) => r.name === roleName);
    return Array.isArray(r?.approvers) ? [...r.approvers] : [];
  }

  function openCreate() {
    setEditId(null);
    const defaults = defaultApproversForRole("Employee");
    setForm({
      ...INITIAL_FORM,
      approver_roles: defaults,
    });
    setFieldErrors({});
    setTierPreview(null);
    setShowPw(false);
    setShowModal(true);
    // Auto-resolve tier for the default role so the modal opens with the tier
    // policy preview already visible.
    applyDesignation(designationForRole("Employee"));
  }

  function toDateInput(val) {
    if (!val) return "";
    if (typeof val === "string") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
      if (val.length >= 10 && val[4] === "-" && val[7] === "-")
        return val.slice(0, 10);
    }
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function populateForm(emp) {
    const allowed = defaultApproversForRole(emp.role);
    const stored = Array.isArray(emp.approver_roles) ? emp.approver_roles : [];
    const filtered = stored.filter((r) => allowed.includes(r));
    const approverRoles = filtered.length ? filtered : allowed;
    const incomingChain = Array.isArray(emp.approver_chain) ? emp.approver_chain : []
    const normalisedChain = incomingChain.map((s) => ({
      step_designation: s.step_designation,
      step_order:       Number(s.step_order) || 1,
      primary_user_id:  s.primary_user_id || null,
      backup_user_id:   s.backup_user_id  || null,
    }))
    setForm({
      name: emp.name || "",
      email: emp.email || "",
      password: "",
      role: emp.role || "Employee",
      department: emp.department || "",
      mobile_number: emp.mobile_number || "",
      date_of_birth: toDateInput(emp.date_of_birth),
      gender: emp.gender || "",
      pan_number: emp.pan_number || "",
      aadhaar_number: emp.aadhaar_number || "",
      approver_roles: approverRoles,
      designation: emp.designation || "",
      tier_id: emp.tier_id || null,
      approver_chain: normalisedChain,
    });
    setFieldErrors({});
    // Refresh tier preview if the employee has a designation
    if (emp.designation) {
      tiersAPI
        .preview(emp.designation)
        .then((r) => setTierPreview(r?.data || null))
        .catch(() => setTierPreview(null));
    } else {
      setTierPreview(null);
    }
  }

  async function openEdit(emp) {
    if (!emp?.id) {
      setPopup({ type: 'error', title: 'Cannot Edit', message: 'Missing employee id — refresh the list and try again.' });
      return;
    }
    setEditId(emp.id);
    setFieldErrors({});
    setShowPw(false);
    populateForm(emp); // optimistic fill from row data so the modal opens populated
    setShowModal(true);
    setEditLoading(true);
    try {
      const fresh = await employeesAPI.get(emp.id);
      if (fresh?.data) populateForm(fresh.data);
    } catch (err) {
      // Don't close the modal — keep what we have from the list, but tell the user
      // why the latest values couldn't be pulled.
      setPopup({
        type: 'error',
        title: 'Could not refresh latest details',
        message: `Showing cached values for ${emp.name}. Refresh failed: ${err?.message || 'unknown error'}`,
      });
    } finally {
      setEditLoading(false);
    }
  }

  function validate() {
    const e = {};
    const v = form;
    if (!v.name.trim()) e.name = "Full name is required";
    if (!v.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
      e.email = "Invalid email format";
    if (!editId && !v.password) e.password = "Password is required";
    else if (v.password && v.password.length < 6)
      e.password = "Minimum 6 characters";
    if (!v.designation) e.designation = "Designation is required";
    if (!v.role) e.role = "Role could not be derived from the selected designation. Map the designation to a role in the Designations page.";
    if (!v.mobile_number) e.mobile_number = "Mobile number is required";
    else if (!/^\d{10}$/.test(v.mobile_number))
      e.mobile_number = "Must be 10 digits";
    if (!v.date_of_birth) e.date_of_birth = "Date of birth is required";
    if (!v.gender) e.gender = "Gender is required";
    if (!v.pan_number) e.pan_number = "PAN number is required";
    else if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(v.pan_number))
      e.pan_number = "Invalid format (e.g. ABCDE1234F)";
    if (!v.aadhaar_number) e.aadhaar_number = "Aadhaar number is required";
    else if (!/^\d{12}$/.test(v.aadhaar_number))
      e.aadhaar_number = "Must be 12 digits";

    const selected = Array.isArray(v.approver_roles) ? v.approver_roles : [];
    if (selected.length === 0)
      e.approver_roles = "Select at least one approver";

    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const selected = Array.isArray(form.approver_roles)
        ? form.approver_roles
        : [];
      const payload = {
        ...form,
        approver_roles: selected,
        designation: form.designation || null,
        tier_id: form.tier_id || null,
        approver_chain: Array.isArray(form.approver_chain) ? form.approver_chain : [],
      };
      if (editId && !payload.password) delete payload.password;
      if (!payload.department) delete payload.department;
      delete payload.reporting_to;

      let result;
      if (editId) {
        result = await employeesAPI.update(editId, payload);
        setShowModal(false);
        setPopup({
          type: "success",
          title: "Employee Updated",
          message: result.message || "Employee has been updated successfully.",
          details: { name: form.name, email: form.email, role: form.role },
        });
      } else {
        result = await employeesAPI.create(payload);
        setShowModal(false);
        setPopup({
          type: "success",
          title: "Employee Created",
          message:
            result.message || "New employee has been created successfully.",
          details: {
            empId: result.data?.emp_id,
            name: form.name,
            email: form.email,
            role: form.role,
            mobile: form.mobile_number,
            walletId: result.data?.ppi_wallet_id || "—",
          },
        });
      }
      load();
    } catch (err) {
      setPopup({
        type: "error",
        title: editId ? "Update Failed" : "Creation Failed",
        message: err.message || "Something went wrong. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function openWalletAction(type, emp) {
    setWalletAction({ type, emp });
    setWalletReason("");
  }

  async function handleWalletAction() {
    if (!walletReason.trim()) {
      setPopup({
        type: "error",
        title: "Reason Required",
        message: "Please provide a reason to proceed.",
      });
      return;
    }
    setWalletActing(true);
    try {
      const { type, emp } = walletAction;
      let result;
      if (type === "suspend") {
        result = await employeesAPI.suspendWallet(emp.id, walletReason.trim());
      } else {
        result = await employeesAPI.closeWallet(emp.id, walletReason.trim());
      }
      setWalletAction(null);
      setWalletReason("");
      setPopup({
        type: "success",
        title: type === "suspend" ? "Wallet Suspended" : "Wallet Closed",
        message: result.message,
        details: {
          employee: result.data?.employee_name,
          status: result.data?.wallet_status,
          reason: result.data?.reason,
          ...(type === "suspend"
            ? {
                suspended_at: result.data?.suspended_at
                  ? new Date(result.data.suspended_at).toLocaleString("en-IN")
                  : "-",
              }
            : {}),
          ...(type === "close"
            ? {
                closed_at: result.data?.closed_at
                  ? new Date(result.data.closed_at).toLocaleString("en-IN")
                  : "-",
              }
            : {}),
          performed_by: result.data?.performed_by,
        },
      });
      load();
    } catch (err) {
      setPopup({
        type: "error",
        title: "Action Failed",
        message: err.message || "Something went wrong. Please try again.",
      });
    } finally {
      setWalletActing(false);
    }
  }

  function f(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "role" && value !== prev.role) {
        next.approver_roles = defaultApproversForRole(value);
      }
      return next;
    });
    if (fieldErrors[field])
      setFieldErrors((prev) => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    if (field === "role") {
      setFieldErrors((prev) => {
        const n = { ...prev };
        delete n.approver_roles;
        return n;
      });
      // Auto-resolve tier from the role name via designation mapping.
      // Only fires when the user hasn't set a more specific designation already
      // (i.e. the designation was either empty or mirroring the previous role).
      const prevRole = form.role;
      const prevAutoDesignation = designationForRole(prevRole || "");
      const currentDesignation = (form.designation || "").trim();
      const shouldAutoApply =
        !currentDesignation ||
        currentDesignation.toLowerCase() === prevAutoDesignation.toLowerCase();
      if (shouldAutoApply) applyDesignation(designationForRole(value));
    }
  }

  function toggleApprover(roleName) {
    setForm((prev) => {
      const list = Array.isArray(prev.approver_roles)
        ? prev.approver_roles
        : [];
      const isRemoving = list.includes(roleName);
      const nextRoles = isRemoving
        ? list.filter((x) => x !== roleName)
        : [...list, roleName];

      // Rebuild approver_chain so the Primary & Backup card mirrors the toggle.
      // Drop the step for a deselected role; add an empty step for a newly selected one.
      // Steps stay ordered lowest-authority-first by ROLE_RANK.
      const existingChain = Array.isArray(prev.approver_chain)
        ? prev.approver_chain
        : [];
      const byStep = new Map(
        existingChain.map((s) => [s.step_designation?.toLowerCase(), s])
      );
      const orderedSteps = [...nextRoles].sort(
        (a, b) => (ROLE_RANK[b] ?? 99) - (ROLE_RANK[a] ?? 99)
      );
      const nextChain = orderedSteps.map((stepDesg, i) => {
        const prior = byStep.get(stepDesg.toLowerCase());
        return {
          step_designation: stepDesg,
          step_order: i + 1,
          primary_user_id: prior?.primary_user_id || null,
          backup_user_id:  prior?.backup_user_id  || null,
        };
      });

      return {
        ...prev,
        approver_roles: nextRoles,
        approver_chain: nextChain,
      };
    });
    setFieldErrors((prev) => {
      const n = { ...prev };
      delete n.approver_roles;
      delete n.approver_chain;
      return n;
    });
  }

  function demoFill() {
    const uid = Date.now().toString(36).slice(-4);
    const rDigits = (n) =>
      Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const firstNames = [
      "Aarav",
      "Vivaan",
      "Aditya",
      "Sai",
      "Arjun",
      "Reyansh",
      "Krishna",
      "Ishaan",
      "Ananya",
      "Diya",
      "Meera",
      "Pooja",
      "Kavya",
      "Riya",
      "Neha",
      "Priya",
      "Lakshmi",
      "Sneha",
    ];
    const lastNames = [
      "Sharma",
      "Patel",
      "Reddy",
      "Kumar",
      "Nair",
      "Iyer",
      "Singh",
      "Gupta",
      "Joshi",
      "Menon",
      "Das",
      "Rao",
      "Pillai",
      "Verma",
      "Chauhan",
      "Mishra",
    ];
    const depts = [
      "Engineering",
      "Finance",
      "HR",
      "Operations",
      "Marketing",
      "Design",
      "QA",
      "DevOps",
      "Sales",
      "Support",
    ];
    const panLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const first = pick(firstNames);
    const last = pick(lastNames);
    const year = 1980 + Math.floor(Math.random() * 25);
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
    const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
    const demoRole = pick(ROLE_NAMES.length ? ROLE_NAMES : ["Employee"]);
    const demoDesignation = designationForRole(demoRole);
    setForm({
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}.${uid}@company.in`,
      password: "pass123",
      role: demoRole,
      department: pick(depts),
      mobile_number: `9${rDigits(9)}`,
      date_of_birth: `${year}-${month}-${day}`,
      gender: pick(["Male", "Female"]),
      pan_number:
        Array.from({ length: 5 }, () => pick([...panLetters])).join("") +
        rDigits(4) +
        pick([...panLetters]),
      aadhaar_number: rDigits(12),
      approver_roles: defaultApproversForRole(demoRole),
      designation: demoDesignation,
      tier_id: null,
      approver_chain: [],
    });
    setFieldErrors({});
    // Trigger the same designation-resolution path the manual form uses, so the tier
    // preview, tier_id, and the Primary & Backup Approvers card all populate.
    if (demoDesignation) applyDesignation(demoDesignation);
  }

  const filtered = employees.filter((emp) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      emp.name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.emp_id.toLowerCase().includes(q);
    const matchRole = !roleFilter || emp.role === roleFilter;
    return matchSearch && matchRole;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spinner size={36} />
      </div>
    );

  const errCount = Object.keys(fieldErrors).length;

  return (
    <div className="fade-up">
      {!showModal && (
        <PageTitle
          title="Employee Management"
          sub="Create and manage employee accounts"
        />
      )}
      {error && (
        <Alert type="error" style={{ marginBottom: 16 }}>
          {error}
        </Alert>
      )}

      {!showModal && <>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          placeholder="Search by name, email, or ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            flex: 1,
            minWidth: 200,
            background: 'var(--bg-input)',
            border: "1px solid var(--border-input)",
            borderRadius: 8,
            color: 'var(--text-body)',
            fontSize: 13,
            padding: "9px 12px",
            outline: "none",
          }}
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          style={{
            background: 'var(--bg-input)',
            border: "1px solid var(--border-input)",
            borderRadius: 8,
            color: 'var(--text-body)',
            fontSize: 13,
            padding: "9px 12px",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">All Roles</option>
          {ROLE_NAMES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          onClick={load}
          disabled={loading}
          style={{ whiteSpace: "nowrap" }}
          title="Re-fetch all employees from the server"
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </Button>
        <Button
          variant="purple"
          onClick={() => setTab?.("bulk-employees")}
          style={{ whiteSpace: "nowrap" }}
        >
          Bulk Upload
        </Button>
        <Button onClick={openCreate} disabled={!canCreate}
          title={canCreate ? '' : 'You do not have permission to create employees'}
          style={{ whiteSpace: "nowrap" }}>
          + New Employee
        </Button>
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          ["Total", employees.length, accent],
          [
            "Active",
            employees.filter(
              (e) =>
                (e.ppi_wallet_status || "ACTIVE").toUpperCase() === "ACTIVE",
            ).length,
            'var(--success)',
          ],
          [
            "Suspended",
            employees.filter(
              (e) => (e.ppi_wallet_status || "").toUpperCase() === "SUSPENDED",
            ).length,
            'var(--warning)',
          ],
          ["Roles", new Set(employees.map((e) => e.role)).size, 'var(--purple)'],
        ].map(([label, val, color]) => (
          <Card key={label} style={{ padding: "14px 18px" }}>
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-dim)',
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: 4,
              }}
            >
              {label}
            </div>
            <div
              className="syne"
              style={{ fontSize: 22, fontWeight: 800, color }}
            >
              {val}
            </div>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {[
                  "Employee",
                  "Mobile",
                  "Role",
                  "Wallet Status",
                  "Account",
                  "Balance",
                  "Last Login",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!paged.length ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: 40, textAlign: "center", color: 'var(--text-dim)' }}
                  >
                    No employees found
                  </td>
                </tr>
              ) : (
                paged.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{ borderBottom: "1px solid var(--bg-card-deep)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#14141C")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td style={{ padding: "10px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background:
                              (ROLE_COLORS[emp.role] || 'var(--accent)') + "22",
                            border: `1.5px solid ${ROLE_COLORS[emp.role] || 'var(--accent)'}44`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: ROLE_COLORS[emp.role] || 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          {emp.avatar || emp.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-body)', fontWeight: 500 }}>
                            {emp.name}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                            {emp.emp_id} · {emp.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", color: 'var(--text-faint)' }}>
                      {emp.mobile_number || "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontWeight: 500,
                          background: (ROLE_COLORS[emp.role] || 'var(--text-faint)') + "14",
                          color: ROLE_COLORS[emp.role] || 'var(--text-faint)',
                        }}
                      >
                        {emp.role}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {emp.ppi_wallet_id ? (
                        (() => {
                          const ws = (
                            emp.ppi_wallet_status || "ACTIVE"
                          ).toUpperCase();
                          const wsColor =
                            ws === "ACTIVE"
                              ? 'var(--success)'
                              : ws === "SUSPENDED"
                                ? 'var(--warning)'
                                : 'var(--danger)';
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "3px 10px",
                                borderRadius: 20,
                                fontWeight: 500,
                                background: `color-mix(in srgb, ${wsColor} 8%, transparent)`,
                                color: wsColor,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              <span
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: "50%",
                                  background: wsColor,
                                }}
                              />
                              {ws}
                            </span>
                          );
                        })()
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                          No Wallet
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontWeight: 500,
                          background: emp.is_active ? "color-mix(in srgb, var(--success) 8%, transparent)" : "color-mix(in srgb, var(--danger) 8%, transparent)",
                          color: emp.is_active ? 'var(--success)' : 'var(--danger)',
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: emp.is_active ? 'var(--success)' : 'var(--danger)',
                          }}
                        />
                        {emp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: 'var(--text-faint)' }}>
                      ₹{Number(emp.wallet_balance || 0).toLocaleString("en-IN")}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        color: 'var(--text-dim)',
                        fontSize: 11,
                      }}
                    >
                      {emp.last_login
                        ? new Date(emp.last_login).toLocaleDateString("en-IN")
                        : "Never"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <div
                        style={{ display: "flex", gap: 5, flexWrap: "wrap" }}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(emp)}
                          disabled={!canEdit}
                          title={canEdit ? '' : 'You do not have permission to edit employees'}
                        >
                          Edit
                        </Button>
                        {emp.ppi_wallet_id &&
                          emp.id !== user.id &&
                          (emp.ppi_wallet_status || "ACTIVE").toUpperCase() ===
                            "ACTIVE" && (
                            <Button
                              size="sm"
                              style={{
                                background: "color-mix(in srgb, var(--warning) 9%, transparent)",
                                color: 'var(--text-warning)',
                                border: "1px solid color-mix(in srgb, var(--warning) 19%, transparent)",
                              }}
                              onClick={() => openWalletAction("suspend", emp)}
                            >
                              Suspend
                            </Button>
                          )}
                        {emp.ppi_wallet_id &&
                          emp.id !== user.id &&
                          (emp.ppi_wallet_status || "ACTIVE").toUpperCase() !==
                            "CLOSED" &&
                          user.role === "Super Admin" && (
                            <Button
                              size="sm"
                              style={{
                                background: "color-mix(in srgb, var(--danger) 9%, transparent)",
                                color: 'var(--text-danger)',
                                border: "1px solid color-mix(in srgb, var(--danger) 19%, transparent)",
                              }}
                              onClick={() => openWalletAction("close", emp)}
                            >
                              Close
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > perPage && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Showing {(safePage - 1) * perPage + 1}–
              {Math.min(safePage * perPage, filtered.length)} of{" "}
              {filtered.length}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={{
                  background: "none",
                  border: "1px solid var(--border-input)",
                  borderRadius: 6,
                  color: safePage <= 1 ? 'var(--text-dim)' : 'var(--text-muted)',
                  padding: "5px 10px",
                  fontSize: 12,
                  cursor: safePage <= 1 ? "default" : "pointer",
                }}
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 || p === totalPages || Math.abs(p - safePage) <= 1,
                )
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`dot-${i}`}
                      style={{ color: 'var(--text-dim)', fontSize: 12, padding: "0 4px" }}
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        background: p === safePage ? accent : "none",
                        border: p === safePage ? "none" : "1px solid var(--border-input)",
                        color: p === safePage ? '#fff' : 'var(--text-faint)',
                      }}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={{
                  background: "none",
                  border: "1px solid var(--border-input)",
                  borderRadius: 6,
                  color: safePage >= totalPages ? 'var(--text-dim)' : 'var(--text-muted)',
                  padding: "5px 10px",
                  fontSize: 12,
                  cursor: safePage >= totalPages ? "default" : "pointer",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </Card>
      </>}

      {/* ── Create / Edit — full-page view (replaces the modal popup) ─── */}
      {showModal && (
        <Card style={{ padding: 28, marginTop: 16, maxWidth: 960, marginLeft: 'auto', marginRight: 'auto' }}>
          {/* Page header with back button + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              style={{
                background: 'var(--bg-card-deep)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', width: 36, height: 36, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 16,
              }}
              title="Back to Employees"
            >
              ←
            </button>
            <div style={{ flex: 1 }}>
              <h2 className="syne" style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{editId ? `Edit Employee — ${form.name || ''}` : 'Create New Employee'}</span>
                {editLoading && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, background: 'var(--bg-card-deep)', padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border)' }}>
                    Refreshing latest details…
                  </span>
                )}
              </h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {editId
                  ? 'Update profile, designation, or approver chain.'
                  : 'Pick a designation — role and tier auto-fill from Tier Config.'}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {errCount > 0 && (
              <Alert type="error" style={{ marginBottom: 14 }}>
                Please fix {errCount} validation error{errCount > 1 ? "s" : ""}{" "}
                below
              </Alert>
            )}

            {!editId && (
              <button
                type="button"
                onClick={demoFill}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 500,
                  background: "color-mix(in srgb, var(--accent) 6%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--accent) 19%, transparent)",
                  color: 'var(--accent)',
                  transition: "opacity .15s",
                  marginBottom: 14,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = ".7")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                ⚡ Demo Fill — Auto-generate unique employee data
              </button>
            )}

            {/* Row 1: Name, Mobile */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 12px",
              }}
            >
              <Input
                label={<MLabel text="Full Name" required />}
                value={form.name}
                onChange={(e) => f("name", e.target.value)}
                placeholder="e.g. Rahul Sharma"
                error={fieldErrors.name}
              />
              <Input
                label={<MLabel text="Mobile Number" required />}
                value={form.mobile_number}
                onChange={(e) =>
                  f(
                    "mobile_number",
                    e.target.value.replace(/\D/g, "").slice(0, 10),
                  )
                }
                placeholder="e.g. 9876543210"
                error={fieldErrors.mobile_number}
              />
            </div>

            {/* Row 2: Email, Password */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 12px",
              }}
            >
              <Input
                label={<MLabel text="Email" required />}
                type="email"
                value={form.email}
                onChange={(e) => f("email", e.target.value)}
                placeholder="e.g. rahul@company.in"
                error={fieldErrors.email}
              />
              <div style={{ position: "relative" }}>
                <Input
                  label={
                    <MLabel
                      text={editId ? "New Password" : "Password"}
                      required={!editId}
                    />
                  }
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => f("password", e.target.value)}
                  placeholder={
                    editId ? "Leave blank to keep" : "Min 6 characters"
                  }
                  error={fieldErrors.password}
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: 30,
                    background: "none",
                    border: "none",
                    color: 'var(--text-dim)',
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 2,
                    lineHeight: 1,
                  }}
                  title={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Row 3: DOB, Gender, PAN */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0 12px",
              }}
            >
              <Input
                label={<MLabel text="Date of Birth" required />}
                type="date"
                value={form.date_of_birth}
                onChange={(e) => f("date_of_birth", e.target.value)}
                error={fieldErrors.date_of_birth}
              />
              <Select
                label={<MLabel text="Gender" required />}
                value={form.gender}
                onChange={(e) => f("gender", e.target.value)}
                error={fieldErrors.gender}
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
              <Input
                label={<MLabel text="PAN Number" required />}
                value={form.pan_number}
                onChange={(e) =>
                  f(
                    "pan_number",
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 10),
                  )
                }
                placeholder="ABCDE1234F"
                error={fieldErrors.pan_number}
              />
            </div>

            {/* Row 4: Aadhaar */}
            <Input
              label={<MLabel text="Aadhaar Number" required />}
              value={form.aadhaar_number}
              onChange={(e) =>
                f(
                  "aadhaar_number",
                  e.target.value.replace(/\D/g, "").slice(0, 12),
                )
              }
              placeholder="12-digit Aadhaar number"
              error={fieldErrors.aadhaar_number}
            />

            {/* Row 5: Designation — picking it auto-fills Role and Tier from Tier Config. */}
            <Select
              label={<MLabel text="Designation" required />}
              value={form.designation}
              onChange={(e) => applyDesignation(e.target.value)}
              error={fieldErrors.designation}
            >
              <option value="">Select a designation</option>
              {designations.map((d) => (
                <option key={d.id} value={d.designation}>
                  {d.designation}
                  {d.tier_name ? ` · ${d.tier_name}` : ""}
                </option>
              ))}
            </Select>

            {/* Auto-derived Role + Tier (read-only, from the selected designation) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 12px",
              }}
            >
              <div>
                <label style={readonlyLabelStyle}>
                  Role <span style={{ opacity: 0.7, fontWeight: 500 }}>· auto from designation</span>
                </label>
                <input
                  type="text"
                  value={form.role || ""}
                  readOnly
                  placeholder="Pick a designation to auto-assign"
                  style={readonlyInputStyle}
                />
              </div>
              <div>
                <label style={readonlyLabelStyle}>
                  Tier <span style={{ opacity: 0.7, fontWeight: 500 }}>· auto from designation</span>
                </label>
                <input
                  type="text"
                  value={(() => {
                    if (!form.tier_id) return "";
                    const t = tiers.find((x) => x.id === form.tier_id);
                    return t ? `${t.name} · rank ${t.rank}` : "";
                  })()}
                  readOnly
                  placeholder="Pick a designation to auto-assign"
                  style={readonlyInputStyle}
                />
              </div>
            </div>

            {/* Approval Flow — restricted to Role Manager approvers */}
            {(() => {
              const selectedRole = roles.find((r) => r.name === form.role);
              // Approvers come from the tier (via designation) if available; otherwise fall back to Role Manager.
              const tierApprovers = Array.isArray(tierPreview?.approver_roles)
                ? tierPreview.approver_roles
                : null;
              const options =
                tierApprovers && tierApprovers.length
                  ? tierApprovers
                  : Array.isArray(selectedRole?.approvers)
                    ? selectedRole.approvers
                    : [];
              const selected = Array.isArray(form.approver_roles)
                ? form.approver_roles
                : [];
              const orderedSelected = [...selected].sort(
                (a, b) => (ROLE_RANK[b] ?? 99) - (ROLE_RANK[a] ?? 99),
              );
              const orderedOptions = [...options].sort(
                (a, b) => (ROLE_RANK[b] ?? 99) - (ROLE_RANK[a] ?? 99),
              );

              return (
                <div
                  style={{
                    background: "var(--bg-card-deep)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "14px 16px",
                    marginTop: 20,
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ fontSize: 14 }}>🔀</span>
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-primary)",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Sequential Approval Flow
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                            marginTop: 2,
                          }}
                        >
                          {tierApprovers ? "Auto-loaded from tier · " : ""}
                          Approvals run lowest → highest authority, in order.
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "var(--accent)",
                        background:
                          "color-mix(in srgb, var(--accent) 16%, transparent)",
                        padding: "3px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {orderedSelected.length
                        ? `${orderedSelected.length}-step sequence`
                        : "No approvers"}
                    </span>
                  </div>

                  {options.length === 0 ? (
                    <>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-warning)',
                          padding: "4px 0",
                        }}
                      >
                        ⚠️ No approvers available for this designation/role.
                        Configure the tier or Role Manager first.
                      </div>
                      {fieldErrors.approver_roles && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-danger)',
                            marginTop: 6,
                            fontWeight: 600,
                          }}
                        >
                          {fieldErrors.approver_roles} — at least one approver is required to create an employee.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          marginBottom: 6,
                        }}
                      >
                        Approvers (toggle to include)
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginBottom: 12,
                        }}
                      >
                        {orderedOptions.map((name) => {
                          const r = roles.find((x) => x.name === name);
                          const color = r?.color || 'var(--text-faint)';
                          const isSelected = selected.includes(name);
                          return (
                            <label
                              key={name}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 12px",
                                borderRadius: 8,
                                cursor: "pointer",
                                background: isSelected
                                  ? `color-mix(in srgb, ${color} 13%, transparent)`
                                  : "var(--bg-input)",
                                border: `1px solid ${isSelected ? `color-mix(in srgb, ${color} 50%, transparent)` : "var(--border)"}`,
                                transition: "all .15s ease",
                                userSelect: "none",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleApprover(name)}
                                style={{
                                  width: 14,
                                  height: 14,
                                  accentColor: color,
                                  cursor: "pointer",
                                }}
                              />
                              <div
                                style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: "50%",
                                  background: `color-mix(in srgb, ${color} 19%, transparent)`,
                                  border: `1.5px solid ${color}60`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color,
                                }}
                              >
                                {name.charAt(0)}
                              </div>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: isSelected
                                    ? color
                                    : "var(--text-primary)",
                                }}
                              >
                                {name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {fieldErrors.approver_roles && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-danger)',
                            marginBottom: 10,
                          }}
                        >
                          {fieldErrors.approver_roles}
                        </div>
                      )}

                      {/* Approval flow + condition are NOT chosen here. They
                         are read from the tier (see resolveApprovalMode in
                         routes/requests.js). We surface the inherited values
                         so the admin can see the policy this employee will
                         follow without leaving the form. */}
                      {(() => {
                        const tierFlow = (tierPreview?.approval_flow || 'SEQUENTIAL').toUpperCase()
                        const tierType = (tierPreview?.approval_type || 'ALL').toUpperCase()
                        const isParallel = tierFlow === 'PARALLEL'
                        const conditionLabel = tierType === 'ANY_ONE' ? 'Any one approves' : 'All must approve'
                        const flowDescription = isParallel
                          ? `Every approver in this chain receives the request at the same time. ${tierType === 'ANY_ONE' ? 'The first approval finalises the hierarchy lane.' : 'Every approver in the chain must approve before the hierarchy lane is complete.'}`
                          : 'Approvers are notified one at a time, in the order shown below. Each step waits for the previous one.'
                        return (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                              Approval Flow
                              <span style={{ marginLeft: 8, color: 'var(--text-faint, var(--text-muted))', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                                — inherited from tier{tierPreview?.name ? ` "${tierPreview.name}"` : ''}
                              </span>
                            </div>
                            <div style={{
                              padding: '10px 12px', borderRadius: 8,
                              background: `color-mix(in srgb, var(--accent) 8%, transparent)`,
                              border: `1px solid color-mix(in srgb, var(--accent) 25%, transparent)`,
                              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                            }}>
                              <span style={{
                                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                                color: 'var(--accent)',
                                background: `color-mix(in srgb, var(--accent) 14%, transparent)`,
                                border: `1px solid color-mix(in srgb, var(--accent) 35%, transparent)`,
                                padding: '3px 9px', borderRadius: 999,
                              }}>{isParallel ? 'Parallel' : 'Sequential'}</span>
                              {isParallel && (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                                  color: 'var(--text-primary)',
                                  background: 'var(--bg-card, var(--bg-input))',
                                  border: '1px solid var(--border)',
                                  padding: '3px 9px', borderRadius: 999,
                                }}>{conditionLabel}</span>
                              )}
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: '1 1 240px' }}>
                                {flowDescription}
                              </span>
                            </div>
                          </div>
                        )
                      })()}

                      {orderedSelected.length > 0 && (
                        <>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--text-muted)",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              marginBottom: 6,
                            }}
                          >
                            Approval Chain
                          </div>
                          <div
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              background:
                                "color-mix(in srgb, var(--accent) 10%, transparent)",
                              border:
                                "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--accent)",
                            }}
                          >
                            {orderedSelected.map((name, i) => (
                              <span key={name}>
                                <span style={{ opacity: 0.6, marginRight: 4 }}>
                                  {i + 1}.
                                </span>
                                {name}
                                {i < orderedSelected.length - 1 && (
                                  <span
                                    style={{ margin: "0 8px", opacity: 0.6 }}
                                  >
                                    →
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── Per-employee Primary + Backup approvers ── */}
            {Array.isArray(form.approver_chain) && form.approver_chain.length > 0 && (
              <div
                style={{
                  background: "var(--bg-card-deep)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginTop: 18,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>👥</span>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Primary &amp; Backup Approvers
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        Assign a specific person for each step. Backup is used automatically when the primary is deactivated.
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {form.approver_chain.map((step, idx) => {
                    // Only employees with this exact designation can fill this step
                    // (Tech Lead step → only Tech Leads; Manager step → only Managers).
                    const stepDesgLc = (step.step_designation || "").toLowerCase()
                    const candidates = employees
                      .filter(
                        (e) =>
                          e.id !== editId &&
                          (e.designation || "").toLowerCase() === stepDesgLc
                      )
                      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                    const primaryUser = candidates.find((e) => e.id === step.primary_user_id)
                    const backupUser  = candidates.find((e) => e.id === step.backup_user_id)
                    const primaryInactive = primaryUser && primaryUser.is_active === false
                    return (
                      <div key={`${step.step_designation}-${idx}`} style={{ background: "var(--bg-card)", borderRadius: 8, padding: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: "var(--accent)", letterSpacing: "0.05em",
                            background: "color-mix(in srgb, var(--accent) 16%, transparent)",
                            padding: "2px 7px", borderRadius: 999,
                          }}>STEP {idx + 1}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                            {step.step_designation}
                          </span>
                          {candidates.length === 0 && (
                            <span style={{ fontSize: 10, color: 'var(--text-warning)' }}>
                              ⚠ No approver-eligible employees yet — onboard a Request Approver or Finance user first.
                            </span>
                          )}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }}>
                              Primary
                            </label>
                            <select
                              value={step.primary_user_id || ""}
                              onChange={(e) => {
                                const v = e.target.value || null
                                setForm((p) => ({
                                  ...p,
                                  approver_chain: p.approver_chain.map((s, i) => i === idx ? { ...s, primary_user_id: v } : s),
                                }))
                              }}
                              style={{
                                width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
                                background: "var(--bg-input)", outline: "none", fontSize: 12, color: "var(--text-primary)", cursor: "pointer",
                              }}
                            >
                              <option value="">— Select primary —</option>
                              {candidates
                                .filter((c) => c.id !== step.backup_user_id)
                                .map((c) => (
                                  <option key={c.id} value={c.id} disabled={c.is_active === false}>
                                    {c.name}
                                    {c.is_active === false ? " (inactive)" : ""}
                                  </option>
                                ))}
                            </select>
                            {primaryInactive && (
                              <div style={{ fontSize: 10, color: 'var(--text-warning)', marginTop: 4 }}>
                                Primary is deactivated — backup will receive requests.
                              </div>
                            )}
                          </div>

                          <div>
                            <label style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, display: "block" }}>
                              Backup
                            </label>
                            <select
                              value={step.backup_user_id || ""}
                              onChange={(e) => {
                                const v = e.target.value || null
                                setForm((p) => ({
                                  ...p,
                                  approver_chain: p.approver_chain.map((s, i) => i === idx ? { ...s, backup_user_id: v } : s),
                                }))
                              }}
                              style={{
                                width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)",
                                background: "var(--bg-input)", outline: "none", fontSize: 12, color: "var(--text-primary)", cursor: "pointer",
                              }}
                            >
                              <option value="">— Select backup —</option>
                              {candidates
                                .filter((c) => c.id !== step.primary_user_id)
                                .map((c) => (
                                  <option key={c.id} value={c.id} disabled={c.is_active === false}>
                                    {c.name}{c.is_active === false ? " (inactive)" : ""}
                                  </option>
                                ))}
                            </select>
                            {!step.backup_user_id && step.primary_user_id && (
                              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                                Recommended — covers primary's leave or exit.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 8,
              }}
            >
              <Button variant="ghost" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !Array.isArray(form.approver_roles) ||
                  form.approver_roles.length === 0
                }
                title={
                  !Array.isArray(form.approver_roles) ||
                  form.approver_roles.length === 0
                    ? "At least one approver must be assigned in the Sequential Approval Flow"
                    : undefined
                }
              >
                {saving
                  ? "Saving..."
                  : editId
                    ? "Update Employee"
                    : "Create Employee"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Suspend / Close Wallet Modal ──────────────────── */}
      {walletAction && (
        <Modal
          title=""
          onClose={() => {
            setWalletAction(null);
            setWalletReason("");
          }}
          width={460}
        >
          <div style={{ padding: "10px 0 6px" }}>
            {/* Icon */}
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  margin: "0 auto 14px",
                  background:
                    walletAction.type === "suspend" ? "color-mix(in srgb, var(--warning) 8%, transparent)" : "color-mix(in srgb, var(--danger) 8%, transparent)",
                  border: `2px solid ${walletAction.type === "suspend" ? "color-mix(in srgb, var(--warning) 19%, transparent)" : "color-mix(in srgb, var(--danger) 19%, transparent)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 26,
                }}
              >
                {walletAction.type === "suspend" ? "⏸" : "⛔"}
              </div>
              <div
                className="syne"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color:
                    walletAction.type === "suspend" ? 'var(--warning)' : 'var(--danger)',
                }}
              >
                {walletAction.type === "suspend"
                  ? "Suspend Wallet"
                  : "Close Wallet Permanently"}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 6 }}>
                {walletAction.type === "suspend"
                  ? `This will temporarily freeze ${walletAction.emp.name}'s wallet. No transactions will be allowed until reactivated.`
                  : `This will permanently close ${walletAction.emp.name}'s wallet and deactivate their account. This action cannot be undone.`}
              </div>
            </div>

            {/* Employee info */}
            <div
              style={{
                background: 'var(--bg-input)',
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Employee</span>
                <span style={{ fontSize: 12, color: 'var(--text-body)', fontWeight: 500 }}>
                  {walletAction.emp.name}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Employee ID</span>
                <span style={{ fontSize: 12, color: 'var(--text-body)' }}>
                  {walletAction.emp.emp_id}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Current Wallet Status
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color:
                      (walletAction.emp.ppi_wallet_status || "ACTIVE") ===
                      "ACTIVE"
                        ? 'var(--success)'
                        : 'var(--warning)',
                    fontWeight: 500,
                  }}
                >
                  {(
                    walletAction.emp.ppi_wallet_status || "ACTIVE"
                  ).toUpperCase()}
                </span>
              </div>
            </div>

            {/* Reason input */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  display: "block",
                  marginBottom: 8,
                }}
              >
                Reason <span style={{ color: 'var(--text-danger)' }}>*</span>
              </label>
              <textarea
                value={walletReason}
                onChange={(e) => setWalletReason(e.target.value)}
                placeholder={
                  walletAction.type === "suspend"
                    ? "e.g. Employee reported lost phone, suspicious activity..."
                    : "e.g. Employee resigned, termination, compliance requirement..."
                }
                rows={3}
                style={{
                  width: "100%",
                  background: 'var(--bg-app)',
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: 'var(--text-body)',
                  fontSize: 13,
                  padding: "10px 12px",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Warning for close */}
            {walletAction.type === "close" && (
              <div
                style={{
                  background: "color-mix(in srgb, var(--danger) 6%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--danger) 15%, transparent)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                  fontSize: 12,
                  color: 'var(--text-danger)',
                }}
              >
                Warning: This action is permanent and cannot be reversed. The
                employee's account will also be deactivated.
              </div>
            )}

            {/* Action buttons */}
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setWalletAction(null);
                  setWalletReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={walletActing || !walletReason.trim()}
                onClick={handleWalletAction}
                style={{
                  background:
                    walletAction.type === "suspend" ? 'var(--warning)' : 'var(--danger)',
                  color: walletAction.type === "suspend" ? 'var(--bg-app)' : '#fff',
                  opacity: walletActing || !walletReason.trim() ? 0.5 : 1,
                }}
              >
                {walletActing
                  ? "Processing..."
                  : walletAction.type === "suspend"
                    ? "Suspend Wallet"
                    : "Close Wallet Permanently"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Result Popup ────────────────────────────────────── */}
      {popup && (
        <Modal title="" onClose={() => setPopup(null)} width={420}>
          <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                margin: "0 auto 16px",
                background:
                  popup.type === "success" ? "color-mix(in srgb, var(--success) 8%, transparent)" : "color-mix(in srgb, var(--danger) 8%, transparent)",
                border: `2px solid ${popup.type === "success" ? "color-mix(in srgb, var(--success) 19%, transparent)" : "color-mix(in srgb, var(--danger) 19%, transparent)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              {popup.type === "success" ? "✓" : "✕"}
            </div>
            <div
              className="syne"
              style={{
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 8,
                color: popup.type === "success" ? 'var(--success)' : 'var(--danger)',
              }}
            >
              {popup.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              {popup.message}
            </div>
            {popup.type === "success" && popup.details && (
              <div
                style={{
                  background: 'var(--bg-input)',
                  borderRadius: 10,
                  padding: "14px 18px",
                  textAlign: "left",
                  marginBottom: 16,
                }}
              >
                {Object.entries(popup.details).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-dim)',
                        textTransform: "capitalize",
                      }}
                    >
                      {k.replace(/([A-Z])/g, " $1")}
                    </span>
                    <span
                      style={{ fontSize: 12, color: 'var(--text-body)', fontWeight: 500 }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Button
              variant={popup.type === "success" ? "success" : "danger"}
              onClick={() => setPopup(null)}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {popup.type === "success" ? "Done" : "Close"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

