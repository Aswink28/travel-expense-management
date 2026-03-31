const swaggerJsdoc = require('swagger-jsdoc')
const swaggerUi = require('swagger-ui-express')

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Moiter Workz — Travel Expense Management API',
      version: '3.0.0',
      description: 'Complete API documentation for the Travel Expense Management system with role-based access control, wallet management, booking workflows, and employee management.',
    },
    servers: [{ url: '/api', description: 'API Server' }],
    components: {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          description: 'Login with email as username (e.g. arjun@company.in / pass123)',
          flows: {
            password: {
              tokenUrl: '/api/auth/oauth/token',
              scopes: {
                'Employee':      'Employee access',
                'Tech Lead':     'Tech Lead access',
                'Manager':       'Manager access',
                'Finance':       'Finance access',
                'Booking Admin': 'Booking Admin access',
                'Super Admin':   'Full access',
              },
            },
          },
        },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {

        // ── Core Models ──────────────────────────────────
        User: {
          type: 'object',
          properties: {
            id:           { type: 'string', format: 'uuid' },
            empId:        { type: 'string', example: 'EMP-001' },
            name:         { type: 'string' },
            email:        { type: 'string', format: 'email' },
            role:         { $ref: '#/components/schemas/UserRole' },
            dept:         { type: 'string' },
            avatar:       { type: 'string', example: 'AS' },
            color:        { type: 'string', example: '#0A84FF' },
            reportingTo:  { type: 'string', nullable: true },
            wallet:       { $ref: '#/components/schemas/WalletSummary' },
          },
        },
        UserRole: {
          type: 'string',
          enum: ['Employee', 'Tech Lead', 'Manager', 'Finance', 'Booking Admin', 'Super Admin'],
        },
        WalletSummary: {
          type: 'object',
          properties: {
            balance:           { type: 'number', example: 15000 },
            travel_balance:    { type: 'number' },
            hotel_balance:     { type: 'number' },
            allowance_balance: { type: 'number' },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            id:                { type: 'string', format: 'uuid' },
            user_id:           { type: 'string', format: 'uuid' },
            balance:           { type: 'number' },
            total_credited:    { type: 'number' },
            total_debited:     { type: 'number' },
            travel_balance:    { type: 'number' },
            hotel_balance:     { type: 'number' },
            allowance_balance: { type: 'number' },
            updated_at:        { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id:            { type: 'string', format: 'uuid' },
            wallet_id:     { type: 'string', format: 'uuid' },
            user_id:       { type: 'string', format: 'uuid' },
            request_id:    { type: 'string', nullable: true },
            txn_type:      { type: 'string', enum: ['credit', 'debit'] },
            category:      { type: 'string', enum: ['travel', 'hotel', 'allowance', 'credit', 'other'] },
            amount:        { type: 'number' },
            description:   { type: 'string' },
            reference:     { type: 'string', nullable: true },
            performed_by:  { type: 'string', format: 'uuid', nullable: true },
            balance_after: { type: 'number' },
            created_at:    { type: 'string', format: 'date-time' },
          },
        },
        TravelRequest: {
          type: 'object',
          properties: {
            id:                     { type: 'string', example: 'TR-A1B2C' },
            user_id:                { type: 'string', format: 'uuid' },
            user_name:              { type: 'string' },
            user_role:              { type: 'string' },
            department:             { type: 'string' },
            from_location:          { type: 'string' },
            to_location:            { type: 'string' },
            distance_type:          { type: 'string', enum: ['short', 'long', 'international'] },
            travel_mode:            { type: 'string', enum: ['Train', 'Bus', 'Flight', 'Metro', 'Cab', 'Rapido', 'Auto'] },
            booking_type:           { type: 'string', enum: ['self', 'company'] },
            start_date:             { type: 'string', format: 'date' },
            end_date:               { type: 'string', format: 'date' },
            total_days:             { type: 'integer' },
            purpose:                { type: 'string' },
            notes:                  { type: 'string', nullable: true },
            estimated_travel_cost:  { type: 'number' },
            estimated_hotel_cost:   { type: 'number' },
            estimated_total:        { type: 'number' },
            approved_travel_cost:   { type: 'number', nullable: true },
            approved_hotel_cost:    { type: 'number', nullable: true },
            approved_allowance:     { type: 'number', nullable: true },
            approved_total:         { type: 'number', nullable: true },
            status:                 { type: 'string', enum: ['draft', 'pending', 'pending_finance', 'approved', 'rejected', 'cancelled'] },
            booking_status:         { type: 'string', enum: ['pending', 'booked', 'cancelled', 'completed'], nullable: true },
            wallet_credited:        { type: 'boolean' },
            submitted_at:           { type: 'string', format: 'date-time' },
          },
        },
        Approval: {
          type: 'object',
          properties: {
            id:                    { type: 'string', format: 'uuid' },
            request_id:            { type: 'string' },
            approver_id:           { type: 'string', format: 'uuid' },
            approver_name:         { type: 'string' },
            approver_role:         { type: 'string' },
            action:                { type: 'string', enum: ['approved', 'rejected'] },
            note:                  { type: 'string', nullable: true },
            approved_travel_cost:  { type: 'number', nullable: true },
            approved_hotel_cost:   { type: 'number', nullable: true },
            approved_allowance:    { type: 'number', nullable: true },
            acted_at:              { type: 'string', format: 'date-time' },
          },
        },
        Booking: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            request_id:     { type: 'string' },
            wallet_id:      { type: 'string', format: 'uuid' },
            booked_by_id:   { type: 'string', format: 'uuid' },
            booked_for_id:  { type: 'string', format: 'uuid' },
            booking_type:   { type: 'string', enum: ['self', 'company'] },
            category:       { type: 'string', enum: ['travel', 'hotel', 'allowance'] },
            travel_mode:    { type: 'string' },
            vendor:         { type: 'string', nullable: true },
            from_location:  { type: 'string' },
            to_location:    { type: 'string' },
            travel_date:    { type: 'string', format: 'date', nullable: true },
            check_in_date:  { type: 'string', format: 'date', nullable: true },
            check_out_date: { type: 'string', format: 'date', nullable: true },
            amount:         { type: 'number' },
            pnr_number:     { type: 'string' },
            booking_ref:    { type: 'string', nullable: true },
            status:         { type: 'string', enum: ['pending', 'booked', 'cancelled', 'completed'] },
            created_at:     { type: 'string', format: 'date-time' },
          },
        },
        Ticket: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            booking_id:     { type: 'string', format: 'uuid' },
            user_id:        { type: 'string', format: 'uuid' },
            request_id:     { type: 'string' },
            pnr_number:     { type: 'string' },
            booking_ref:    { type: 'string' },
            ticket_type:    { type: 'string', enum: ['transport', 'hotel'] },
            travel_mode:    { type: 'string', nullable: true },
            passenger_name: { type: 'string' },
            from_location:  { type: 'string', nullable: true },
            to_location:    { type: 'string', nullable: true },
            travel_date:    { type: 'string', format: 'date', nullable: true },
            hotel_name:     { type: 'string', nullable: true },
            check_in_date:  { type: 'string', format: 'date', nullable: true },
            check_out_date: { type: 'string', format: 'date', nullable: true },
            amount:         { type: 'number' },
            status:         { type: 'string' },
            ticket_data:    { type: 'object' },
            created_at:     { type: 'string', format: 'date-time' },
          },
        },
        Document: {
          type: 'object',
          properties: {
            id:            { type: 'string', format: 'uuid' },
            booking_id:    { type: 'string', format: 'uuid', nullable: true },
            request_id:    { type: 'string' },
            uploaded_by:   { type: 'string', format: 'uuid' },
            doc_type:      { type: 'string', enum: ['ticket', 'hotel_voucher', 'invoice', 'other'] },
            file_name:     { type: 'string' },
            original_name: { type: 'string' },
            file_size:     { type: 'integer' },
            mime_type:     { type: 'string' },
            created_at:    { type: 'string', format: 'date-time' },
          },
        },
        Employee: {
          type: 'object',
          properties: {
            id:             { type: 'string', format: 'uuid' },
            emp_id:         { type: 'string', example: 'EMP-008' },
            name:           { type: 'string' },
            email:          { type: 'string', format: 'email' },
            role:           { $ref: '#/components/schemas/UserRole' },
            department:     { type: 'string' },
            avatar:         { type: 'string' },
            color:          { type: 'string' },
            reporting_to:   { type: 'string', nullable: true },
            is_active:      { type: 'boolean' },
            last_login:     { type: 'string', format: 'date-time', nullable: true },
            wallet_balance: { type: 'number' },
            created_at:     { type: 'string', format: 'date-time' },
          },
        },
        TierConfig: {
          type: 'object',
          properties: {
            role:                  { type: 'string' },
            allowed_modes:         { type: 'array', items: { type: 'string' } },
            max_trip_budget:       { type: 'number' },
            daily_allowance:       { type: 'number' },
            max_hotel_per_night:   { type: 'number' },
            cab_daily_limit:       { type: 'number' },
            food_daily_limit:      { type: 'number' },
          },
        },

        // ── Reusable Responses ───────────────────────────
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ oauth2: [] }, { bearerAuth: [] }],
    tags: [
      { name: 'Auth',          description: 'Authentication & session' },
      { name: 'Employees',     description: 'Employee management (Super Admin only)' },
      { name: 'Requests',      description: 'Travel requests & approvals' },
      { name: 'Wallet',        description: 'Wallet balance & transactions' },
      { name: 'Bookings',      description: 'Company booking panel (Booking Admin / Super Admin)' },
      { name: 'Self-Booking',  description: 'Employee self-booking after approval' },
      { name: 'Admin',         description: 'Admin operations — users, wallet, ad-hoc bookings' },
      { name: 'Dashboard',     description: 'Dashboard summaries & tier config' },
      { name: 'Documents',     description: 'Ticket / document downloads' },
      { name: 'Flights',       description: 'Flight search & booking (Admin)' },
      { name: 'Hotels',        description: 'Hotel search & booking (Admin)' },
    ],

    // ── All Paths ──────────────────────────────────────
    paths: {

      // ═══════════ AUTH ═══════════
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['email', 'password'],
            properties: {
              email:    { type: 'string', format: 'email', example: 'arjun@company.in' },
              password: { type: 'string', example: 'pass123' },
            },
          }}}},
          responses: {
            200: { description: 'Login successful', content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                token:   { type: 'string' },
                user:    { $ref: '#/components/schemas/User' },
              },
            }}}},
            401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } }}},
          },
        },
      },
      '/auth/oauth/token': {
        post: {
          tags: ['Auth'],
          summary: 'OAuth 2.0 Token (Password Grant)',
          description: 'Use email as username. Returns access_token for API authorization.',
          security: [],
          requestBody: { required: true, content: { 'application/x-www-form-urlencoded': { schema: {
            type: 'object', required: ['grant_type', 'username', 'password'],
            properties: {
              grant_type: { type: 'string', enum: ['password'], default: 'password' },
              username:   { type: 'string', format: 'email', example: 'arjun@company.in' },
              password:   { type: 'string', example: 'pass123' },
            },
          }}}},
          responses: {
            200: { description: 'Token issued', content: { 'application/json': { schema: {
              type: 'object',
              properties: {
                access_token: { type: 'string' },
                token_type:   { type: 'string', example: 'Bearer' },
                expires_in:   { type: 'integer', example: 28800 },
                scope:        { type: 'string', example: 'Employee' },
              },
            }}}},
            401: { description: 'Invalid credentials' },
          },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user profile & wallet',
          responses: {
            200: { description: 'User profile', content: { 'application/json': { schema: {
              type: 'object',
              properties: { success: { type: 'boolean' }, user: { $ref: '#/components/schemas/User' } },
            }}}},
            401: { description: 'Invalid / expired token' },
          },
        },
      },

      // ═══════════ EMPLOYEES ═══════════
      '/employees': {
        get: {
          tags: ['Employees'],
          summary: 'List all employees',
          description: 'Super Admin only. Returns all employees with wallet balance.',
          responses: {
            200: { description: 'Employee list', content: { 'application/json': { schema: {
              type: 'object',
              properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Employee' } } },
            }}}},
            403: { description: 'Not Super Admin' },
          },
        },
        post: {
          tags: ['Employees'],
          summary: 'Create a new employee',
          description: 'Super Admin only. Auto-generates emp_id, avatar, color, and wallet.',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['name', 'email', 'password', 'role'],
            properties: {
              name:         { type: 'string', example: 'Rahul Sharma' },
              email:        { type: 'string', format: 'email', example: 'rahul@company.in' },
              password:     { type: 'string', minLength: 6, example: 'pass123' },
              role:         { $ref: '#/components/schemas/UserRole' },
              department:   { type: 'string', example: 'Engineering', default: 'Engineering' },
              reporting_to: { type: 'string', example: 'Ravi Kumar', nullable: true },
            },
          }}}},
          responses: {
            201: { description: 'Employee created', content: { 'application/json': { schema: {
              type: 'object',
              properties: { success: { type: 'boolean' }, message: { type: 'string' }, data: { $ref: '#/components/schemas/Employee' } },
            }}}},
            400: { description: 'Validation error' },
            409: { description: 'Email already exists' },
          },
        },
      },
      '/employees/{id}': {
        put: {
          tags: ['Employees'],
          summary: 'Update an employee',
          description: 'Super Admin only. Partial update — send only fields to change. Password is optional.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object',
            properties: {
              name:         { type: 'string' },
              email:        { type: 'string', format: 'email' },
              password:     { type: 'string', description: 'Leave blank to keep current' },
              role:         { $ref: '#/components/schemas/UserRole' },
              department:   { type: 'string' },
              reporting_to: { type: 'string', nullable: true },
            },
          }}}},
          responses: {
            200: { description: 'Employee updated' },
            404: { description: 'Employee not found' },
            409: { description: 'Email already in use' },
          },
        },
      },
      '/employees/{id}/status': {
        patch: {
          tags: ['Employees'],
          summary: 'Activate or deactivate an employee',
          description: 'Super Admin only. Cannot deactivate yourself. Inactive users cannot login.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['is_active'],
            properties: { is_active: { type: 'boolean' } },
          }}}},
          responses: {
            200: { description: 'Status toggled' },
            400: { description: 'Cannot deactivate yourself' },
          },
        },
      },

      // ═══════════ REQUESTS ═══════════
      '/requests': {
        get: {
          tags: ['Requests'],
          summary: 'List travel requests',
          description: 'Filtered by role: Employee sees own, Manager/Finance sees all, Booking Admin sees approved company requests.',
          parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['draft','pending','pending_finance','approved','rejected','cancelled'] } }],
          responses: {
            200: { description: 'Request list', content: { 'application/json': { schema: {
              type: 'object',
              properties: { success: { type: 'boolean' }, count: { type: 'integer' }, data: { type: 'array', items: { $ref: '#/components/schemas/TravelRequest' } } },
            }}}},
          },
        },
        post: {
          tags: ['Requests'],
          summary: 'Create a new travel request',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['from_location','to_location','travel_mode','booking_type','start_date','end_date','purpose','estimated_travel_cost'],
            properties: {
              from_location:         { type: 'string', example: 'Chennai' },
              to_location:           { type: 'string', example: 'Mumbai' },
              travel_mode:           { type: 'string', enum: ['Train','Bus','Flight','Metro','Cab','Rapido','Auto'] },
              booking_type:          { type: 'string', enum: ['self','company'] },
              start_date:            { type: 'string', format: 'date' },
              end_date:              { type: 'string', format: 'date' },
              purpose:               { type: 'string' },
              notes:                 { type: 'string' },
              estimated_travel_cost: { type: 'number' },
              estimated_hotel_cost:  { type: 'number', default: 0 },
              trip_name:             { type: 'string' },
              trip_type:             { type: 'string' },
              approver_1:            { type: 'string' },
              approver_2:            { type: 'string' },
              approver_3:            { type: 'string' },
              project_name:          { type: 'string' },
              contact_name:          { type: 'string' },
              contact_mobile:        { type: 'string' },
              contact_email:         { type: 'string' },
              itinerary:             { type: 'object' },
              passengers:            { type: 'object' },
            },
          }}}},
          responses: {
            201: { description: 'Request created' },
            400: { description: 'Validation error or mode not allowed for tier' },
          },
        },
      },
      '/requests/queue': {
        get: {
          tags: ['Requests'],
          summary: 'Get pending approval queue',
          description: 'Returns requests pending your approval. Tech Lead sees Employee requests, Manager sees Employee+TL+Finance, Finance sees pending_finance, Super Admin sees all.',
          responses: {
            200: { description: 'Approval queue', content: { 'application/json': { schema: {
              type: 'object',
              properties: { success: { type: 'boolean' }, count: { type: 'integer' }, data: { type: 'array', items: { $ref: '#/components/schemas/TravelRequest' } } },
            }}}},
          },
        },
      },
      '/requests/distance-check': {
        get: {
          tags: ['Requests'],
          summary: 'Check distance type between locations',
          parameters: [
            { name: 'from', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'to',   in: 'query', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Distance info', content: { 'application/json': { schema: {
              type: 'object',
              properties: { success: { type: 'boolean' }, data: { type: 'object', properties: {
                dist_type: { type: 'string', enum: ['short','long','international'] },
                required_mode: { type: 'string', nullable: true },
                user_allowed_modes: { type: 'array', items: { type: 'string' } },
                effective_modes: { type: 'array', items: { type: 'string' } },
              }}},
            }}}},
          },
        },
      },
      '/requests/{id}': {
        get: {
          tags: ['Requests'],
          summary: 'Get full request detail',
          description: 'Returns request with approvals, bookings, documents, tickets, tier config, and wallet.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Request detail' }, 404: { description: 'Not found' } },
        },
      },
      '/requests/{id}/action': {
        post: {
          tags: ['Requests'],
          summary: 'Approve or reject a request',
          description: 'Two-lane approval: hierarchy (Tech Lead/Manager) + Finance. Super Admin covers both. Finance sets final approved amounts. Wallet auto-credited on full approval.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['action'],
            properties: {
              action:                { type: 'string', enum: ['approved', 'rejected'] },
              note:                  { type: 'string', description: 'Rejection reason or approval comment' },
              approved_travel_cost:  { type: 'number', description: 'Finance only — final travel amount' },
              approved_hotel_cost:   { type: 'number', description: 'Finance only — final hotel amount' },
              approved_allowance:    { type: 'number', description: 'Finance only — final allowance' },
            },
          }}}},
          responses: { 200: { description: 'Action recorded' }, 400: { description: 'Already acted / cannot approve own' } },
        },
      },

      // ═══════════ WALLET ═══════════
      '/wallet/balance': {
        get: {
          tags: ['Wallet'],
          summary: 'Get own wallet balance',
          responses: { 200: { description: 'Wallet data', content: { 'application/json': { schema: {
            type: 'object',
            properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Wallet' } },
          }}}}},
        },
      },
      '/wallet/balance/{userId}': {
        get: {
          tags: ['Wallet'],
          summary: "Get another user's wallet balance",
          description: 'Booking Admin, Super Admin, Finance, Manager only.',
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Wallet data' }, 403: { description: 'Forbidden' } },
        },
      },
      '/wallet/transactions': {
        get: {
          tags: ['Wallet'],
          summary: 'Get own wallet transactions',
          description: 'Returns last 100 transactions, newest first.',
          responses: { 200: { description: 'Transaction list', content: { 'application/json': { schema: {
            type: 'object',
            properties: { success: { type: 'boolean' }, count: { type: 'integer' }, data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } } },
          }}}}},
        },
      },
      '/wallet/transactions/{userId}': {
        get: {
          tags: ['Wallet'],
          summary: "Get another user's transactions",
          description: 'Booking Admin, Super Admin, Finance, Manager only.',
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Transaction list' } },
        },
      },
      '/wallet/debit': {
        post: {
          tags: ['Wallet'],
          summary: 'Log an expense (debit own wallet)',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['request_id','amount','category'],
            properties: {
              request_id:  { type: 'string' },
              amount:      { type: 'number' },
              category:    { type: 'string', enum: ['travel','hotel','allowance','other'] },
              description: { type: 'string' },
              reference:   { type: 'string', description: 'PNR or booking ref' },
            },
          }}}},
          responses: { 200: { description: 'Debit successful' }, 400: { description: 'Insufficient balance' } },
        },
      },

      // ═══════════ BOOKINGS ═══════════
      '/bookings/pending': {
        get: {
          tags: ['Bookings'],
          summary: 'Get approved company requests pending booking',
          description: 'Booking Admin / Super Admin. Returns approved company-type requests not yet fully booked.',
          responses: { 200: { description: 'Pending bookings list' } },
        },
      },
      '/bookings/request/{requestId}': {
        get: {
          tags: ['Bookings'],
          summary: 'Get booking detail for a request',
          parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Request with bookings, wallet, tier, documents' } },
        },
      },
      '/bookings/search-tickets': {
        get: {
          tags: ['Bookings'],
          summary: 'Search available tickets',
          description: 'Returns mock search results for flights/trains/buses.',
          parameters: [
            { name: 'travel_mode', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'source',      in: 'query', required: true, schema: { type: 'string' } },
            { name: 'destination', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'travel_date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          ],
          responses: { 200: { description: 'Search results' } },
        },
      },
      '/bookings/execute-booking': {
        post: {
          tags: ['Bookings'],
          summary: 'Execute a booking (API or manual)',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['request_id','category','amount'],
            properties: {
              request_id:   { type: 'string' },
              execute_mode: { type: 'string', enum: ['api', 'manual'], default: 'api' },
              category:     { type: 'string', enum: ['travel','hotel'] },
              amount:       { type: 'number' },
              vendor:       { type: 'string' },
              from_location:{ type: 'string' },
              to_location:  { type: 'string' },
              travel_date:  { type: 'string', format: 'date' },
              pnr_number:   { type: 'string', description: 'Required for manual mode' },
              travel_mode:  { type: 'string' },
            },
          }}}},
          responses: { 200: { description: 'Booking executed' }, 400: { description: 'Budget exceeded or insufficient balance' } },
        },
      },
      '/bookings/book': {
        post: {
          tags: ['Bookings'],
          summary: 'Create a booking record',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['request_id','category','amount'],
            properties: {
              request_id:     { type: 'string' },
              category:       { type: 'string', enum: ['travel','hotel','other'] },
              amount:         { type: 'number' },
              vendor:         { type: 'string' },
              from_location:  { type: 'string' },
              to_location:    { type: 'string' },
              travel_date:    { type: 'string', format: 'date' },
              check_in_date:  { type: 'string', format: 'date' },
              check_out_date: { type: 'string', format: 'date' },
              pnr_number:     { type: 'string' },
              booking_ref:    { type: 'string' },
              notes:          { type: 'string' },
              travel_mode:    { type: 'string' },
            },
          }}}},
          responses: { 200: { description: 'Booking created' } },
        },
      },
      '/bookings/{bookingId}/upload': {
        post: {
          tags: ['Bookings'],
          summary: 'Upload ticket/document to a booking',
          parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'multipart/form-data': { schema: {
            type: 'object', required: ['file'],
            properties: {
              file:        { type: 'string', format: 'binary' },
              doc_type:    { type: 'string', enum: ['ticket','hotel_voucher','invoice','other'], default: 'ticket' },
              description: { type: 'string' },
            },
          }}}},
          responses: { 200: { description: 'Document uploaded' } },
        },
      },
      '/bookings/upload-to-request': {
        post: {
          tags: ['Bookings'],
          summary: 'Upload document directly to a request',
          requestBody: { required: true, content: { 'multipart/form-data': { schema: {
            type: 'object', required: ['file','request_id'],
            properties: {
              file:        { type: 'string', format: 'binary' },
              request_id:  { type: 'string' },
              doc_type:    { type: 'string', default: 'ticket' },
              description: { type: 'string' },
            },
          }}}},
          responses: { 200: { description: 'Document uploaded' } },
        },
      },
      '/bookings/history': {
        get: {
          tags: ['Bookings'],
          summary: 'Get booking history',
          description: 'Returns bookings made by the current user.',
          responses: { 200: { description: 'Booking history' } },
        },
      },

      // ═══════════ SELF-BOOKING ═══════════
      '/self-booking/my-approved': {
        get: {
          tags: ['Self-Booking'],
          summary: 'Get my approved self-booking requests',
          description: 'Returns approved requests with booking_type=self, including existing bookings and wallet info.',
          responses: { 200: { description: 'Approved requests' } },
        },
      },
      '/self-booking/request/{requestId}': {
        get: {
          tags: ['Self-Booking'],
          summary: 'Get self-booking request detail',
          parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Request with bookings, transactions, wallet, tier' } },
        },
      },
      '/self-booking/book-transport': {
        post: {
          tags: ['Self-Booking'],
          summary: 'Self-book a transport ticket',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['request_id','travel_mode','from_location','to_location','travel_date','amount'],
            properties: {
              request_id:    { type: 'string' },
              travel_mode:   { type: 'string' },
              from_location: { type: 'string' },
              to_location:   { type: 'string' },
              travel_date:   { type: 'string', format: 'date' },
              travel_time:   { type: 'string' },
              seat_class:    { type: 'string' },
              seat_number:   { type: 'string' },
              vendor:        { type: 'string' },
              train_number:  { type: 'string' },
              flight_number: { type: 'string' },
              amount:        { type: 'number' },
            },
          }}}},
          responses: { 201: { description: 'Transport booked with ticket and PNR' }, 400: { description: 'Budget exceeded' } },
        },
      },
      '/self-booking/book-hotel': {
        post: {
          tags: ['Self-Booking'],
          summary: 'Self-book a hotel',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['request_id','hotel_name','check_in_date','check_out_date','amount'],
            properties: {
              request_id:     { type: 'string' },
              hotel_name:     { type: 'string' },
              hotel_address:  { type: 'string' },
              check_in_date:  { type: 'string', format: 'date' },
              check_out_date: { type: 'string', format: 'date' },
              room_type:      { type: 'string' },
              amount:         { type: 'number' },
              vendor:         { type: 'string' },
            },
          }}}},
          responses: { 201: { description: 'Hotel booked with ticket' }, 400: { description: 'Budget exceeded' } },
        },
      },
      '/self-booking/tickets': {
        get: {
          tags: ['Self-Booking'],
          summary: 'Get all my tickets',
          responses: { 200: { description: 'Ticket list with request details' } },
        },
      },
      '/self-booking/ticket/{ticketId}': {
        get: {
          tags: ['Self-Booking'],
          summary: 'Get single ticket detail',
          parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Ticket detail' }, 404: { description: 'Not found' } },
        },
      },
      '/self-booking/booking/{bookingId}/cancel': {
        delete: {
          tags: ['Self-Booking'],
          summary: 'Cancel a self-booking and refund wallet',
          parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Cancelled and refunded' }, 400: { description: 'Already cancelled' } },
        },
      },

      // ═══════════ ADMIN ═══════════
      '/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'List all users with wallet balance',
          description: 'Booking Admin / Super Admin only.',
          responses: { 200: { description: 'User list' } },
        },
      },
      '/admin/user/wallet/{id}': {
        get: {
          tags: ['Admin'],
          summary: "Get a user's wallet",
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Wallet data' } },
        },
      },
      '/admin/wallet/deduct': {
        post: {
          tags: ['Admin'],
          summary: 'Manually deduct from user wallet',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['user_id','amount'],
            properties: {
              user_id:     { type: 'string', format: 'uuid' },
              amount:      { type: 'number' },
              category:    { type: 'string', default: 'other' },
              description: { type: 'string', default: 'Admin manual deduction' },
            },
          }}}},
          responses: { 200: { description: 'Deducted' }, 400: { description: 'Insufficient balance' } },
        },
      },
      '/admin/book-ticket': {
        post: {
          tags: ['Admin'],
          summary: 'Ad-hoc ticket booking for any user',
          description: 'Creates request + booking + ticket + wallet deduction in one step.',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['user_id','travel_type','source','destination','travel_date','passenger_details','ticket_cost'],
            properties: {
              user_id:           { type: 'string', format: 'uuid' },
              travel_type:       { type: 'string', example: 'Flight' },
              source:            { type: 'string' },
              destination:       { type: 'string' },
              travel_date:       { type: 'string', format: 'date' },
              passenger_details: { type: 'string' },
              ticket_cost:       { type: 'number' },
            },
          }}}},
          responses: { 200: { description: 'Ticket booked, wallet deducted' } },
        },
      },
      '/admin/bookings': {
        get: {
          tags: ['Admin'],
          summary: 'List all bookings system-wide',
          responses: { 200: { description: 'All bookings with ticket and user details' } },
        },
      },
      '/admin/booking/{id}': {
        get: {
          tags: ['Admin'],
          summary: 'Get booking detail',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Booking detail' }, 404: { description: 'Not found' } },
        },
      },

      // ═══════════ DASHBOARD ═══════════
      '/dashboard': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get dashboard summary',
          description: 'Returns wallet, stats, pending count, recent transactions (8), recent requests (5), tier config, and expense breakdown.',
          responses: { 200: { description: 'Dashboard data' } },
        },
      },
      '/dashboard/tier': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get tier config for current user role',
          responses: { 200: { description: 'Tier config and expense limits' } },
        },
      },
      '/dashboard/tiers': {
        get: {
          tags: ['Dashboard'],
          summary: 'Get all tier configs',
          description: 'Super Admin, Manager, Finance only.',
          responses: { 200: { description: 'All tiers and limits' } },
        },
      },

      // ═══════════ DOCUMENTS ═══════════
      '/documents/{id}/download': {
        get: {
          tags: ['Documents'],
          summary: 'Download a document',
          description: 'Access: own documents, or admin/booking admin/manager/finance.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'File download' }, 403: { description: 'Access denied' }, 404: { description: 'Not found' } },
        },
      },
      '/documents/request/{requestId}': {
        get: {
          tags: ['Documents'],
          summary: 'List documents for a request',
          parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Document list' } },
        },
      },

      // ═══════════ FLIGHTS ═══════════
      '/flights/search': {
        post: {
          tags: ['Flights'],
          summary: 'Search flights',
          description: 'Booking Admin / Super Admin only.',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['source','destination','date'],
            properties: {
              source:      { type: 'string' },
              destination: { type: 'string' },
              date:        { type: 'string', format: 'date' },
              passengers:  { type: 'integer', default: 1 },
              travelClass: { type: 'string', default: 'Economy' },
            },
          }}}},
          responses: { 200: { description: 'Flight search results' } },
        },
      },
      '/flights/book-ticket': {
        post: {
          tags: ['Flights'],
          summary: 'Book a flight ticket',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['requestId','selectedFlight','fareType','price'],
            properties: {
              requestId:      { type: 'string' },
              selectedFlight: { type: 'object' },
              fareType:       { type: 'string' },
              price:          { type: 'number' },
            },
          }}}},
          responses: { 200: { description: 'Flight booked' } },
        },
      },

      // ═══════════ HOTELS ═══════════
      '/hotels/search': {
        post: {
          tags: ['Hotels'],
          summary: 'Search hotels',
          description: 'Booking Admin / Super Admin only.',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['city','checkIn','checkOut'],
            properties: {
              city:     { type: 'string' },
              checkIn:  { type: 'string', format: 'date' },
              checkOut: { type: 'string', format: 'date' },
              rooms:    { type: 'integer', default: 1 },
              guests:   { type: 'integer', default: 1 },
            },
          }}}},
          responses: { 200: { description: 'Hotel search results' } },
        },
      },
      '/hotels/book-hotel': {
        post: {
          tags: ['Hotels'],
          summary: 'Book a hotel',
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['requestId','hotel','checkIn','checkOut','totalPrice'],
            properties: {
              requestId:  { type: 'string' },
              hotel:      { type: 'object' },
              checkIn:    { type: 'string', format: 'date' },
              checkOut:   { type: 'string', format: 'date' },
              rooms:      { type: 'integer', default: 1 },
              totalPrice: { type: 'number' },
            },
          }}}},
          responses: { 200: { description: 'Hotel booked' } },
        },
      },
    },
  },
  apis: [], // all paths defined inline above
}

const swaggerSpec = swaggerJsdoc(options)

function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui { max-width: 1200px; margin: 0 auto; }
    `,
    customSiteTitle: 'Moiter Workz API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      tagsSorter: 'alpha',
      oauth2RedirectUrl: undefined,
      initOAuth: {
        usePkceWithAuthorizationCodeGrant: false,
      },
    },
  }))

  // Raw JSON spec
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })
}

module.exports = { setupSwagger }
