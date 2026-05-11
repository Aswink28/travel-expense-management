// ── Shared approval-chain helpers ─────────────────────────────
// Used by both /api/requests/queue and /api/dashboard to ensure
// consistent "next pending step" resolution.

const NON_APPROVER_ROLES = new Set(['Employee', 'Booking Admin', 'Super Admin'])

// Look up tier ranks for a list of designations in one query.
async function fetchDesignationRanks(client, designations) {
  if (!designations.length) return {}
  const { rows } = await client.query(`
    SELECT dt.designation, t.rank
    FROM designation_tiers dt JOIN tiers t ON t.id = dt.tier_id
    WHERE dt.designation = ANY($1)
  `, [designations])
  const map = {}
  for (const r of rows) map[r.designation.toLowerCase()] = r.rank
  return map
}

// Sort designations so the lowest-authority approver (highest rank number) acts first.
async function computeApprovalSequence(client, approverEntries) {
  if (!Array.isArray(approverEntries) || !approverEntries.length) return []
  const uniq = [...new Set(approverEntries.filter(e => typeof e === 'string' && e.trim()))]
  if (!uniq.length) return []
  const ranks = await fetchDesignationRanks(client, uniq)
  return uniq.slice().sort(
    (a, b) => (ranks[b.toLowerCase()] ?? -1) - (ranks[a.toLowerCase()] ?? -1)
  )
}

// Returns the designation expected to act next on the request, or null when every step is done.
async function nextPendingStep(client, requestId, sequence) {
  if (!sequence.length) return null
  const { rows } = await client.query(
    `SELECT DISTINCT LOWER(approver_designation) AS d
     FROM approvals
     WHERE request_id=$1 AND action='approved' AND approver_designation IS NOT NULL`,
    [requestId]
  )
  const approved = new Set(rows.map(r => r.d))
  return sequence.find(d => !approved.has(d.toLowerCase())) || null
}

// Reads employee_approvers rows and resolves a primary→backup expected user per step.
// Returns null if the employee has no chain (caller should fall back to designation-based).
async function fetchUserApproverChain(client, employeeId) {
  const { rows } = await client.query(`
    SELECT ea.step_designation, ea.step_order,
           ea.primary_user_id,
           up.is_active AS primary_active,
           up.name      AS primary_name,
           ea.backup_user_id,
           ub.is_active AS backup_active,
           ub.name      AS backup_name
    FROM employee_approvers ea
    LEFT JOIN users up ON up.id = ea.primary_user_id
    LEFT JOIN users ub ON ub.id = ea.backup_user_id
    WHERE ea.user_id = $1
    ORDER BY ea.step_order ASC, ea.step_designation ASC
  `, [employeeId])
  if (!rows.length) return null
  return rows
}

function resolveStepUser(step) {
  if (step.primary_user_id && step.primary_active) return step.primary_user_id
  if (step.backup_user_id  && step.backup_active)  return step.backup_user_id
  return null
}

// Returns the next step that hasn't been approved yet, or null when the chain is done.
async function nextPendingUserStep(client, requestId, chain) {
  const { rows: approvals } = await client.query(
    `SELECT approver_id FROM approvals WHERE request_id=$1 AND action='approved'`,
    [requestId]
  )
  const approvedIds = new Set(approvals.map(a => a.approver_id))
  for (const step of chain) {
    const stepDone = (step.primary_user_id && approvedIds.has(step.primary_user_id))
                  || (step.backup_user_id  && approvedIds.has(step.backup_user_id))
    if (!stepDone) {
      return { ...step, expected_user_id: resolveStepUser(step) }
    }
  }
  return null
}

// Resolve the effective approver designation sequence for a given request.
async function approverSequenceForRequest(client, tr) {
  const { rows: userRows } = await client.query(
    'SELECT approver_roles FROM users WHERE id = $1',
    [tr.user_id]
  )
  const perUser = userRows[0]?.approver_roles
  if (Array.isArray(perUser) && perUser.length) return computeApprovalSequence(client, perUser)

  const { rows: tierRows } = await client.query(`
    SELECT t.approver_roles
    FROM users u
    LEFT JOIN tiers t ON t.id = u.tier_id
    WHERE u.id = $1
  `, [tr.user_id])
  const tierRoles = tierRows[0]?.approver_roles
  if (Array.isArray(tierRoles) && tierRoles.length) return computeApprovalSequence(client, tierRoles)

  const { rows: roleTier } = await client.query(`
    SELECT t.approver_roles
    FROM designation_tiers dt
    JOIN tiers t ON t.id = dt.tier_id
    WHERE LOWER(dt.designation) = LOWER($1::text)
    LIMIT 1
  `, [tr.user_role])
  if (Array.isArray(roleTier[0]?.approver_roles) && roleTier[0].approver_roles.length) {
    return computeApprovalSequence(client, roleTier[0].approver_roles)
  }

  const { rows: legacyRows } = await client.query(
    'SELECT approver_role_name FROM role_approvers WHERE role_name = $1',
    [tr.user_role]
  )
  return computeApprovalSequence(client, legacyRows.map(r => r.approver_role_name))
}

// Count how many requests are actionable by a given approver right now.
// Replicates the same candidate SQL + JS filtering as GET /api/requests/queue
// so the dashboard badge always matches the queue page.
async function countPendingForUser(client, { uid, role, designation }) {
  if (NON_APPROVER_ROLES.has(role)) return 0

  const callerDesignationLc = (designation || '').toLowerCase()
  const isFinance = role === 'Finance'

  const { rows: candidates } = await client.query(`
    SELECT tr.id, tr.user_id, tr.user_role, tr.status,
           tr.hierarchy_approved, tr.finance_approved
    FROM travel_requests tr
    WHERE tr.status IN ('pending','pending_finance')
      AND (
        (tr.status = 'pending' AND tr.hierarchy_approved = FALSE)
        OR ($2 = TRUE AND tr.status = 'pending_finance' AND tr.finance_approved = FALSE)
      )
      AND tr.user_id != $1
      AND NOT EXISTS(SELECT 1 FROM approvals a WHERE a.request_id=tr.id AND a.approver_id=$1)
    ORDER BY tr.submitted_at ASC
  `, [uid, isFinance])

  let count = 0
  for (const tr of candidates) {
    const userChain = await fetchUserApproverChain(client, tr.user_id)

    if (userChain) {
      const step = await nextPendingUserStep(client, tr.id, userChain)
      if (!step) {
        if (isFinance && !tr.finance_approved) count++
        continue
      }
      if (isFinance && step.step_designation.toLowerCase() !== 'finance' &&
          !userChain.some(s => s.step_designation.toLowerCase() === 'finance')) {
        if (tr.hierarchy_approved) count++
        continue
      }
      if (step.expected_user_id && step.expected_user_id === uid) count++
      continue
    }

    // Legacy designation-based routing
    const sequence = await approverSequenceForRequest(client, tr)
    const sequenceLc = sequence.map(s => s.toLowerCase())
    if (isFinance && !sequenceLc.includes('finance')) {
      if (tr.hierarchy_approved) count++
      continue
    }
    if (!callerDesignationLc) continue
    const stepDesg = await nextPendingStep(client, tr.id, sequence)
    if (stepDesg && stepDesg.toLowerCase() === callerDesignationLc) count++
  }
  return count
}

module.exports = {
  NON_APPROVER_ROLES,
  fetchDesignationRanks,
  computeApprovalSequence,
  nextPendingStep,
  fetchUserApproverChain,
  resolveStepUser,
  nextPendingUserStep,
  approverSequenceForRequest,
  countPendingForUser,
}
