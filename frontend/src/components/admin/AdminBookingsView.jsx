import { useState, useEffect } from 'react'
import { adminBookingsAPI } from '../../services/api'
import { Spinner } from '../shared/UI'

export default function AdminBookingsView() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminBookingsAPI.bookings()
      .then(res => setBookings(res.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div>
      <h2 style={{ fontSize: 22, color: '#F0F0F4', marginBottom: 20 }}>Ad-Hoc Admin Bookings</h2>
      
      {error && <div style={{ color: '#FF453A', marginBottom: 20 }}>{error}</div>}

      {bookings.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>No ad-hoc bookings found.</div>
      ) : (
        <div style={{ background: '#111118', borderRadius: 12, border: '1px solid #1E1E2A', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#1A1A24', borderBottom: '1px solid #2A2A3A' }}>
                <th style={{ padding: '12px 16px', fontSize: 13, color: '#888', fontWeight: 500 }}>Date</th>
                <th style={{ padding: '12px 16px', fontSize: 13, color: '#888', fontWeight: 500 }}>User</th>
                <th style={{ padding: '12px 16px', fontSize: 13, color: '#888', fontWeight: 500 }}>Travel</th>
                <th style={{ padding: '12px 16px', fontSize: 13, color: '#888', fontWeight: 500 }}>Route</th>
                <th style={{ padding: '12px 16px', fontSize: 13, color: '#888', fontWeight: 500 }}>Amount</th>
                <th style={{ padding: '12px 16px', fontSize: 13, color: '#888', fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #1A1A24', transition: 'background .15s' }}>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#E2E2E8' }}>
                    {new Date(b.created_at).toLocaleDateString()}<br/>
                    <span style={{ fontSize: 11, color: '#666' }}>{new Date(b.created_at).toLocaleTimeString()}</span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#0A84FF' }}>
                    {b.booked_for_name}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#E2E2E8' }}>
                    {b.travel_mode}<br/>
                    <span style={{ fontSize: 11, color: '#888' }}>PNR: {b.pnr_number}</span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#E2E2E8' }}>
                    {b.from_location} → {b.to_location}<br/>
                    <span style={{ fontSize: 11, color: '#888' }}>on {b.travel_date?.substring(0,10)}</span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 13, color: '#30D158', fontWeight: 600 }}>
                    ₹{Number(b.amount).toLocaleString('en-IN')}
                    <div style={{ fontSize: 10, color: '#888', fontWeight: 400 }}>Paid via Wallet</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ background: '#30D15815', color: '#30D158', padding: '4px 8px', borderRadius: 4, fontSize: 11 }}>
                      {b.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
