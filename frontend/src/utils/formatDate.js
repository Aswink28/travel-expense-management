// Project-wide date formatting helpers — every user-facing date renders as
// dd-mm-yyyy and every timestamp as dd-mm-yyyy hh:mm. Backend payloads, ISO
// strings sent over the wire, and HTML <input type="date"> values continue
// to use yyyy-mm-dd; this module only handles DISPLAY.
//
// Inputs accepted: ISO string, Date instance, epoch ms number, or null/
// undefined (returns the empty string so JSX renders cleanly).

function toDate(v) {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function pad(n) { return String(n).padStart(2, '0') }

export function fmtDate(v) {
  const d = toDate(v)
  if (!d) return ''
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

export function fmtTime(v) {
  const d = toDate(v)
  if (!d) return ''
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtDateTime(v) {
  const d = toDate(v)
  if (!d) return ''
  return `${fmtDate(d)} ${fmtTime(d)}`
}
