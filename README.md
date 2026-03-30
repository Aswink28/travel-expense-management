# TravelDesk v3 — Travel Request & Expense Management System

Complete system with wallet, company bookings, ticket uploads, and document delivery.

---

## Quick Start — 4 commands

```powershell
# Terminal 1: Backend
cd traveldesk-v3\backend
npm install
node src/setup.js        # creates DB, schema, passwords, sample data
npm start                # → http://localhost:5000

# Terminal 2: Frontend
cd traveldesk-v3\frontend
npm install
npm run dev              # → http://localhost:5173
```

---

## Login Credentials

| Role          | Email                  | Password  |
|---------------|------------------------|-----------|
| Employee      | arjun@company.in       | pass123   |
| Employee      | priya@company.in       | pass123   |
| Tech Lead     | deepa@company.in       | pass123   |
| Manager       | ravi@company.in        | pass123   |
| Finance       | anil@company.in        | pass123   |
| Booking Admin | meena@company.in       | pass123   |
| Super Admin   | admin@company.in       | admin123  |

---

## All 16 Requirements Implemented

### 1. Travel Request Creation
- From/To location selector with route distance auto-detection
- Start/End date with validation (no past dates, end >= start)
- Total days auto-calculated: `(end - start) + 1`
- Purpose selection

### 2. Travel Mode Rules (Distance-Based)
- Short distance (e.g. Chennai→Bangalore): Train/Bus/Cab allowed
- Long distance (e.g. Chennai→Mumbai): Flight mandatory
- International (e.g. Chennai→London): Flight mandatory
- System blocks non-compliant mode selection in the form

### 3. Booking Type Selection
- Self Booking: Employee logs expenses themselves
- Company Booking: Booking Admin handles bookings

### 4. Approval Workflow
- Parallel lanes: Hierarchy (TL/Manager) + Finance
- Finance sets final approved amounts: travel cost, hotel cost, allowance
- Auto-calculated: `Allowance = total_days × daily_allowance_rate`
- Total = travel + hotel + allowance

### 5. Wallet Credit (3 separate categories)
- On full approval, wallet credited with:
  - Travel amount
  - Hotel amount
  - Daily allowance (days × rate)
- Real-time balance visible in sidebar + dashboard

### 6. Company Booking Flow
- Booking Admin sees only approved company requests
- Books transport + hotel separately with vendor, PNR, dates
- Each booking deducts employee wallet
- Cannot exceed approved amount
- Budget progress bar shown

### 7. Self Booking Flow
- Employee logs expenses from Wallet page
- Categories: travel, hotel, allowance, other
- Each debit logged with description and reference

### 8. Daily Allowance
- `Allowance = total_days × per_day_rate`
- Covers food, cab, metro, small expenses
- Stored in wallet as separate "allowance" balance

### 9. Booking Admin Role
- Can only view company booking approved requests
- Books and deducts wallet
- Uploads tickets/hotel vouchers
- Cannot use wallet for personal expenses

### 10. Ticket Delivery
- Admin uploads PDF/image ticket per booking
- Or uploads directly to request (general document)
- Employee sees all documents in request detail panel
- Download button available in employee portal

### 11. Wallet Transaction Tracking
- Every credit/debit recorded permanently
- Fields: UserId, Amount, Type, Category, ReferenceId, Date, PerformedBy, BalanceAfter
- Full transaction history with filter

### 12. Dashboard
- Wallet balance with category breakdown (Travel/Hotel/Allowance)
- Approved requests list
- Booking status indicator
- Ticket download directly from dashboard
- Expense breakdown with progress bars

### 13. Constraints (All Enforced Server-Side)
- No booking if wallet balance insufficient
- Cannot exceed approved amount
- Booking requires approved status + company booking type
- All transactions permanently logged

### 14. Database Tables
- `users`, `tier_config`, `expense_limits`
- `travel_requests` — with budget breakdown
- `approvals` — immutable audit trail
- `wallets` — real-time balance with category splits
- `wallet_transactions` — every debit/credit
- `bookings` — admin + self bookings with PNR
- `documents` — uploaded tickets/vouchers

### 15. APIs
All implemented — see server.js for full route list

### 16. Frontend
- 3-step travel request form with distance check
- Booking type selection UI
- Dashboard with wallet + tickets + status
- Admin booking panel with ticket upload

---

## File Structure
```
traveldesk-v3/
├── backend/
│   ├── sql/schema.sql          # Full DB schema
│   ├── src/
│   │   ├── setup.js            # One-time setup
│   │   ├── server.js           # Express app
│   │   ├── config/db.js        # PostgreSQL pool
│   │   ├── middleware/index.js  # Auth + Multer
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── requests.js     # + distance check
│   │       ├── wallet.js
│   │       ├── bookings.js     # + ticket upload
│   │       ├── documents.js    # + download
│   │       └── dashboard.js
│   └── uploads/                # Ticket files stored here
└── frontend/
    └── src/
        ├── App.jsx
        ├── context/AuthContext.jsx
        ├── services/api.js
        └── components/
            ├── shared/     (UI, Sidebar, LoginPage)
            ├── dashboard/  (Dashboard, WalletPage)
            ├── forms/      (NewRequestForm, RequestsList, ApprovalsQueue)
            └── admin/      (BookingPanel, TierConfig)
```
