# First Story Films

Wedding inquiry and business management system built with **Next.js**, **Supabase**, and **Vercel**.

## Features

- **Authentication** – Email/password, session-based, role-based access (Admin, Manager, Sales)
- **Public lead form** – Multi-step inquiry at `/inquiry` (no login)
- **Leads** – Public form leads, manual admin entry, convert to quotations
- **Quotations** – Create quotations from leads; service person counts, deliverables, and PDF export
- **Orders** – Convert quotations to orders; payments, production jobs, GST/non-GST billing, and agreement PDFs
- **Masters** – Manage Services, Events, Deliverables, Agencies, and Crew
- **Customers** – Auto-created from orders with order history and invoices
- **Accounting** – Income/expense entries, categories, and production expense sync
- **Settings** – Terms, agreement content, WhatsApp templates, and public form slug
- **PDF exports** – Download quotation PDFs, order agreement PDFs, and payment receipt PDFs

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL migrations in `supabase/migrations/` in the SQL Editor
3. Enable **Email** auth under Authentication → Providers
4. Create users in Authentication → Users. Set **User Metadata** for role:

```json
{ "role": "admin", "full_name": "Your Name" }
```

Valid roles: `admin`, `manager`, `sales`

### 2. Environment

Copy `.env.local.example` to `.env.local` and set your Supabase values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run locally

```bash
cd first-story-films
npm install
npm run dev
```

**Access the app:**
- Localhost: http://localhost:3000/login or http://127.0.0.1:3000/login
- Public form: http://localhost:3000/inquiry

### 4. Deploy (Vercel)

1. Push to GitHub and import in Vercel
2. Set the same environment variables
3. Set `NEXT_PUBLIC_APP_URL` to your production URL

## Role access

| Module        | Admin | Manager | Sales |
|---------------|-------|---------|-------|
| Dashboard     | ✓     | ✓       | ✓     |
| Masters       | ✓     | ✓       | —     |
| Leads         | ✓     | ✓       | ✓     |
| Quotations    | ✓     | ✓       | ✓     |
| Orders        | ✓     | ✓       | ✓     |
| Accounting    | ✓     | ✓       | —     |
| Customers     | ✓     | ✓       | —     |
| Settings      | ✓     | ✓       | —     |
| User Mgmt     | ✓     | —       | —     |

## Current status

- Core lead → quotation → order workflow is implemented
- GST/non-GST invoice support is available for orders
- PDF generation is available for quotations, order agreements, and payment receipts
- Accounting supports income/expense tracking and production expense sync
- Settings include agreement content

## Future work

- WhatsApp automation for lead notifications and invoice delivery
- Expanded production scheduling and assignment workflows

## Workflow

```
Public Form / Admin → Lead → Quotation → Order → Production → Complete
```
