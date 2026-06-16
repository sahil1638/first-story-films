# Supabase RPC-Backed Flows Reference Guide

Certain flows in the application are implemented as database-level RPC functions (stored procedures) rather than client-side JS queries. This guide documents those flows, their purposes, and why they must be RPC-backed.

---

## DAL Boundary

Production Supabase data access must go through one of these locations:

- `src/lib/data/**` for server-only Data Access Layer modules.
- `src/lib/supabase/**` for low-level Supabase client construction.

The lint configuration enforces this boundary with restricted imports. The following are explicit, narrow exceptions and must not be used as general-purpose data access paths:

- Auth callback route: exchanges OAuth/email callback codes for sessions.
- Login/logout routes: perform Supabase Auth sign-in/sign-out only.
- `src/proxy.ts`: refreshes the request session through Supabase middleware.
- `src/lib/security/rate-limit.ts`: calls the rate-limit RPC through the service-role client.
- Tests: integration/security tests may create direct Supabase clients against a test database.

If a new feature needs application data, add a DAL function first and call that from Server Components, Server Actions, or Route Handlers.

---

## 1. Accounting Mutations (Cascading Updates & Deletions)

### RPC: `update_accounting_entry_cascade`
- **Triggered by:** `updateEntry` action / DAL.
- **Execute permissions:** `PUBLIC`, `anon`, and broad inherited grants are revoked in migration `030_lock_accounting_rpc_execute_grants.sql`; only the `authenticated` role receives `EXECUTE`.
- **Authorization:** The function still performs an internal `current_user_role()` check and only permits `admin` or `manager`.
- **Why it must be RPC-backed:**
  Updating an accounting entry that was automatically generated from an order payment or a production job requires updating the linked record (`payments` or `production_jobs`) and re-calculating/synchronizing the order's financial totals (`paid_amount`, `payment_status`). Doing this in multiple queries from JS can lead to race conditions, partial updates, and data inconsistencies. An RPC executes in a single database transaction, ensuring atomicity and ACID compliance.
- **Parameters:**
  - `entry_id` (UUID)
  - `new_amount` (NUMERIC)
  - `new_entry_date` (DATE)
  - `new_remarks` (TEXT)

### RPC: `delete_accounting_entry_cascade`
- **Triggered by:** `deleteEntry` action / DAL.
- **Execute permissions:** `PUBLIC`, `anon`, and broad inherited grants are revoked in migration `030_lock_accounting_rpc_execute_grants.sql`; only the `authenticated` role receives `EXECUTE`.
- **Authorization:** The function still performs an internal `current_user_role()` check and only permits `admin` or `manager`.
- **Why it must be RPC-backed:**
  Deleting a payment-linked or job-linked accounting entry must automatically delete the corresponding payment/job record and re-calculate the order's financial statistics. Using an RPC ensures both deletion operations succeed or rollback together in a single transaction.
- **Parameters:**
  - `entry_id` (UUID)

---

## 2. Order Mutations (Payments & Production Jobs)

### RPC: `add_order_payment`
- **Triggered by:** `addPayment` action / DAL.
- **Why it must be RPC-backed:**
  Adding a payment requires:
  1. Creating a receipt number.
  2. Inserting a record in the `payments` table.
  3. Inserting a corresponding record in `accounting_entries` under the "income" category.
  4. Updating the parent order's `paid_amount` and `payment_status`.
  This is a multi-table write transaction that must be fully atomic.
- **Parameters:**
  - `order_id` (UUID)
  - `amount` (NUMERIC)
  - `payment_date` (DATE)
  - `notes` (TEXT)
  - `created_by_user` (UUID)

### RPC: `delete_order_payment`
- **Triggered by:** `deletePayment` action / DAL.
- **Why it must be RPC-backed:**
  Deleting a payment must delete its corresponding accounting entry and update the parent order's totals.
- **Parameters:**
  - `payment_id` (UUID)
  - `order_id` (UUID)

### RPC: `update_order_payment`
- **Triggered by:** `updatePayment` action / DAL.
- **Why it must be RPC-backed:**
  Updating a payment's amount or date must update its corresponding accounting entry and recalculate the parent order's totals in a single transaction.
- **Parameters:**
  - `payment_id` (UUID)
  - `order_id` (UUID)
  - `amount` (NUMERIC)
  - `payment_date` (DATE)
  - `notes` (TEXT)

### RPC: `add_production_job`
- **Triggered by:** `addProductionJob` action / DAL.
- **Why it must be RPC-backed:**
  Adding a production job requires inserting a job record and a corresponding "expense" accounting entry.
- **Parameters:**
  - `order_id` (UUID)
  - `agency_id` (UUID)
  - `service_id` (UUID)
  - `payable_amount` (NUMERIC)
  - `created_by_user` (UUID)

### RPC: `update_production_job`
- **Triggered by:** `updateProductionJob` action / DAL.
- **Why it must be RPC-backed:**
  Updating a production job's payable amount must update the corresponding accounting entry.
- **Parameters:**
  - `job_id` (UUID)
  - `order_id` (UUID)
  - `agency_id` (UUID)
  - `service_id` (UUID)
  - `payable_amount` (NUMERIC)
  - `status` (TEXT)

### RPC: `delete_production_job`
- **Triggered by:** `deleteProductionJob` action / DAL.
- **Why it must be RPC-backed:**
  Deleting a production job must delete its corresponding accounting entry.
- **Parameters:**
  - `job_id` (UUID)
  - `order_id` (UUID)

### RPC: `delete_order_cascade`
- **Triggered by:** `deleteOrder` action / DAL.
- **Why it must be RPC-backed:**
  Deleting an order requires cascading deletions across multiple dependent tables: `order_services`, `order_service_allocations`, `production_jobs`, `payments`, `accounting_entries` (linked to the order), and `invoices`. Performing this sequentially from client-side JS is slow and susceptible to network failures causing orphaned rows.
- **Parameters:**
  - `order_id` (UUID)

---

## 3. Conversions

### RPC: `convert_lead_to_quotation`
- **Triggered by:** `convertLeadToQuotation` action / DAL.
- **Why it must be RPC-backed:**
  Converting a lead to a quotation involves reading lead details, function days, and services, then inserting records into `quotations`, `quotation_function_days`, `quotation_function_day_services`, `quotation_service_persons`, and `quotation_deliverables`, and updating the lead's status to "converted".
- **Parameters:**
  - `lead_id` (UUID)
  - `amount` (NUMERIC)
  - `service_persons` (JSONB array)
  - `deliverable_ids` (UUID array)
  - `created_by_user` (UUID)

### RPC: `convert_quotation_to_order`
- **Triggered by:** `convertQuotationToOrder` action / DAL.
- **Why it must be RPC-backed:**
  Converting a quotation to an order copies all event requirements, function days, services, service persons, and deliverables, creating an `orders` record and its dependencies. It also marks the quotation status as "converted".
- **Parameters:**
  - `quotation_id` (UUID)
  - `subtotal` (NUMERIC)
  - `invoice_type` (TEXT)
  - `service_persons` (JSONB array)
  - `deliverable_ids` (UUID array)
  - `created_by_user` (UUID)

---

## 4. Rate Limiting

### RPC: `check_rate_limit`
- **Triggered by:** Public lead creation rate limiter.
- **Why it must be RPC-backed:**
  Rate limiting requires atomic reading and updating of token bucket logs for a given IP. Storing and checking these logs directly in the DB via RPC guarantees concurrency-safe checks without client-side race conditions.
- **Parameters:**
  - `limit_key` (TEXT)
  - `max_tokens` (NUMERIC)
  - `refill_rate_per_sec` (NUMERIC)
  - `cost` (NUMERIC)
