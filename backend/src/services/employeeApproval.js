// Shared helpers for the Create Employee + Bulk Upload flows.
// Keeping these in one place ensures the rules stay in sync between single
// and bulk creates.

// ── Normalise + validate the approval config a caller sent in ─
// Only ANY_ONE and ALL are supported. required_approval_count is derived.
function normaliseApprovalConfig({ approver_roles, approval_type }) {
  if (approver_roles === undefined && approval_type === undefined) {
    return { provided: false }
  }
  const list = Array.isArray(approver_roles) ? approver_roles.filter(Boolean) : []
  const type = approval_type || 'ALL'
  if (!['ANY_ONE', 'ALL'].includes(type)) {
    return { error: 'approval_type must be ANY_ONE or ALL' }
  }
  if (list.length === 0) {
    return { error: 'At least one approver role must be selected' }
  }
  const count = type === 'ANY_ONE' ? 1 : list.length
  return { provided: true, approver_roles: list, approval_type: type, required_approval_count: count }
}

// ── Resolve the tier mapped to a designation (case-insensitive) ─
async function resolveTierForDesignation(client, designation) {
  if (!designation) return null
  const { rows } = await client.query(
    `SELECT t.*
       FROM designation_tiers dt
       JOIN tiers t ON t.id = dt.tier_id
      WHERE LOWER(dt.designation) = LOWER($1)
      LIMIT 1`,
    [designation]
  )
  return rows[0] || null
}

// ── Build an approval config from a tier row, if it has approvers configured ─
function deriveApprovalFromTier(tierRow) {
  if (!tierRow) return null
  const roles = Array.isArray(tierRow.approver_roles) ? tierRow.approver_roles.filter(Boolean) : []
  if (!roles.length) return null
  const type = tierRow.approval_type === 'ANY_ONE' ? 'ANY_ONE' : 'ALL'
  return {
    provided: true,
    approver_roles: roles,
    approval_type: type,
    required_approval_count: type === 'ANY_ONE' ? 1 : roles.length,
  }
}

module.exports = { normaliseApprovalConfig, resolveTierForDesignation, deriveApprovalFromTier }
