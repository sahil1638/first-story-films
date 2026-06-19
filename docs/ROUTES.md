# Route Inventory

This document lists all available UI, API, authentication, and PDF generation routes in the **First Story Films** application.

---

## 1. UI Routes

### Public Routes

| Route | Description | Access |
|-------|-------------|--------|
| `/` | Root landing/redirect page. | Public |
| `/login` | Staff login page. | Public |
| `/auth/callback` | Supabase auth callback. | Public |
| `/inquiry` | Public multi-step lead inquiry form. | Public |
| `/inquiry/success` | Public inquiry completion page. | Public |
| `/robots.txt` | Generated crawler policy. | Public |
| `/sitemap.xml` | Generated sitemap. | Public |

### Dashboard Routes

All dashboard routes require an authenticated staff session.

| Route | Description | Admin | Manager | Sales |
|-------|-------------|-------|---------|-------|
| `/dashboard` | Business dashboard and aggregate totals. | Yes | Yes | Yes |
| `/leads` | Lead list and filters. | Yes | Yes | Yes |
| `/leads/new` | Manual lead creation. | Yes | Yes | Yes |
| `/leads/[id]` | Lead detail and conversion workflow. | Yes | Yes | Yes |
| `/quotations` | Quotation list. | Yes | Yes | Yes |
| `/quotations/[id]` | Quotation editor and conversion workflow. | Yes | Yes | Yes |
| `/quotations/[id]/print` | Printable quotation view. | Yes | Yes | Yes |
| `/orders` | Order list. | Yes | Yes | Yes |
| `/orders/[id]` | Order detail, payments, production, invoices. | Yes | Yes | Yes |
| `/orders/[id]/agreement` | Printable agreement view. | Yes | Yes | Yes |
| `/orders/[id]/payments/[paymentId]/receipt` | Printable receipt view. | Yes | Yes | Yes |
| `/masters/services` | Services master data. | Yes | Yes | No |
| `/masters/events` | Events master data. | Yes | Yes | No |
| `/masters/deliverables` | Deliverables master data. | Yes | Yes | No |
| `/masters/agencies` | Agencies master data. | Yes | Yes | No |
| `/masters/crew` | Crew master data. | Yes | Yes | No |
| `/accounting` | Accounts, categories, entries, and exports. | Yes | Yes | No |
| `/customers` | Customer list. | Yes | Yes | No |
| `/customers/[id]` | Customer detail. | Yes | Yes | No |
| `/settings` | Terms, agreement content, WhatsApp templates, public slug. | Yes | Yes | No |
| `/users` | User management and role repair. | Yes | No | No |

Source of truth: `src/lib/constants.ts` and `src/lib/auth/roles.ts`.

---

## 2. Authentication & Session Management

### `POST /api/auth/login`
* **Description:** Authenticates a user and starts a session.
* **Access Level:** Public / Unauthenticated
* **Rate Limits:** Max 5 requests, refilling at 5 attempts / 15 minutes per IP + email combination.
* **Request Body (JSON):**
  ```json
  {
    "email": "user@example.com",
    "password": "Password123!"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```
* **Error Responses:**
  * `400 Bad Request` — Validation failure (e.g. missing email/password).
  * `401 Unauthorized` — Invalid email or password.
  * `429 Too Many Requests` — Rate limit exceeded.

---

### `POST /api/auth/logout`
* **Description:** Ends the current user session and signs out.
* **Access Level:** Authenticated Users
* **Request Body:** None
* **Success Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

---

### `GET /auth/callback`
* **Description:** OAuth and Magic Link authentication callback handler.
* **Access Level:** Public / Unauthenticated
* **Query Parameters:**
  * `code` (string) — The temporary authorization code returned by Supabase Auth.
  * `next` (string, optional) — Safe redirect destination path.
* **Behavior:** exchanges code for a session and performs a redirect to the value of `next` (sanitized to prevent open redirect vulnerabilities).

---

## 3. Accounting Module

All accounting endpoints require a role of **Admin** or **Manager**. Attempting to access them as **Sales** will return a `403 Forbidden` status code. Unauthenticated requests will return a `401 Unauthorized` status code.

### Accounts Endpoints

#### `GET /api/accounting/accounts`
* **Description:** Retrieves a paginated list of accounts matching filters.
* **Access Level:** Admin, Manager
* **Query Parameters:**
  * `page` (number, default: `1`)
  * `limit` (number, default: `20`, max: `100`)
  * `status` (string, `active` | `inactive`)
  * `search` (string) — Searches account name.
  * `sortBy` (string) — Field to sort by.
  * `sortOrder` (string, `asc` | `desc`)
* **Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Cash on Hand",
        "status": "active",
        "balance": 15000.0,
        "created_at": "timestamp"
      }
    ],
    "count": 1
  }
  ```

#### `POST /api/accounting/accounts`
* **Description:** Creates a new accounting account.
* **Access Level:** Admin, Manager
* **Request Body (JSON):**
  ```json
  {
    "name": "Marketing Expense Fund",
    "openingBalance": 1000.0
  }
  ```
* **Success Response (200 OK):** Returns the newly created account object.

#### `GET /api/accounting/accounts/[id]`
* **Description:** Retrieves details of a specific account.
* **Access Level:** Admin, Manager
* **Success Response (200 OK):** Account object.

#### `PUT /api/accounting/accounts/[id]`
* **Description:** Updates the name or status of a specific account.
* **Access Level:** Admin, Manager
* **Request Body (JSON):**
  ```json
  {
    "name": "Updated Account Name",
    "status": "active"
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

#### `DELETE /api/accounting/accounts/[id]`
* **Description:** Deletes a specific account.
* **Access Level:** Admin, Manager
* **Success Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

#### `GET /api/accounting/accounts/export`
* **Description:** Exports the list of accounts as a CSV file.
* **Access Level:** Admin, Manager
* **Rate Limits:** Max 5 requests, refilling 1 token every 10 seconds.
* **Query Parameters:** Same filters as list endpoint (`search`, `status`, etc.).
* **Success Response (200 OK):** CSV attachment (`accounting-accounts.csv`). Output includes metadata headers and is capped at 1,000 rows.

---

### Categories Endpoints

#### `GET /api/accounting/categories`
* **Description:** Retrieves a paginated list of accounting categories.
* **Access Level:** Admin, Manager
* **Query Parameters:** Same pagination and sorting as accounts list.
* **Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Cinematography Equipment",
        "type": "expense",
        "status": "active"
      }
    ],
    "count": 1
  }
  ```

#### `POST /api/accounting/categories`
* **Description:** Creates a new accounting category.
* **Access Level:** Admin, Manager
* **Request Body (JSON):**
  ```json
  {
    "name": "Album Printing",
    "type": "expense"
  }
  ```
* **Success Response (200 OK):** Returns the newly created category object.

#### `GET /api/accounting/categories/[id]`
* **Description:** Retrieves details of a specific category.
* **Access Level:** Admin, Manager

#### `PUT /api/accounting/categories/[id]`
* **Description:** Updates a category.
* **Access Level:** Admin, Manager
* **Request Body (JSON):**
  ```json
  {
    "name": "Photo & Album Printing",
    "status": "active"
  }
  ```
* **Success Response (200 OK):** `{ "success": true }`

#### `DELETE /api/accounting/categories/[id]`
* **Description:** Deletes a category.
* **Access Level:** Admin, Manager
* **Success Response (200 OK):** `{ "success": true }`

#### `GET /api/accounting/categories/export`
* **Description:** Exports categories to a CSV.
* **Access Level:** Admin, Manager
* **Rate Limits:** Max 5 requests, refilling 1 token every 10 seconds.
* **Success Response (200 OK):** CSV attachment (`accounting-categories.csv`). Capped at 1,000 rows.

---

### Entries (Transactions) Endpoints

#### `GET /api/accounting/entries`
* **Description:** Retrieves paginated ledger transactions.
* **Access Level:** Admin, Manager
* **Query Parameters:**
  * Pagination filters (`page`, `limit`)
  * `type` (string, `income` | `expense` | `both`)
  * `accountId` (string, UUID)
  * `categoryId` (string, UUID)
  * `dateFrom` (string, ISO Date)
  * `dateTo` (string, ISO Date)
  * `search` (string) — Searches transaction remarks.
* **Success Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "type": "income",
        "account_id": "uuid",
        "category_id": "uuid",
        "amount": 25000.0,
        "entry_date": "2026-06-12",
        "remarks": "Retainer payment for Order FSF-2026-004"
      }
    ],
    "count": 1
  }
  ```

#### `POST /api/accounting/entries`
* **Description:** Submits a ledger entry transaction.
* **Access Level:** Admin, Manager
* **Request Body (JSON):**
  ```json
  {
    "type": "income",
    "accountId": "uuid",
    "categoryId": "uuid",
    "amount": 25000.0,
    "entryDate": "2026-06-12",
    "remarks": "Retainer payment"
  }
  ```
* **Success Response (200 OK):** Returns the created entry transaction object.

#### `GET /api/accounting/entries/[id]`
* **Description:** Retrieves a specific ledger transaction details.
* **Access Level:** Admin, Manager

#### `PUT /api/accounting/entries/[id]`
* **Description:** Updates transaction details.
* **Access Level:** Admin, Manager
* **Request Body (JSON):**
  ```json
  {
    "accountId": "uuid",
    "categoryId": "uuid",
    "amount": 25000.0,
    "entryDate": "2026-06-12",
    "remarks": "Updated Retainer payment description"
  }
  ```
* **Success Response (200 OK):** `{ "success": true }`

#### `DELETE /api/accounting/entries/[id]`
* **Description:** Deletes a transaction.
* **Access Level:** Admin, Manager
* **Success Response (200 OK):** `{ "success": true }`

#### `GET /api/accounting/entries/summary`
* **Description:** Retrieves aggregated totals (total income, total expense, balance) for accounts/categories matching the filters.
* **Access Level:** Admin, Manager
* **Query Parameters:** Same filtering parameters as `/api/accounting/entries`.
* **Success Response (200 OK):**
  ```json
  {
    "total_income": 50000.00,
    "total_expense": 12000.00,
    "net_balance": 38000.00
  }
  ```

#### `GET /api/accounting/entries/export`
* **Description:** Exports transactions to CSV.
* **Access Level:** Admin, Manager
* **Rate Limits:** Max 5 requests, refilling 1 token every 10 seconds.
* **Success Response (200 OK):** CSV attachment (`accounting-entries.csv`). Capped at 1,000 rows.

---

## 4. Master Data

### `POST /api/masters`
* **Description:** Upserts (creates or updates) master data records for various reference tables (e.g. services, events, deliverables, crew members, agencies).
* **Access Level:** Admin, Manager
* **Request Body (JSON):**
  ```json
  {
    "table": "services",
    "id": "uuid", // Nullable for new items
    "data": {
      "name": "Cinematography (4K)",
      "status": "active"
    },
    "serviceIds": [] // For agencies/crew members mapping
  }
  ```
* **Success Response (200 OK):**
  ```json
  {
    "id": "uuid",
    "success": true
  }
  ```

### `DELETE /api/masters`
* **Description:** Deletes a master data record.
* **Access Level:** Admin, Manager
* **Query Parameters:**
  * `table` (string) — Table name (e.g. `services`, `events`, `deliverables`, `crew_members`, `agencies`).
  * `id` (string, UUID) — Record ID.
* **Success Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

---

## 5. PDF Generation & Downloads

PDF endpoints support the **Admin**, **Manager**, and **Sales** roles. 
All PDF downloads have rate limits and are rendered via Puppeteer. Renditions are cached using the resource's `updated_at` timestamp.

### `GET /api/quotations/[id]/pdf`
* **Description:** Generates and downloads a quotation PDF.
* **Access Level:** Admin, Manager, Sales
* **Rate Limits:** Max 5 requests, refilling at 0.2/sec per user. Cache miss rendering limit is capped at 10 requests, refilling at 0.5/sec.
* **Success Response (200 OK):** Binary PDF stream (`quotation-[first-8-chars-of-uuid].pdf`).

### `GET /api/orders/[id]/pdf`
* **Description:** Generates and downloads a wedding order agreement PDF.
* **Access Level:** Admin, Manager, Sales
* **Rate Limits:** Max 5 requests, refilling at 0.2/sec per user. Cache miss rendering limit is capped at 10 requests, refilling at 0.5/sec.
* **Success Response (200 OK):** Binary PDF stream (`wedding-order-agreement-[first-8-chars-of-uuid].pdf`).

### `GET /api/orders/[id]/payments/[paymentId]/receipt/pdf`
* **Description:** Generates and downloads a payment receipt PDF.
* **Access Level:** Admin, Manager, Sales
* **Rate Limits:** Max 5 requests, refilling at 0.2/sec per user. Cache miss rendering limit is capped at 10 requests, refilling at 0.5/sec.
* **Success Response (200 OK):** Binary PDF stream (`payment-receipt-[receipt-number].pdf`).

---

## 6. System Maintenance

### `GET /api/maintenance/reconcile`
* **Description:** Reconciles drifted role mappings between Supabase auth metadata role definitions and application profiles tables.
* **Access Level:** Admin (using session cookie) OR Service Role Cron (using Bearer Token)
* **Headers:**
  * `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (if triggering via service cron)
* **Success Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Reconciliation completed. Reconciled 2 drifting user roles.",
    "reconciled_count": 2
  }
  ```

---

## 7. Related Documentation

- [API Reference](./API.md)
- [Security Matrix](./SECURITY_MATRIX.md)
- [Incident Response Runbook](./INCIDENT_RESPONSE.md)
- [Backup And Restore Procedure](./BACKUP_RESTORE.md)
- [Accessibility Checklist](./ACCESSIBILITY_CHECKLIST.md)
