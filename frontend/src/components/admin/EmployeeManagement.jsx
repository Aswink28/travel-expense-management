import { useState, useEffect } from "react";
import { employeesAPI, rolesAPI, tiersAPI } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
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

const PRODUCT_ID = "cbad7cad-5bef-4289-9150-15d613fcb89b";

// Authority ranks used to order the approval sequence (lowest authority first).
const ROLE_RANK = {
  "Super Admin": 1,
  "Booking Admin": 2,
  Manager: 3,
  Finance: 3,
  "Tech Lead": 4,
  "Software Engineer": 5,
};

// Default designation mirrors the role name. Override this map if a role ever
// needs to map to a differently-named designation in Tier Config.
const ROLE_DEFAULT_DESIGNATION = {};
function designationForRole(roleName) {
  return ROLE_DEFAULT_DESIGNATION[roleName] || roleName;
}

const INITIAL_FORM = {
  name: "",
  email: "",
  password: "",
  role: "Software Engineer",
  department: "",
  reporting_to: "",
  mobile_number: "",
  date_of_birth: "",
  gender: "",
  pan_number: "",
  aadhaar_number: "",
  approver_roles: [],
  approval_type: "ALL",
  designation: "",
  tier_id: null,
};

function MLabel({ text, required }) {
  return (
    <>
      {text}
      {required && <span style={{ color: "#FF453A", marginLeft: 2 }}>*</span>}
    </>
  );
}

export default function EmployeeManagement({ setTab }) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [tierPreview, setTierPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
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
  const accent = user.color || "#30D158";

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
      setForm((prev) => ({ ...prev, tier_id: null }));
      return;
    }
    try {
      const res = await tiersAPI.preview(designation);
      const t = res?.data;
      if (!t) {
        setForm((prev) => ({ ...prev, tier_id: null }));
        return;
      }
      setTierPreview(t);
      const approvers = Array.isArray(t.approver_roles) ? t.approver_roles : [];
      const mappedRole = t.designation_role || null;
      setForm((prev) => ({
        ...prev,
        tier_id: t.id,
        approver_roles: approvers.length ? approvers : prev.approver_roles,
        approval_type: t.approval_type || prev.approval_type,
        // If the designation declares a role, auto-apply it so Role + Tier stay aligned.
        role: mappedRole || prev.role,
      }));
      setFieldErrors((prev) => {
        const n = { ...prev };
        delete n.approver_roles;
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
    const defaults = defaultApproversForRole("Software Engineer");
    setForm({
      ...INITIAL_FORM,
      approver_roles: defaults,
      approval_type: "ALL",
    });
    setFieldErrors({});
    setTierPreview(null);
    setShowPw(false);
    setShowModal(true);
    // Auto-resolve tier for the default role so the modal opens with the tier
    // policy preview already visible.
    applyDesignation(designationForRole("Software Engineer"));
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
    setForm({
      name: emp.name || "",
      email: emp.email || "",
      password: "",
      role: emp.role || "Employee",
      department: emp.department || "",
      reporting_to: emp.reporting_to || "",
      mobile_number: emp.mobile_number || "",
      date_of_birth: toDateInput(emp.date_of_birth),
      gender: emp.gender || "",
      pan_number: emp.pan_number || "",
      aadhaar_number: emp.aadhaar_number || "",
      approver_roles: approverRoles,
      approval_type: emp.approval_type || "ALL",
      designation: emp.designation || "",
      tier_id: emp.tier_id || null,
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
    setEditId(emp.id);
    setFieldErrors({});
    setShowPw(false);
    populateForm(emp); // immediate fill from row data so the modal opens populated
    setShowModal(true);
    try {
      const fresh = await employeesAPI.get(emp.id);
      if (fresh?.data) populateForm(fresh.data);
    } catch (_) {
      /* fall back to row data — already populated */
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
    if (!v.role) e.role = "Role is required";
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
    if (!["ANY_ONE", "ALL"].includes(v.approval_type))
      e.approval_type = "Select an approval rule";

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
        productId: PRODUCT_ID,
        approver_roles: selected,
        approval_type: form.approval_type,
        designation: form.designation || null,
        tier_id: form.tier_id || null,
      };
      if (editId && !payload.password) delete payload.password;
      if (!payload.department) delete payload.department;
      if (!payload.reporting_to) delete payload.reporting_to;

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
        next.approval_type = "ALL";
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
      const next = list.includes(roleName)
        ? list.filter((x) => x !== roleName)
        : [...list, roleName];
      return { ...prev, approver_roles: next };
    });
    setFieldErrors((prev) => {
      const n = { ...prev };
      delete n.approver_roles;
      return n;
    });
  }

  function setApprovalType(type) {
    setForm((prev) => ({ ...prev, approval_type: type }));
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
    const managers = ["Ravi Kumar", "Deepa Krishnan", "Anil Menon"];
    const panLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const first = pick(firstNames);
    const last = pick(lastNames);
    const year = 1980 + Math.floor(Math.random() * 25);
    const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
    const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
    const demoRole = pick(ROLE_NAMES.length ? ROLE_NAMES : ["Employee"]);
    setForm({
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}.${uid}@company.in`,
      password: "pass123",
      role: demoRole,
      department: pick(depts),
      reporting_to: pick(managers),
      mobile_number: `9${rDigits(9)}`,
      date_of_birth: `${year}-${month}-${day}`,
      gender: pick(["Male", "Female"]),
      pan_number:
        Array.from({ length: 5 }, () => pick([...panLetters])).join("") +
        rDigits(4) +
        pick([...panLetters]),
      aadhaar_number: rDigits(12),
      approver_roles: defaultApproversForRole(demoRole),
      approval_type: "ALL",
    });
    setFieldErrors({});
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
      <PageTitle
        title="Employee Management"
        sub="Create and manage employee accounts"
      />
      {error && (
        <Alert type="error" style={{ marginBottom: 16 }}>
          {error}
        </Alert>
      )}

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
            background: "#1A1A22",
            border: "1px solid #2A2A35",
            borderRadius: 8,
            color: "#E2E2E8",
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
            background: "#1A1A22",
            border: "1px solid #2A2A35",
            borderRadius: 8,
            color: "#E2E2E8",
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
          variant="purple"
          onClick={() => setTab?.("bulk-employees")}
          style={{ whiteSpace: "nowrap" }}
        >
          Bulk Upload
        </Button>
        <Button onClick={openCreate} style={{ whiteSpace: "nowrap" }}>
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
            "#30D158",
          ],
          [
            "Suspended",
            employees.filter(
              (e) => (e.ppi_wallet_status || "").toUpperCase() === "SUSPENDED",
            ).length,
            "#FFD60A",
          ],
          ["Roles", new Set(employees.map((e) => e.role)).size, "#BF5AF2"],
        ].map(([label, val, color]) => (
          <Card key={label} style={{ padding: "14px 18px" }}>
            <div
              style={{
                fontSize: 10,
                color: "#555",
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
              <tr style={{ borderBottom: "1px solid #1E1E2A" }}>
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
                      color: "#555",
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
                    style={{ padding: 40, textAlign: "center", color: "#444" }}
                  >
                    No employees found
                  </td>
                </tr>
              ) : (
                paged.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{ borderBottom: "1px solid #16161E" }}
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
                              (ROLE_COLORS[emp.role] || "#0A84FF") + "22",
                            border: `1.5px solid ${ROLE_COLORS[emp.role] || "#0A84FF"}44`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: ROLE_COLORS[emp.role] || "#0A84FF",
                            flexShrink: 0,
                          }}
                        >
                          {emp.avatar || emp.name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: "#E2E2E8", fontWeight: 500 }}>
                            {emp.name}
                          </div>
                          <div style={{ fontSize: 10, color: "#555" }}>
                            {emp.emp_id} · {emp.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", color: "#888" }}>
                      {emp.mobile_number || "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontWeight: 500,
                          background: (ROLE_COLORS[emp.role] || "#888") + "14",
                          color: ROLE_COLORS[emp.role] || "#888",
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
                              ? "#30D158"
                              : ws === "SUSPENDED"
                                ? "#FFD60A"
                                : "#FF453A";
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "3px 10px",
                                borderRadius: 20,
                                fontWeight: 500,
                                background: wsColor + "14",
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
                        <span style={{ color: "#444", fontSize: 11 }}>
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
                          background: emp.is_active ? "#30D15814" : "#FF453A14",
                          color: emp.is_active ? "#30D158" : "#FF453A",
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
                            background: emp.is_active ? "#30D158" : "#FF453A",
                          }}
                        />
                        {emp.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "#888" }}>
                      ₹{Number(emp.wallet_balance || 0).toLocaleString("en-IN")}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        color: "#555",
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
                                background: "#FFD60A18",
                                color: "#FFD60A",
                                border: "1px solid #FFD60A30",
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
                                background: "#FF453A18",
                                color: "#FF453A",
                                border: "1px solid #FF453A30",
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
              borderTop: "1px solid #1E1E2A",
            }}
          >
            <div style={{ fontSize: 12, color: "#555" }}>
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
                  border: "1px solid #2A2A35",
                  borderRadius: 6,
                  color: safePage <= 1 ? "#555" : "#999",
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
                      style={{ color: "#444", fontSize: 12, padding: "0 4px" }}
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
                        border: p === safePage ? "none" : "1px solid #2A2A35",
                        color: p === safePage ? "#fff" : "#888",
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
                  border: "1px solid #2A2A35",
                  borderRadius: 6,
                  color: safePage >= totalPages ? "#555" : "#999",
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

      {/* ── Create / Edit Modal ─────────────────────────────── */}
      {showModal && (
        <Modal
          title={editId ? "Edit Employee" : "Create New Employee"}
          onClose={() => setShowModal(false)}
          width={560}
        >
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
                  background: "#0A84FF10",
                  border: "1px solid #0A84FF30",
                  color: "#0A84FF",
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
                    color: "#555",
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

            {/* Row 5: Role, Dept, Reporting */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0 12px",
              }}
            >
              <Select
                label={<MLabel text="Designation" required />}
                value={form.role}
                onChange={(e) => f("role", e.target.value)}
                error={fieldErrors.role}
              >
                {ROLE_NAMES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Input
                label="Department"
                value={form.department}
                onChange={(e) => f("department", e.target.value)}
                placeholder="e.g. Engineering"
              />
              <Input
                label="Reporting To"
                value={form.reporting_to}
                onChange={(e) => f("reporting_to", e.target.value)}
                placeholder="e.g. Manager name"
              />
            </div>

            {/* Designation → auto-assigns tier */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 12px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginBottom: 6,
                    display: "block",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Designation
                </label>
                <input
                  list="emp-designation-options"
                  value={form.designation}
                  onChange={(e) => applyDesignation(e.target.value)}
                  placeholder="e.g. Software Engineer"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    outline: "none",
                    fontSize: 13,
                    color: "var(--text-primary)",
                  }}
                />
                <datalist id="emp-designation-options">
                  {designations.map((d) => (
                    <option key={d.id} value={d.designation}>
                      {d.tier_name}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginBottom: 6,
                    display: "block",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Tier <span style={{ opacity: 0.7, fontWeight: 500 }}>· auto-assigned</span>
                </label>
                <select
                  value={form.tier_id || ""}
                  disabled
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    outline: "none",
                    fontSize: 13,
                    color: "var(--text-muted)",
                    cursor: "not-allowed",
                    opacity: 0.75,
                  }}
                >
                  <option value="">Auto (from role / designation)</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · rank {t.rank}
                    </option>
                  ))}
                </select>
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
                          color: "#FF9F0A",
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
                            color: "#FF453A",
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
                          const color = r?.color || "#888";
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
                                  ? color + "22"
                                  : "var(--bg-input)",
                                border: `1px solid ${isSelected ? color + "80" : "var(--border)"}`,
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
                                  background: color + "30",
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
                            color: "#FF453A",
                            marginBottom: 10,
                          }}
                        >
                          {fieldErrors.approver_roles}
                        </div>
                      )}

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
                            Execution Order
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
        </Modal>
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
                    walletAction.type === "suspend" ? "#FFD60A14" : "#FF453A14",
                  border: `2px solid ${walletAction.type === "suspend" ? "#FFD60A30" : "#FF453A30"}`,
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
                    walletAction.type === "suspend" ? "#FFD60A" : "#FF453A",
                }}
              >
                {walletAction.type === "suspend"
                  ? "Suspend Wallet"
                  : "Close Wallet Permanently"}
              </div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>
                {walletAction.type === "suspend"
                  ? `This will temporarily freeze ${walletAction.emp.name}'s wallet. No transactions will be allowed until reactivated.`
                  : `This will permanently close ${walletAction.emp.name}'s wallet and deactivate their account. This action cannot be undone.`}
              </div>
            </div>

            {/* Employee info */}
            <div
              style={{
                background: "#1A1A22",
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
                <span style={{ fontSize: 11, color: "#555" }}>Employee</span>
                <span style={{ fontSize: 12, color: "#ccc", fontWeight: 500 }}>
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
                <span style={{ fontSize: 11, color: "#555" }}>Employee ID</span>
                <span style={{ fontSize: 12, color: "#ccc" }}>
                  {walletAction.emp.emp_id}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "#555" }}>
                  Current Wallet Status
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color:
                      (walletAction.emp.ppi_wallet_status || "ACTIVE") ===
                      "ACTIVE"
                        ? "#30D158"
                        : "#FFD60A",
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
                  color: "#555",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  display: "block",
                  marginBottom: 8,
                }}
              >
                Reason <span style={{ color: "#FF453A" }}>*</span>
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
                  background: "#0B0B14",
                  border: "1px solid #252530",
                  borderRadius: 8,
                  color: "#E2E2E8",
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
                  background: "#FF453A10",
                  border: "1px solid #FF453A25",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                  fontSize: 12,
                  color: "#FF453A",
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
                    walletAction.type === "suspend" ? "#FFD60A" : "#FF453A",
                  color: walletAction.type === "suspend" ? "#0B0B14" : "#fff",
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
                  popup.type === "success" ? "#30D15814" : "#FF453A14",
                border: `2px solid ${popup.type === "success" ? "#30D15830" : "#FF453A30"}`,
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
                color: popup.type === "success" ? "#30D158" : "#FF453A",
              }}
            >
              {popup.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#999",
                marginBottom: 16,
                lineHeight: 1.5,
              }}
            >
              {popup.message}
            </div>
            {popup.type === "success" && popup.details && (
              <div
                style={{
                  background: "#1A1A22",
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
                      borderBottom: "1px solid #1E1E2A",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#555",
                        textTransform: "capitalize",
                      }}
                    >
                      {k.replace(/([A-Z])/g, " $1")}
                    </span>
                    <span
                      style={{ fontSize: 12, color: "#ccc", fontWeight: 500 }}
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

