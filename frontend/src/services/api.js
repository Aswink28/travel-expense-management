const BASE = import.meta.env.VITE_API_URL || '/api'

function getToken() { return localStorage.getItem('td3_token') }
export function setToken(t) { localStorage.setItem('td3_token', t) }
export function removeToken() { localStorage.removeItem('td3_token') }

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}), ...options.headers },
  })
  const data = await res.json()
  if (res.status === 401 && token) { removeToken(); window.location.href = '/'; return }
  if (res.status === 401) { const e = new Error(data.message || 'Invalid credentials'); e.status = 401; throw e }
  if (!res.ok) { const e = new Error(data.message || 'Request failed'); e.status = res.status; throw e }
  return data
}

// Multipart upload helper
async function uploadFile(path, formData) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization:`Bearer ${token}` } : {},
    body: formData,
  })
  const data = await res.json()
  if (!res.ok) { const e = new Error(data.message || 'Upload failed'); e.status = res.status; throw e }
  return data
}

const api = {
  get:    p      => request(p, { method:'GET' }),
  post:   (p,b)  => request(p, { method:'POST',  body:JSON.stringify(b) }),
  put:    (p,b)  => request(p, { method:'PUT',   body:JSON.stringify(b) }),
  patch:  (p,b)  => request(p, { method:'PATCH', body:JSON.stringify(b) }),
  delete: p      => request(p, { method:'DELETE' }),
}

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me:    ()                => api.get('/auth/me'),
}

export const requestsAPI = {
  list:          (status)   => api.get(`/requests${status ? `?status=${status}` : ''}`),
  queue:         ()         => api.get('/requests/queue'),
  get:           id         => api.get(`/requests/${id}`),
  create:        body       => api.post('/requests', body),
  action:        (id, body) => api.post(`/requests/${id}/action`, body),
  distanceCheck: (from, to) => api.get(`/requests/distance-check?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
}

export const walletAPI = {
  balance:      ()         => api.get('/wallet/balance'),
  ppiBalance:   ()         => api.get('/wallet/ppi-balance'),
  balanceFor:   userId     => api.get(`/wallet/balance/${userId}`),
  transactions: ()         => api.get('/wallet/transactions'),
  txnsFor:      userId     => api.get(`/wallet/transactions/${userId}`),
  debit:        body       => api.post('/wallet/debit', body),
  loadStatus:       requestId  => api.get(`/wallet/load-status/${requestId}`),
  retryLoad:        requestId  => api.post(`/wallet/retry-load/${requestId}`, {}),
  ppiTransactions:  ()         => api.get('/wallet/ppi-transactions'),
  ppiTxnsFor:       userId     => api.get(`/wallet/ppi-transactions/${userId}`),
}

export const flightsAPI = {
  search:           body => api.post('/flights/search', body),
  bookTicket:       body => api.post('/flights/book-ticket', body),
  // Air API lifecycle
  sectors:          ()   => api.post('/flights/air/sectors', {}),
  airSearch:        body => api.post('/flights/air/search', body),
  fareRule:         body => api.post('/flights/air/fare-rule', body),
  lowFare:          body => api.post('/flights/air/low-fare', body),
  reprice:          body => api.post('/flights/air/reprice', body),
  getSSR:           body => api.post('/flights/air/ssr', body),
  getSeatMap:       body => api.post('/flights/air/seat-map', body),
  tempBooking:      body => api.post('/flights/air/temp-booking', body),
  ticketing:        body => api.post('/flights/air/ticket', body),
  reprint:          body => api.post('/flights/air/reprint', body),
  history:          body => api.post('/flights/air/history', body),
  cancel:           body => api.post('/flights/air/cancel', body),
  releasePnr:       body => api.post('/flights/air/release-pnr', body),
  getPostSSR:       body => api.post('/flights/air/post-ssr', body),
  initiatePostSSR:  body => api.post('/flights/air/post-ssr/initiate', body),
  confirmPostSSR:   body => api.post('/flights/air/post-ssr/confirm', body),
  getBalance:       ()    => api.get('/flights/air/balance'),
  addPayment:       body => api.post('/flights/air/payment', body),
  bookFull:         body => api.post('/flights/air/book', body),
}

export const heldFlightsAPI = {
  list:     ()        => api.get('/held-flights'),
  create:   body      => api.post('/held-flights', body),
  update:   (refNo, body) => api.patch(`/held-flights/${refNo}`, body),
  delete:   refNo     => api.delete(`/held-flights/${refNo}`),
  clearAll: ()        => api.delete('/held-flights'),
}

export const bookingsAPI = {
  pending:         ()            => api.get('/bookings/pending'),
  detail:          requestId     => api.get(`/bookings/request/${requestId}`),
  book:            body          => api.post('/bookings/book', body),
  searchTickets:   (mode, src, dst, date) => api.get(`/bookings/search-tickets?travel_mode=${mode}&source=${src}&destination=${dst}&travel_date=${date}`),
  executeBooking:  body          => api.post('/bookings/execute-booking', body),
  history:         ()            => api.get('/bookings/history'),
  uploadTicket:    (bookingId, formData) => uploadFile(`/bookings/${bookingId}/upload`, formData),
  uploadToRequest: (formData)    => uploadFile('/bookings/upload-to-request', formData),
}

export const docsAPI = {
  list:     requestId => api.get(`/documents/request/${requestId}`),
  download: id        => `${BASE}/documents/${id}/download`,
}

export const dashboardAPI = {
  summary:  () => api.get('/dashboard'),
  tier:     () => api.get('/dashboard/tier'),
  allTiers: () => api.get('/dashboard/tiers'),
}

export const selfBookingAPI = {
  myApproved:      ()           => api.get('/self-booking/my-approved'),
  requestDetail:   requestId    => api.get(`/self-booking/request/${requestId}`),
  bookTransport:   body         => api.post('/self-booking/book-transport', body),
  bookHotel:       body         => api.post('/self-booking/book-hotel', body),
  myTickets:       ()           => api.get('/self-booking/tickets'),
  ticket:          ticketId     => api.get(`/self-booking/ticket/${ticketId}`),
  cancelBooking:   bookingId    => api.delete(`/self-booking/booking/${bookingId}/cancel`),
}

export const hotelsAPI = {
  search:    body => api.post('/hotels/search', body),
  bookHotel: body => api.post('/hotels/book-hotel', body),
}

export const rolesAPI = {
  list:       ()           => api.get('/roles'),
  pages:      ()           => api.get('/roles/pages'),
  create:     body         => api.post('/roles', body),
  update:     (id, body)   => api.put(`/roles/${id}`, body),
  remove:     id           => api.delete(`/roles/${id}`),
}

export const bulkEmployeesAPI = {
  upload:       formData   => uploadFile('/employees/bulk/upload', formData),
  listJobs:     ()         => api.get('/employees/bulk/jobs'),
  jobDetail:    (id, params={}) => api.get(`/employees/bulk/jobs/${id}?${new URLSearchParams(params)}`),
  exportErrors: id         => `${BASE}/employees/bulk/jobs/${id}/export-errors`,
  retryFailed:  id         => api.post(`/employees/bulk/jobs/${id}/retry-failed`),
  deleteJob:    id         => api.delete(`/employees/bulk/jobs/${id}`),
  template:     ()         => `${BASE}/employees/bulk/template`,
}

export const tiersAPI = {
  list:              ()                  => api.get('/tiers'),
  create:            body                => api.post('/tiers', body),
  update:            (id, body)          => api.put(`/tiers/${id}`, body),
  remove:            id                  => api.delete(`/tiers/${id}`),
  saveDesignation:   body                => api.post('/tiers/designations', body),
  updateDesignation: (id, body)          => api.put(`/tiers/designations/${id}`, body),
  deleteDesignation: designation         => api.delete(`/tiers/designations/${encodeURIComponent(designation)}`),
  preview:           designation         => api.get(`/tiers/preview/${encodeURIComponent(designation)}`),
}

export const employeesAPI = {
  list:           ()           => api.get('/employees'),
  get:            id           => api.get(`/employees/${id}`),
  create:         body         => api.post('/employees', body),
  update:         (id, body)   => api.put(`/employees/${id}`, body),
  auditLog:       ()           => api.get('/employees/audit-log'),
  toggleStatus:   (id, active) => request(`/employees/${id}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: active }) }),
  suspendWallet:  (id, reason) => api.post(`/employees/${id}/suspend-wallet`, { reason }),
  closeWallet:    (id, reason) => api.post(`/employees/${id}/close-wallet`, { reason }),
}

export const adminBookingsAPI = {
  users:           ()           => api.get('/admin/users'),
  userWallet:      userId       => api.get(`/admin/user/wallet/${userId}`),
  deductWallet:    body         => api.post('/admin/wallet/deduct', body),
  bookTicket:      body         => api.post('/admin/book-ticket', body),
  bookings:        ()           => api.get('/admin/bookings'),
  bookingDetail:   id           => api.get(`/admin/booking/${id}`),
}
