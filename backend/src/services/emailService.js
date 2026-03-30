const nodemailer = require('nodemailer')

function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

/**
 * Send flight ticket confirmation email to employee after admin books a flight.
 * Silently returns (no throw) if SMTP is not configured.
 */
async function sendTicketEmail({ toEmail, toName, ticket, booking, fareType, selectedFlight, newBalance }) {
  const transporter = createTransporter()
  if (!transporter) return // SMTP not configured — skip silently

  const from     = process.env.SMTP_FROM || '"TravelDesk" <noreply@traveldesk.com>'
  const travelDate = ticket.travel_date ? new Date(ticket.travel_date).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' }) : '—'
  const amountFmt  = `₹${Number(ticket.amount).toLocaleString('en-IN')}`
  const balFmt     = `₹${Number(newBalance).toLocaleString('en-IN')}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#7C6FFF,#9B6BFF);padding:28px 32px">
          <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px">✈ Flight Ticket Confirmed</div>
          <div style="font-size:13px;color:rgba(255,255,255,.8);margin-top:6px">Booked by TravelDesk · Your ticket is ready</div>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:28px 32px 0">
          <div style="font-size:16px;color:#333">Hi <strong>${toName}</strong>,</div>
          <div style="font-size:14px;color:#666;margin-top:8px;line-height:1.6">
            Your flight has been booked successfully. Here are your ticket details:
          </div>
        </td></tr>

        <!-- Route banner -->
        <tr><td style="padding:20px 32px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7ff;border-radius:12px;padding:20px">
            <tr>
              <td align="center" style="width:40%">
                <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">FROM</div>
                <div style="font-size:18px;font-weight:800;color:#333">${ticket.from_location || '—'}</div>
              </td>
              <td align="center" style="width:20%">
                <div style="font-size:24px;color:#7C6FFF">✈</div>
              </td>
              <td align="center" style="width:40%">
                <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">TO</div>
                <div style="font-size:18px;font-weight:800;color:#333">${ticket.to_location || '—'}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Ticket details -->
        <tr><td style="padding:0 32px 20px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:12px;overflow:hidden">
            ${[
              ['Airline',    selectedFlight?.airline || ticket.vendor || '—'],
              ['Flight No.', selectedFlight?.flightNumber || '—'],
              ['Date',       travelDate],
              ['Departure',  selectedFlight?.departureTime || '—'],
              ['Arrival',    selectedFlight?.arrivalTime   || '—'],
              ['Duration',   selectedFlight?.duration      || '—'],
              ['Fare Type',  fareType || '—'],
              ['Passenger',  ticket.passenger_name || toName],
            ].map(([k, v], i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'}">
              <td style="padding:11px 16px;font-size:12px;color:#888;border-bottom:1px solid #f0f0f0">${k}</td>
              <td style="padding:11px 16px;font-size:13px;color:#333;font-weight:600;border-bottom:1px solid #f0f0f0;text-align:right">${v}</td>
            </tr>`).join('')}
          </table>
        </td></tr>

        <!-- PNR box -->
        <tr><td style="padding:0 32px 24px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0eeff;border-radius:12px;padding:20px;text-align:center">
            <tr><td>
              <div style="font-size:11px;color:#7C6FFF;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:8px">PNR / Booking Reference</div>
              <div style="font-size:30px;font-weight:900;letter-spacing:.15em;color:#5B4ECC">${ticket.pnr_number}</div>
              <div style="font-size:11px;color:#888;margin-top:6px">Ref: ${ticket.booking_ref || booking?.id?.slice(0, 8) || '—'}</div>
            </td></tr>
          </table>
        </td></tr>

        <!-- Amount row -->
        <tr><td style="padding:0 32px 24px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#fff3cd;border-radius:8px;padding:12px 16px;text-align:center;width:48%">
                <div style="font-size:11px;color:#856404;text-transform:uppercase;letter-spacing:.05em">Amount Charged</div>
                <div style="font-size:18px;font-weight:800;color:#856404;margin-top:4px">${amountFmt}</div>
              </td>
              <td width="4%"></td>
              <td style="background:#d1fae5;border-radius:8px;padding:12px 16px;text-align:center;width:48%">
                <div style="font-size:11px;color:#065f46;text-transform:uppercase;letter-spacing:.05em">Wallet Balance</div>
                <div style="font-size:18px;font-weight:800;color:#065f46;margin-top:4px">${balFmt}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f8fc;border-top:1px solid #eee;padding:20px 32px;text-align:center">
          <div style="font-size:12px;color:#aaa">
            You can view and print your ticket anytime from your <strong>TravelDesk Employee Portal → My Tickets</strong>.
          </div>
          <div style="font-size:11px;color:#ccc;margin-top:8px">
            Issued by TravelDesk · ${new Date().toLocaleString('en-IN')}
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: `✈ Your Flight is Confirmed — PNR: ${ticket.pnr_number}`,
    html,
  })
}

module.exports = { sendTicketEmail }
