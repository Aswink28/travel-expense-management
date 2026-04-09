const express = require("express");
const pool = require("../config/db");
const { authenticate, authorise } = require("../middleware");
const flightService = require("../services/FlightService");
const { sendTicketEmail } = require("../services/emailService");

const router = express.Router();

// Apply authentication + role guard to ALL routes in this router
// (same pattern as adminBookings.js which works correctly)
router.use(authenticate);
router.use(authorise("Booking Admin", "Super Admin"));

// ── POST /api/flights/search ──────────────────────────────────
router.post("/search", async (req, res, next) => {
  try {
    const { source, destination, date, passengers, travelClass } = req.body;
    if (!source || !destination || !date) {
      return res.status(400).json({
        success: false,
        message: "source, destination, and date are required.",
      });
    }
    const flights = await flightService.searchFlights(
      source,
      destination,
      date,
      passengers,
      travelClass,
    );
    res.json({ success: true, data: flights });
  } catch (e) {
    next(e);
  }
});

// ── POST /api/flights/book-ticket ─────────────────────────────
router.post("/book-ticket", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { requestId, selectedFlight, fareType, price } = req.body;
    const adminId = req.user.id;

    if (!requestId || !selectedFlight || !fareType || !price) {
      return res
        .status(400)
        .json({ success: false, message: "Missing booking details" });
    }

    // 1. Validate request exists and is in a bookable state
    const { rows: requests } = await client.query(
      "SELECT * FROM travel_requests WHERE id = $1 FOR UPDATE",
      [requestId],
    );
    if (!requests.length)
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });

    const tr = requests[0];
    // Accept 'approved' or 'booking_in_progress' (retry after a previous failed attempt)
    if (!["approved", "booking_in_progress"].includes(tr.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot book. Request is in status: ${tr.status}`,
      });
    }

    // 2. Check wallet balance — revert status so admin can retry if insufficient
    const { rows: wallet } = await client.query(
      `SELECT w.id, w.balance, u.name AS user_name, u.email AS user_email
       FROM wallets w JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1 FOR UPDATE`,
      [tr.user_id],
    );
    if (!wallet.length) throw new Error("User wallet not found");

    const currentBalance = Number(wallet[0].balance);
    const bookingAmount = Number(price);
    if (currentBalance < bookingAmount) {
      // Revert to approved so admin can try a cheaper fare
      await client.query(
        "UPDATE travel_requests SET status = 'approved' WHERE id = $1",
        [requestId],
      );
      await client.query("COMMIT");
      return res.status(402).json({
        success: false,
        message: `Insufficient wallet balance`,
        data: {
          currentBalance,
          required: bookingAmount,
          shortfall: bookingAmount - currentBalance,
          employeeName: wallet[0].user_name || tr.user_name,
        },
      });
    }

    // 3. Generate PNR
    const pnr_number =
      "PNR-" + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 4. Deduct wallet — insert transaction only; the DB trigger handles balance update
    const newBal = currentBalance - bookingAmount;

    const { rows: txnRow } = await client.query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, request_id, txn_type, category, amount, description, performed_by, balance_after)
       VALUES ($1, $2, $3, 'debit', 'travel', $4, $5, $6, $7) RETURNING *`,
      [
        wallet[0].id,
        tr.user_id,
        requestId,
        price,
        `Flight booking (${fareType}) - ${selectedFlight.airline}`,
        adminId,
        newBal,
      ],
    );

    // 5. Create Booking & Ticket
    const { rows: booking } = await client.query(
      `INSERT INTO bookings (request_id, wallet_id, booked_by_id, booked_for_id, booking_type, category, travel_mode, from_location, to_location, travel_date, amount, pnr_number, vendor, txn_id)
       VALUES ($1, $2, $3, $4, 'company', 'travel', 'Flight', $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        requestId,
        wallet[0].id,
        adminId,
        tr.user_id,
        tr.from_location,
        tr.to_location,
        tr.start_date,
        price,
        pnr_number,
        selectedFlight.airline,
        txnRow[0].id,
      ],
    );

    const { rows: ticket } = await client.query(
      `INSERT INTO tickets (booking_id, user_id, request_id, pnr_number, booking_ref, ticket_type, travel_mode, passenger_name, from_location, to_location, travel_date, travel_time, seat_class, amount, vendor, ticket_data)
       VALUES ($1, $2, $3, $4, $5, 'transport', 'Flight', $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        booking[0].id,
        tr.user_id,
        requestId,
        pnr_number,
        booking[0].id,
        tr.user_name,
        tr.from_location,
        tr.to_location,
        tr.start_date,
        selectedFlight.departureTime || null,
        fareType || null,
        price,
        selectedFlight.airline,
        JSON.stringify({
          flightId: selectedFlight.flightId,
          flightNumber: selectedFlight.flightNumber,
          departureTime: selectedFlight.departureTime,
          arrivalTime: selectedFlight.arrivalTime,
          duration: selectedFlight.duration,
          fareType,
        }),
      ],
    );

    // 6. Mark booking as completed (status stays 'approved'; only booking_status uses 'completed')
    await client.query(
      "UPDATE travel_requests SET booking_status = 'completed' WHERE id = $1",
      [requestId],
    );

    await client.query("COMMIT");

    // Send ticket confirmation email to employee (non-blocking — don't fail booking if email fails)
    sendTicketEmail({
      toEmail: wallet[0].user_email,
      toName: wallet[0].user_name || tr.user_name,
      ticket: ticket[0],
      booking: booking[0],
      fareType,
      selectedFlight,
      newBalance: newBal,
    }).catch((err) =>
      console.error("[Email] Failed to send ticket email:", err.message),
    );

    res.json({
      success: true,
      message: "Flight booked successfully",
      data: { booking: booking[0], ticket: ticket[0], new_balance: newBal },
    });
  } catch (e) {
    await client.query("ROLLBACK");
    try {
      const client2 = await pool.connect();
      await client2.query(
        "UPDATE travel_requests SET status = 'approved' WHERE id = $1",
        [req.body.requestId],
      );
      client2.release();
    } catch (_) {}
    res
      .status(400)
      .json({ success: false, message: e.message || "Booking failed" });
  } finally {
    client.release();
  }
});

module.exports = router;
