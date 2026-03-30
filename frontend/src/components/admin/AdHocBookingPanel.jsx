import { useState, useEffect } from 'react'
import { requestsAPI, bookingsAPI } from '../../services/api'
import { Button, Input, Select, Spinner } from '../shared/UI'

export default function AdHocBookingPanel() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [selectedRequest, setSelectedRequest] = useState(null)
  
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  
  const [bookingLoading, setBookingLoading] = useState(false)
  const [successData, setSuccessData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    requestsAPI.list()
      .then(res => {
        // Filter requests to those that are approved but not yet completed
        const approved = (res.data || []).filter(r => r.status === 'approved' && r.booking_status !== 'completed' && r.booking_status !== 'booked')
        setRequests(approved)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selectedRequestId) {
      const req = requests.find(r => r.id === selectedRequestId)
      setSelectedRequest(req || null)
      setSuccessData(null)
      setError('')
      setSearchResults(null)
    } else {
      setSelectedRequest(null)
    }
  }, [selectedRequestId, requests])

  const handleSearch = async () => {
    if (!selectedRequest) return
    setSearching(true)
    setError('')
    setSearchResults(null)
    setSuccessData(null)
    try {
      const res = await bookingsAPI.searchTickets(
        selectedRequest.travel_mode, 
        selectedRequest.from_location, 
        selectedRequest.to_location, 
        selectedRequest.start_date
      )
      setSearchResults(res.data)
    } catch (e) {
      setError('Search failed: ' + e.message)
    } finally {
      setSearching(false)
    }
  }

  const handleBook = async (option) => {
    if (!selectedRequest) {
      setError("Select a request")
      return
    }
    setBookingLoading(true)
    setError('')
    setSuccessData(null)
    try {
      // Re-use executeBooking from bookingsAPI which correctly deducts wallet, updates DB status, etc.
      const res = await bookingsAPI.executeBooking({
        request_id: selectedRequest.id,
        execute_mode: 'api',
        category: 'travel',
        amount: option.price,
        vendor: option.provider,
        from_location: selectedRequest.from_location,
        to_location: selectedRequest.to_location,
        travel_date: selectedRequest.start_date,
        travel_mode: option.mode || selectedRequest.travel_mode
      })

      // Update local state to remove booked request
      setRequests(prev => prev.filter(r => r.id !== selectedRequest.id))
      setSelectedRequestId('')
      setSelectedRequest(null)
      setSearchResults(null)

      setSuccessData({
        booking: res.data.booking,
        ticket: {
          pnr_number: res.data.pnr,
          travel_mode: option.mode || selectedRequest.travel_mode,
          from_location: selectedRequest.from_location,
          to_location: selectedRequest.to_location,
          travel_date: selectedRequest.start_date
        },
        new_balance: res.data.new_balance
      })
    } catch (e) {
      setError(e.message || 'Booking failed')
    } finally {
      setBookingLoading(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>

  return (
    <div>
      <h2 style={{ fontSize: 22, color: '#F0F0F4', marginBottom: 20 }}>Request-Based Auto Booking</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 2fr)', gap: 20 }}>
        
        {/* Left Column: Request Selection */}
        <div style={{ background: '#111118', padding: 24, borderRadius: 12, border: '1px solid #1E1E2A' }}>
          <h3 style={{ fontSize: 16, color: '#E2E2E8', marginBottom: 16 }}>Select Approved Request</h3>
          <Select 
            value={selectedRequestId} 
            onChange={e => setSelectedRequestId(e.target.value)}
            style={{ width: '100%', marginBottom: 20 }}
          >
            <option value="">-- Choose Request --</option>
            {requests.map(r => (
              <option key={r.id} value={r.id}>
                {r.id} - {r.user_name} ({r.from_location} to {r.to_location})
              </option>
            ))}
          </Select>
        </div>

        {/* Right Column: Booking Details */}
        <div style={{ background: '#111118', padding: 24, borderRadius: 12, border: '1px solid #1E1E2A' }}>
          <h3 style={{ fontSize: 16, color: '#E2E2E8', marginBottom: 16 }}>Request Details</h3>
          
          {!selectedRequest && !successData ? (
            <div style={{ color: '#888', fontSize: 14 }}>Please select a request first.</div>
          ) : (
            selectedRequest && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Travel Type</label>
                    <Input readOnly value={selectedRequest.travel_mode || ''} style={{ width: '100%', background: '#1A1A22', color: '#ccc' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Travel Date</label>
                    <Input readOnly value={selectedRequest.start_date?.substring(0,10) || ''} style={{ width: '100%', background: '#1A1A22', color: '#ccc' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Source</label>
                    <Input readOnly value={selectedRequest.from_location || ''} style={{ width: '100%', background: '#1A1A22', color: '#ccc' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Destination</label>
                    <Input readOnly value={selectedRequest.to_location || ''} style={{ width: '100%', background: '#1A1A22', color: '#ccc' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Passenger Name</label>
                    <Input readOnly value={selectedRequest.user_name || ''} style={{ width: '100%', background: '#1A1A22', color: '#ccc' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Approved Amount (₹)</label>
                    <Input readOnly value={selectedRequest.approved_total || selectedRequest.estimated_total || 0} style={{ width: '100%', background: '#1A1A22', color: '#ccc' }} />
                  </div>
                </div>

                <Button type="button" onClick={handleSearch} disabled={searching} style={{ marginTop: 10, alignSelf:'flex-start', background: '#30D158', color: '#fff' }}>
                  {searching ? 'Searching...' : 'Search Tickets'}
                </Button>

                {searchResults && searchResults.length === 0 && (
                  <div style={{ color: '#888', fontSize: 13, marginTop: 10 }}>No tickets found.</div>
                )}

                {searchResults && searchResults.length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <h4 style={{ fontSize: 14, color: '#E2E2E8', margin: 0 }}>Available Options</h4>
                    {searchResults.map(opt => (
                      <div key={opt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1A1A22', padding: 14, borderRadius: 8, border: '1px solid #2A2A35' }}>
                        <div>
                          <div style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>{opt.provider}</div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Departs: {opt.departure} • {opt.duration}</div>
                          <div style={{ fontSize: 14, color: '#30D158', fontWeight: 600, marginTop: 4 }}>₹{opt.price.toLocaleString('en-IN')}</div>
                        </div>
                        <Button onClick={() => handleBook(opt)} disabled={bookingLoading} style={{ background: '#0A84FF', color: '#fff', padding: '8px 16px', fontSize: 12 }}>
                          {bookingLoading ? 'Booking...' : 'Book Ticket'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {error && <div style={{ color: '#FF453A', fontSize: 13, background: '#FF453A11', padding: '8px 12px', borderRadius: 6, marginTop: 10 }}>{error}</div>}
              </div>
            )
          )}

          {successData && (
            <div style={{ marginTop: 24, padding: 20, background: '#30D15816', border: '1px solid #30D15840', borderRadius: 8 }}>
              <div style={{ color: '#30D158', fontWeight: 600, fontSize: 15, marginBottom: 12 }}>🎉 Booking Confirmed!</div>
              <div style={{ fontSize: 13, color: '#E2E2E8', lineHeight: '1.6' }}>
                <div><strong>Booking ID:</strong> {successData.booking.id}</div>
                <div><strong>PNR Number:</strong> {successData.ticket.pnr_number}</div>
                <div><strong>Travel Details:</strong> {successData.ticket.travel_mode} | {successData.ticket.from_location} to {successData.ticket.to_location} on {successData.ticket.travel_date?.substring(0,10)}</div>
                <div><strong>Payment Status:</strong> Paid via Wallet (₹{successData.booking.amount})</div>
                <div style={{ marginTop: 10, color: '#40C8E0' }}>✉️ Ticket has been delivered via Email, SMS, and In-app notification to the user.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
