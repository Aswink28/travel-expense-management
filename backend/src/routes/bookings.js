const express = require("express");
const path = require("path");
const fs = require("fs");
const pool = require("../config/db");
const { authenticate, authorise, upload } = require("../middleware");
const router = express.Router();

router.use(authenticate);
router.use(
  authorise(
    "Booking Admin",
    "Super Admin",
    "Manager",
    "TL",
    "Junior Developer",
  ),
);
// ── GET /api/bookings/pending ─────────────────────────────────
router.get("/pending", async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT tr.*, w.balance AS wallet_balance, w.travel_balance, w.hotel_balance, w.allowance_balance,
        COALESCE((SELECT SUM(b.amount) FROM bookings b WHERE b.request_id=tr.id AND b.status!='cancelled'),0) AS total_booked,
        COALESCE((SELECT json_agg(json_build_object('id',b.id,'category',b.category,'amount',b.amount,'vendor',b.vendor,'pnr_number',b.pnr_number,'booking_ref',b.booking_ref,'status',b.status,'created_at',b.created_at)) FROM bookings b WHERE b.request_id=tr.id),'[]') AS bookings_list,
        COALESCE((SELECT json_agg(json_build_object('id',d.id,'doc_type',d.doc_type,'original_name',d.original_name,'created_at',d.created_at)) FROM documents d WHERE d.request_id=tr.id),'[]') AS documents
      FROM travel_requests tr
      JOIN wallets w ON w.user_id=tr.user_id
      WHERE tr.status='approved' AND tr.booking_type='company' AND (tr.booking_status IS NULL OR tr.booking_status != 'completed')
      ORDER BY tr.submitted_at DESC
    `);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    next(e);
  }
});

// ── GET /api/bookings/request/:requestId ─────────────────────
router.get("/request/:requestId", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT tr.*, w.id AS wallet_id, w.balance AS wallet_balance, w.travel_balance, w.hotel_balance, w.allowance_balance,
        tc.max_hotel_per_night, tc.daily_allowance,
        COALESCE((SELECT SUM(b.amount) FROM bookings b WHERE b.request_id=tr.id AND b.status!='cancelled'),0) AS total_booked,
        COALESCE((SELECT json_agg(json_build_object('id',b.id,'category',b.category,'amount',b.amount,'vendor',b.vendor,'pnr_number',b.pnr_number,'booking_ref',b.booking_ref,'travel_date',b.travel_date,'check_in_date',b.check_in_date,'check_out_date',b.check_out_date,'status',b.status,'notes',b.notes,'created_at',b.created_at) ORDER BY b.created_at) FROM bookings b WHERE b.request_id=tr.id),'[]') AS bookings_list,
        COALESCE((SELECT json_agg(json_build_object('id',d.id,'doc_type',d.doc_type,'original_name',d.original_name,'file_name',d.file_name,'mime_type',d.mime_type,'description',d.description,'booking_id',d.booking_id,'created_at',d.created_at) ORDER BY d.created_at) FROM documents d WHERE d.request_id=tr.id),'[]') AS documents
      FROM travel_requests tr
      JOIN wallets w ON w.user_id=tr.user_id
      JOIN tier_config tc ON tc.role=tr.user_role
      WHERE tr.id=$1
    `,
      [req.params.requestId],
    );
    if (!rows.length)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    next(e);
  }
});

// ── GET /api/bookings/search-tickets ─────────────────────────
router.get("/search-tickets", async (req, res, next) => {
  try {
    const { travel_mode, source, destination, travel_date } = req.query;
    if (!travel_mode || !source || !destination || !travel_date) {
      return res.status(400).json({ success: false, message: "Missing search parameters" });
    }

    let results = [];
    const mode = String(travel_mode).toLowerCase();
    
    // Mocking real-time API responses
    if (mode === "flight") {
      results = [
        { id: "f1", provider: "Amadeus - Indigo", departure: "10:00 AM", duration: "2h 15m", price: 4500, mode: "Flight" },
        { id: "f2", provider: "Amadeus - AirIndia", departure: "02:30 PM", duration: "2h 30m", price: 5200, mode: "Flight" },
        { id: "f3", provider: "Amadeus - Vistara", departure: "08:00 PM", duration: "2h 10m", price: 6800, mode: "Flight" }
      ];
    } else if (mode === "bus") {
      results = [
        { id: "b1", provider: "RedBus - SRS Travels", departure: "09:00 PM", duration: "8h 30m", price: 1200, mode: "Bus" },
        { id: "b2", provider: "RedBus - VRL Travels", departure: "10:15 PM", duration: "9h", price: 1500, mode: "Bus" }
      ];
    } else if (mode === "train") {
      results = [
        { id: "t1", provider: "Static - Shatabdi", departure: "06:00 AM", duration: "5h", price: 1800, mode: "Train" },
        { id: "t2", provider: "Static - Rajdhani", departure: "04:30 PM", duration: "4h 45m", price: 2200, mode: "Train" }
      ];
    } else {
      results = [
        { id: "o1", provider: "Generic Provider", departure: "Anytime", duration: "N/A", price: 1000, mode }
      ];
    }

    // Adding simulated delay
    setTimeout(() => {
      res.json({ success: true, data: results });
    }, 800);
  } catch (e) {
    next(e);
  }
});

// ── POST /api/bookings/execute-booking ────────────────────────
router.post("/execute-booking", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      request_id,
      execute_mode, // 'api' or 'manual'
      category = 'travel',
      amount,
      vendor,
      from_location,
      to_location,
      travel_date,
      pnr_number, // required for manual
      travel_mode
    } = req.body;

    if (!request_id || !amount || !execute_mode) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // 1. Lock wallet and request
    const { rows: reqRows } = await client.query(
      "SELECT tr.*, w.id AS wallet_id, w.balance FROM travel_requests tr JOIN wallets w ON w.user_id=tr.user_id WHERE tr.id=$1 AND tr.status='approved' FOR UPDATE",
      [request_id]
    );
    
    if (!reqRows.length) {
      return res.status(400).json({ success: false, message: "Approved request not found" });
    }
    const tr = reqRows[0];

    // 2. Before booking: Check wallet balance
    if (Number(tr.balance) < Number(amount)) {
      return res.status(400).json({ success: false, message: `Insufficient wallet balance. Available: ₹${tr.balance}` });
    }

    // 3. Simulate API booking or manual
    let finalPnr = pnr_number;
    let finalVendor = vendor;

    if (execute_mode === 'api') {
      // Simulate API call 
      const isSuccess = Math.random() > 0.1; // 90% success
      if (!isSuccess) {
         throw new Error("External API booking failed. Please try again or use manual fallback.");
      }
      finalPnr = 'PNR-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    } else if (execute_mode === 'manual' && !finalPnr) {
      return res.status(400).json({ success: false, message: "PNR is required for manual booking" });
    }

    const newBal = Number(tr.balance) - Number(amount);

    // 4. After successful booking: Deduct wallet
    const { rows: txnRow } = await client.query(
      `INSERT INTO wallet_transactions (wallet_id, user_id, request_id, txn_type, category, amount, description, performed_by, balance_after, reference)
       VALUES ($1, $2, $3, 'debit', $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tr.wallet_id, tr.user_id, request_id, category, amount, `${execute_mode.toUpperCase()} ${category} booking by ${req.user.name}`, req.user.id, newBal, finalPnr]
    );

    // 5. Store ticket details
    const { rows: booking } = await client.query(
      `INSERT INTO bookings (request_id, wallet_id, booked_by_id, booked_for_id, booking_type, category, travel_mode, vendor, from_location, to_location, travel_date, amount, pnr_number, txn_id)
       VALUES ($1, $2, $3, $4, 'company', $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [request_id, tr.wallet_id, req.user.id, tr.user_id, category, travel_mode, finalVendor, from_location, to_location, travel_date, amount, finalPnr, txnRow[0].id]
    );

    // Also populate tickets table for User Portal Delivery
    await client.query(
      `INSERT INTO tickets (booking_id, user_id, request_id, pnr_number, booking_ref, ticket_type, travel_mode, passenger_name, from_location, to_location, travel_date, vendor, amount, status)
       VALUES ($1,$2,$3,$4,$5,'transport',$6,$7,$8,$9,$10,$11,$12,'confirmed')`,
      [booking[0].id, tr.user_id, request_id, finalPnr, finalPnr, travel_mode, tr.user_name, from_location, to_location, travel_date, finalVendor, amount]
    );

    // 6. Update user portal status
    await client.query("UPDATE travel_requests SET booking_status='completed' WHERE id=$1", [request_id]);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `Ticket booked successfully via ${execute_mode.toUpperCase()} mode.`,
      data: { booking: booking[0], new_balance: newBal, pnr: finalPnr }
    });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.message.includes("External API booking failed")) {
      return res.status(502).json({ success: false, message: e.message });
    }
    next(e);
  } finally {
    client.release();
  }
});

// ── POST /api/bookings/book ───────────────────────────────────
router.post("/book", async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      request_id,
      category,
      amount,
      vendor,
      from_location,
      to_location,
      travel_date,
      check_in_date,
      check_out_date,
      pnr_number,
      booking_ref,
      notes,
      travel_mode,
    } = req.body;
    if (!request_id || !category || !amount)
      return res.status(400).json({
        success: false,
        message: "request_id, category, amount required",
      });
    if (!["travel", "hotel", "other"].includes(category))
      return res.status(400).json({
        success: false,
        message: "Category must be travel, hotel, or other",
      });

    // Lock wallet
    const { rows: reqRows } = await client.query(
      "SELECT tr.*,w.id AS wallet_id,w.balance,w.travel_balance,w.hotel_balance FROM travel_requests tr JOIN wallets w ON w.user_id=tr.user_id WHERE tr.id=$1 AND tr.status='approved' AND tr.booking_type='company' FOR UPDATE",
      [request_id],
    );
    if (!reqRows.length)
      return res.status(400).json({
        success: false,
        message: "Approved company booking request not found",
      });
    const tr = reqRows[0];

    // Check approved amount not exceeded
    const { rows: totRow } = await client.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM bookings WHERE request_id=$1 AND status!='cancelled'",
      [request_id],
    );
    const alreadyBooked = Number(totRow[0].total);
    if (
      alreadyBooked + Number(amount) >
      Number(tr.approved_total || tr.estimated_total)
    ) {
      return res.status(400).json({
        success: false,
        message: `Booking would exceed approved amount of ₹${tr.approved_total || tr.estimated_total}. Already booked: ₹${alreadyBooked}`,
      });
    }

    if (Number(tr.balance) < Number(amount)) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Available: ₹${tr.balance}`,
      });
    }

    const newBal = Number(tr.balance) - Number(amount);

    // Wallet debit
    const { rows: txnRow } = await client.query(
      `INSERT INTO wallet_transactions (wallet_id,user_id,request_id,txn_type,category,amount,description,performed_by,balance_after,reference)
       VALUES ($1,$2,$3,'debit',$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        tr.wallet_id,
        tr.user_id,
        request_id,
        category,
        amount,
        `${category} booking by ${req.user.name} for ${tr.user_name}`,
        req.user.id,
        newBal,
        pnr_number || booking_ref || null,
      ],
    );

    // Create booking
    const { rows: booking } = await client.query(
      `INSERT INTO bookings (request_id,wallet_id,booked_by_id,booked_for_id,booking_type,category,travel_mode,vendor,from_location,to_location,travel_date,check_in_date,check_out_date,amount,pnr_number,booking_ref,notes,txn_id)
       VALUES ($1,$2,$3,$4,'company',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        request_id,
        tr.wallet_id,
        req.user.id,
        tr.user_id,
        category,
        travel_mode || null,
        vendor || null,
        from_location || null,
        to_location || null,
        travel_date || null,
        check_in_date || null,
        check_out_date || null,
        amount,
        pnr_number || null,
        booking_ref || null,
        notes || null,
        txnRow[0].id,
      ],
    );

    // Update booking status
    await client.query(
      "UPDATE travel_requests SET booking_status='booked' WHERE id=$1",
      [request_id],
    );

    await client.query("COMMIT");
    res.json({
      success: true,
      message: `${category} booking confirmed. ₹${amount} deducted.`,
      data: { booking: booking[0], new_balance: newBal },
    });
  } catch (e) {
    await client.query("ROLLBACK");
    next(e);
  } finally {
    client.release();
  }
});

// ── POST /api/bookings/:bookingId/upload ──────────────────────
router.post(
  "/:bookingId/upload",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });

      // Get booking details
      const { rows: booking } = await pool.query(
        "SELECT b.*,tr.user_id,tr.id AS req_id FROM bookings b JOIN travel_requests tr ON tr.id=b.request_id WHERE b.id=$1",
        [req.params.bookingId],
      );
      if (!booking.length)
        return res
          .status(404)
          .json({ success: false, message: "Booking not found" });

      const { doc_type = "ticket", description } = req.body;

      const { rows: doc } = await pool.query(
        `INSERT INTO documents (booking_id,request_id,uploaded_by,for_user_id,doc_type,file_name,original_name,file_path,file_size,mime_type,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          booking[0].id,
          booking[0].req_id,
          req.user.id,
          booking[0].user_id,
          doc_type,
          req.file.filename,
          req.file.originalname,
          req.file.path,
          req.file.size,
          req.file.mimetype,
          description || null,
        ],
      );

      res.json({
        success: true,
        message: "Ticket uploaded successfully",
        data: doc[0],
      });
    } catch (e) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(e);
    }
  },
);

// ── POST /api/bookings/upload-to-request ─────────────────────
router.post(
  "/upload-to-request",
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file)
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      const { request_id, doc_type = "ticket", description } = req.body;
      if (!request_id)
        return res
          .status(400)
          .json({ success: false, message: "request_id required" });

      const { rows: tr } = await pool.query(
        "SELECT id,user_id FROM travel_requests WHERE id=$1",
        [request_id],
      );
      if (!tr.length)
        return res
          .status(404)
          .json({ success: false, message: "Request not found" });

      const { rows: doc } = await pool.query(
        `INSERT INTO documents (request_id,uploaded_by,for_user_id,doc_type,file_name,original_name,file_path,file_size,mime_type,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          request_id,
          req.user.id,
          tr[0].user_id,
          doc_type,
          req.file.filename,
          req.file.originalname,
          req.file.path,
          req.file.size,
          req.file.mimetype,
          description || null,
        ],
      );
      res.json({ success: true, message: "Document uploaded", data: doc[0] });
    } catch (e) {
      if (req.file) fs.unlink(req.file.path, () => {});
      next(e);
    }
  },
);

// ── GET /api/bookings/history ─────────────────────────────────
router.get("/history", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT b.*,u.name AS booked_for_name,u.role AS booked_for_role,tr.from_location,tr.to_location
      FROM bookings b JOIN users u ON u.id=b.booked_for_id JOIN travel_requests tr ON tr.id=b.request_id
      WHERE b.booked_by_id=$1 ORDER BY b.created_at DESC
    `,
      [req.user.id],
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
