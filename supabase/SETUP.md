# Supabase setup – First Story Films

Follow these steps in order.

---

## Step 1: Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Choose organization, name (e.g. `first-story-films`), database password, region
4. Wait until the project status is **Active**

---   

## Step 2: Run the database migration

1. In the dashboard, open **SQL Editor** → **New query**
2. Open this file on your computer:  
   `first-story-films/supabase/migrations/001_initial_schema.sql`
3. Copy **all** contents and paste into the SQL Editor
4. Click **Run**

You should see **Success**. This creates tables, triggers, RLS policies, and default settings.

**If you get an error about `uuid-ossp`:** run this first, then run the migration again:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## Step 3: (Optional) Add sample master data

In SQL Editor, run `supabase/seed.sql` so the public inquiry form has Events & Services dropdowns.

---

## Step 4: Enable email authentication

1. **Authentication** → **Providers**
2. Open **Email**
3. Enable **Email** provider
4. For local testing you can turn off **Confirm email** (Authentication → Providers → Email → Confirm email off)

---

## Step 5: Create your first admin user

### Option A – Dashboard (recommended)

1. **Authentication** → **Users** → **Add user** → **Create new user**
2. Enter email and password
3. Under **User Metadata**, paste:

```json
{
  "role": "admin",
  "full_name": "Admin User"
}
```

4. Save

The trigger `handle_new_user` automatically creates a row in `profiles` with role `admin`.

### Option B – User already exists without metadata

Run in SQL Editor (replace email):

```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role":"admin","full_name":"Admin User"}'::jsonb
WHERE email = 'you@example.com';

UPDATE public.profiles
SET role = 'admin', full_name = 'Admin User'
WHERE email = 'you@example.com';
```

### Roles

| Role      | Use for                          |
|-----------|----------------------------------|
| `admin`   | Full access + User Management    |
| `manager` | Masters, accounting, customers   |
| `sales`   | Dashboard, leads, quotes, orders |

---

## Step 6: Connect the Next.js app

1. In Supabase: **Project Settings** → **API**
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. In `first-story-films`, create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is optional for this app (not required for normal use).

4. Start the app:

```bash
cd first-story-films
npm run dev
```

5. Test:
   - **Localhost:** http://localhost:3000/login or http://127.0.0.1:3000/login  
   - **Local Network:** `http://<YOUR_LOCAL_IP>:3000/login` (e.g., `http://192.168.1.100:3000`)
     - Find your IP: Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux), use the IPv4 address  
   - Public form: http://localhost:3000/inquiry  

---

## Step 7: Verify setup

Run in SQL Editor:

```sql
SELECT * FROM settings;
SELECT * FROM profiles;
SELECT * FROM services;
```

You should see default settings keys, your admin profile, and seed services (if you ran `seed.sql`).

---

## Production (Vercel)

Add the same three env vars in Vercel → Project → Settings → Environment Variables.

Set `NEXT_PUBLIC_APP_URL` to your live URL (e.g. `https://your-app.vercel.app`).

In Supabase → Authentication → URL configuration, add:

- **Site URL:** your production URL  
- **Redirect URLs:**  
  - `http://localhost:3000/**`  
  - `https://your-app.vercel.app/**`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **Database error creating new user** | Run `migrations/002_fix_auth_user_trigger.sql`. Ensure `001_initial_schema.sql` ran first. Use metadata below (lowercase `admin`). |
| Login works but redirects back to login | Check `.env.local` URL and anon key match the project |
| Public form: **RLS policy for table leads** | Restart `npm run dev`. Ensure `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local`. Optionally run `003_fix_public_lead_rls.sql`. |
| Public form: “Failed to create lead” | Re-run migration; confirm RLS policies exist on `leads` |
| Public form: empty Events/Services | Run `seed.sql` or add rows in Masters after login |
| Logged in as admin but shows **sales** | Run `fix_admin_role.sql` (replace email). Metadata must be lowercase `"admin"`. Sign out and sign in again. |
| User has wrong menu / access | Set `role` in user metadata and update `profiles.role` |
| `role` cast error on signup | Metadata must be exactly `"admin"`, `"manager"`, or `"sales"` (lowercase) |

---

## Security note

RLS allows any **authenticated** user full DB access; the app enforces roles in middleware. For stricter production security, add role-based RLS policies later.
