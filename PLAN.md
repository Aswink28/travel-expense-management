# Plan: Create Request On Behalf Of Employee

## Overview
Admin users (Super Admin, Booking Admin) can create travel requests on behalf of employees. The request is **owned** by the employee (uses their tier, approval chain, wallet), with an audit trail recording which admin created it.

---

## 1. Database Migration (`backend/sql/admin_on_behalf_migration.sql`)

### 1a. Add `created_by` column to `travel_requests`
```sql
ALTER TABLE travel_requests ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE travel_requests ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(150);
```
- `NULL` = self-created (backwards compatible with all existing requests)
- Non-null = admin who created on behalf

### 1b. Add `admin-create-request` page to `role_pages`
Insert rows for Super Admin and Booking Admin roles so the sidebar item appears and the permission gate works:
```sql
INSERT INTO role_pages (role_name, page_id, label, icon, sort_order, can_view, can_create, can_edit, can_delete)
VALUES
  ('Super Admin',   'admin-create-request', 'Create On Behalf', '📝', 25, true, true, true, true),
  ('Booking Admin', 'admin-create-request', 'Create On Behalf', '📝', 25, true, true, false, false)
ON CONFLICT DO NOTHING;
```

---

## 2. Backend Changes

### 2a. New endpoint: `GET /api/employees/lookup?emp_id=EMP001` (`backend/src/routes/employees.js`)
- Searches by `emp_id` (the human-readable employee ID, not UUID)
- Returns: employee details, tier info, tier_policy, approver_chain, wallet balance
- Gated by `requirePermission('admin-create-request', 'view')`
- This endpoint is used by the admin form for the employee search/autocomplete

### 2b. Modify `POST /api/requests` (`backend/src/routes/requests.js`)
- Accept optional `on_behalf_of` field (employee UUID) in request body
- When `on_behalf_of` is present:
  - Verify the caller has `admin-create-request` / `create` permission
  - Fetch the target employee from DB (validate exists, is_active)
  - Use the **employee's** `id`, `name`, `role`, `department`, `tier_id` for all request fields (`user_id`, `user_name`, `user_role`, `department`)
  - Set `created_by = req.user.id` and `created_by_name = req.user.name`
  - Tier eligibility checks run against the **employee's** tier, not the admin's
  - Approval chain is the **employee's** chain (no change needed — the approval engine already resolves by `user_id` on the request)
- When `on_behalf_of` is absent: existing flow unchanged (self-created request)

### 2c. Update request detail queries
- Include `created_by` and `created_by_name` in SELECT statements so the UI can show "Created by Admin X on behalf of Employee Y"
- Affects: GET `/api/requests/:id`, GET `/api/requests`, GET `/api/requests/queue`

---

## 3. Frontend Changes

### 3a. New component: `frontend/src/components/admin/AdminCreateRequest.jsx`
**Step 1 — Employee Lookup:**
- Input field for Employee ID (emp_id) with search button
- On search: call `GET /api/employees/lookup?emp_id=...`
- Show loading spinner during fetch
- On success: display employee card with read-only details (name, department, designation, tier, wallet balance, approval chain)
- On error: show "Employee not found" message

**Step 2 — Request Form:**
- Reuse the same form structure as `NewRequestForm.jsx` but:
  - Employee details (name, dept, contact) are **read-only** and pre-filled from the fetched employee
  - Tier policy is loaded from the employee's tier (not the admin's)
  - Approver chain display shows the employee's chain
  - Contact fields default to the employee's profile (name, mobile, email)
- Submit calls `requestsAPI.create({ ...formData, on_behalf_of: employee.id })`

**Component structure:**
- Phase 1: Employee search bar + employee info card
- Phase 2: Full request form (appears after employee is selected)
- "Change Employee" button to go back to Step 1

### 3b. Register in `App.jsx`
- Import `AdminCreateRequest`
- Add to `pages` map: `'admin-create-request': <AdminCreateRequest />`
- Add to `ADMIN_GATED_PAGES` set

### 3c. Add sidebar icon in `Sidebar.jsx`
- Add `'admin-create-request'` entry to `NAV_ICONS` with a user+plus or clipboard+user SVG icon

### 3d. Add API helper in `api.js`
- Add `employeesAPI.lookup: emp_id => api.get(`/employees/lookup?emp_id=${encodeURIComponent(emp_id)}`)`

---

## 4. Files to Create/Modify

| File | Action |
|------|--------|
| `backend/sql/admin_on_behalf_migration.sql` | **Create** — migration script |
| `backend/src/routes/employees.js` | **Edit** — add `GET /lookup` endpoint |
| `backend/src/routes/requests.js` | **Edit** — handle `on_behalf_of` in POST |
| `backend/src/routes/requests.js` | **Edit** — add `created_by` to SELECT queries |
| `frontend/src/components/admin/AdminCreateRequest.jsx` | **Create** — new admin page |
| `frontend/src/App.jsx` | **Edit** — register page + gate |
| `frontend/src/components/shared/Sidebar.jsx` | **Edit** — add icon |
| `frontend/src/services/api.js` | **Edit** — add lookup API |

---

## 5. Implementation Order

1. Database migration (create & run)
2. Backend: employee lookup endpoint
3. Backend: modify POST /requests for on_behalf_of
4. Backend: update SELECT queries with created_by
5. Frontend: API helper
6. Frontend: AdminCreateRequest component
7. Frontend: App.jsx + Sidebar.jsx registration
8. Build backend dist
9. End-to-end test

---

## 6. What This Plan Does NOT Do
- Does NOT create a separate request creation endpoint (reuses existing POST /requests)
- Does NOT modify the approval engine (approvals already work by `user_id` on the request)
- Does NOT break existing employee self-service flow
- Does NOT add email/notification (can be added later)
- Does NOT add bulk on-behalf creation
