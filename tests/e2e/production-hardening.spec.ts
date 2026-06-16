import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Load environment variables manually from .env.local if not already defined
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach((line) => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
        }
      });
    }
  } catch {
    // Ignore local env loading errors.
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('Production Hardening Pass — Detailed E2E Coverage', () => {
  let adminClient: SupabaseClient;
  let testUser: User;
  const testRunId = randomUUID();
  const adminEmail = `e2e-hardened-admin-${Date.now()}@example.com`;
  const adminPassword = 'HardenedPassword123!';
  
  let activeEvent: { id: string; name: string } | undefined;
  let activeService: { id: string; name: string } | undefined;
  let activeDeliverable: { id: string; title: string } | undefined;

  test.beforeAll(async () => {
    if (supabaseUrl && serviceRoleKey) {
      adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });

      // Fetch active event, service, deliverable
      const { data: events } = await adminClient.from('events').select('id, name').eq('status', 'active').limit(1);
      const { data: services } = await adminClient.from('services').select('id, name').eq('status', 'active').limit(1);
      const { data: deliverables } = await adminClient.from('deliverables').select('id, title').limit(1);

      activeEvent = events?.[0];
      activeService = services?.[0];
      activeDeliverable = deliverables?.[0];

      // Clear rate limit entries for local E2E run
      await adminClient.from('rate_limits').delete().like('key', 'public-lead:%');
      await adminClient.from('rate_limits').delete().like('key', 'login:%');

      // Create a test admin user
      const { data: userData, error: authError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          role: 'admin',
          full_name: 'Hardened E2E Admin',
        },
      });

      if (authError || !userData.user) {
        throw new Error(authError?.message || 'Failed to create E2E admin user');
      }
      testUser = userData.user;

      // Sync user profile to admin
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: testUser.id,
        email: adminEmail,
        full_name: 'Hardened E2E Admin',
        role: 'admin',
        test_run_id: testRunId,
        created_by_test: true,
      });

      if (profileError) {
        throw new Error(profileError.message || 'Failed to upsert admin profile');
      }
    }
  });

  test.afterAll(async () => {
    if (adminClient) {
      // Run the database-level cleanup RPC
      const { error: cleanupError } = await adminClient.rpc('cleanup_test_data', {
        p_test_run_id: testRunId,
      });
      if (cleanupError) {
        console.error('E2E Cleanup: Failed to clean up test data:', cleanupError);
      }

      if (testUser) {
        // Cleanup the test user
        await adminClient.auth.admin.deleteUser(testUser.id);
        await adminClient.from('profiles').delete().eq('id', testUser.id);
      }
    }
  });

  test('should execute complete business flow and verify PDF reachability', async ({ page }) => {
    test.setTimeout(90000);
    test.skip(!activeEvent || !activeService, 'Requires active event and service in database');
    const event = activeEvent!;
    const service = activeService!;

    // --- 1. Public Inquiry Submission ---
    await page.goto('/inquiry');
    await page.context().addCookies([
      {
        name: 'test_run_id',
        value: testRunId,
        url: page.url(),
      },
    ]);
    await expect(page.getByText('Your Name')).toBeVisible();

    await page.locator('label:has-text("Your Name") + input').fill('Hardened Customer');
    await page.locator('label:has-text("Name of Couple") + input').fill('Hardened & Tested');
    await page.locator('label:has-text("How did you come to know about us?") + select').selectOption('Our Instagram Page (First Story Films)');
    await page.locator('label:has-text("Contact Number") + input').fill('9876543200');
    await page.locator('label:has-text("Email") + input').fill('e2e-hardened@example.com');
    await page.locator('label:has-text("Event Location") + input').fill('Udaipur');
    await page.locator('label:has-text("Wedding Date") + input').fill('2026-11-20');
    await page.locator('label:has-text("Wedding Venue") + input').fill('Jagmandir Island Palace');

    await page.locator('label:has-text("Album Requirement") + select').selectOption('Yes');
    await page.locator('label:has-text("Drone Shoot Requirement") + select').selectOption('Yes');
    await page.locator('label:has-text("Shooting Side") + select').selectOption('Bride Side');
    await page.locator('label:has-text("Pre-Wedding Shoot") + select').selectOption('Only Photography');
    await page.locator('label:has-text("Number of Functions") + input').fill('1');

    await page.getByRole('button', { name: /Continue to Function Details/i }).click();

    // Fill Step 2
    await page.locator('label:has-text("Day Date") + input').fill('2026-11-20');
    await page.locator('label:has-text("First Event Name") + select').selectOption(event.id);
    await page.locator(`label:has-text("${service.name}")`).locator('input[type="checkbox"]').check();

    await page.getByRole('button', { name: /Continue/i }).click();

    // Fill Step 3
    await page.locator('label:has-text("Any other information to help customize deliverables?") + select').selectOption('no');
    await page.locator('label:has-text("Kindly note that the quotation will be drafted")').locator('input[type="checkbox"]').check();
    await page.locator('label:has-text("Budget Range") + select').selectOption('Rs. 1,00,000 - 1,25,000');

    await page.getByRole('button', { name: /Submit Inquiry/i }).click();
    await page.waitForURL(/\/inquiry\/success/, { timeout: 8000 });
    
    const successUrl = page.url();
    const createdLeadId = new URL(successUrl).searchParams.get('id');
    expect(createdLeadId).toBeTruthy();
    await expect(page.getByText('Your wedding inquiry has been submitted successfully.')).toBeVisible();

    // Clear context cookies to login freshly
    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: 'test_run_id',
        value: testRunId,
        url: page.url(),
      },
    ]);

    // --- 2. Authentication Flow ---
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(adminEmail);
    await page.locator('input[type="password"]').fill(adminPassword);
    await page.getByRole('button', { name: /Sign in/i }).click();

    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText('Pending Leads')).toBeVisible();

    // --- 3. Lead Workflow (Lead to Quotation) ---
    await page.goto(`/leads/${createdLeadId}`);
    await expect(page.getByText('Hardened & Tested')).toBeVisible();
    await page.getByRole('button', { name: /Convert to Quotation/i }).click();
    
    // Convert Modal inputs
    await page.locator(`label:has-text("${service.name} Count") + input`).fill('1');
    if (activeDeliverable) {
      await page.getByRole('button', { name: /Select deliverables.../i }).click();
      await page.locator('div.absolute button', { hasText: activeDeliverable.title }).first().click();
      await page.getByRole('button', { name: `1 selected` }).click();
    }

    await page.locator('label:has-text("Quotation Amount") + input').fill('60000');
    await page.locator('button[type="submit"]:has-text("Convert to Quotation")').click();

    // Wait for quotation details page
    await page.waitForURL(/\/quotations\//);
    const quotationUrl = page.url();
    const quotationId = quotationUrl.split('/').pop()?.split('?')[0];
    expect(quotationId).toBeTruthy();

    await expect(page.getByText('QUOTATION')).toBeVisible();
    await expect(page.getByText('Rs. 60,000')).toBeVisible();

    // Verify Quotation PDF download button is visible
    const quotePdfButton = page.locator('button:has(svg.lucide-file-text)').first();
    await expect(quotePdfButton).toBeVisible();

    // --- 4. Order/Payment Workflow ---
    await page.getByRole('button', { name: /Convert to Order/i }).click();
    await page.locator('label:has-text("Bill Type") + select').selectOption('non_gst');
    await page.locator('label:has-text("Order Amount before GST") + input').fill('60000');
    await page.locator('button[type="submit"]:has-text("Convert to Order")').click();

    await page.waitForURL(/\/orders\//);
    const orderUrl = page.url();
    const orderId = orderUrl.split('/').pop()?.split('?')[0];
    expect(orderId).toBeTruthy();

    await expect(page.getByText('ORDER BOOKING')).toBeVisible();
    
    // Verify Order PDF download button is visible
    const orderPdfButton = page.locator('button:has(svg.lucide-file-text)').first();
    await expect(orderPdfButton).toBeVisible();

    // Trigger Add Payment Modal
    await page.getByRole('button', { name: /Add payment/i }).click();
    
    // Verify Payment Modal is visible
    await expect(page.locator('label:has-text("Payment amount")')).toBeVisible();
    await page.locator('label:has-text("Payment amount") + input').fill('15000');
    await page.locator('label:has-text("Remarks") + textarea').fill('E2E Hardened Deposit');
    await page.locator('button:has-text("Add payment")').last().click();

    // Verify payment was recorded in the table
    await expect(page.getByText('E2E Hardened Deposit')).toBeVisible();

    // Verify Receipt PDF download button is visible
    const receiptPdfButton = page.locator('table button:has(svg.lucide-file-text)').first();
    await expect(receiptPdfButton).toBeVisible();

    // --- 5. PDF Workflow Endpoint Reachability Validation ---
    // Fetch quotation PDF directly
    const quotePdfResponse = await page.request.get(`/api/quotations/${quotationId}/pdf`);
    expect(quotePdfResponse.status()).toBe(200);
    expect(quotePdfResponse.headers()['content-type']).toBe('application/pdf');

    // Fetch order PDF directly
    const orderPdfResponse = await page.request.get(`/api/orders/${orderId}/pdf`);
    expect(orderPdfResponse.status()).toBe(200);
    expect(orderPdfResponse.headers()['content-type']).toBe('application/pdf');

    // Fetch the payment ID from the database using adminClient to construct receipt URL
    const { data: payments, error: paymentFetchError } = await adminClient
      .from('payments')
      .select('id')
      .eq('order_id', orderId);

    expect(paymentFetchError).toBeNull();
    expect(payments).toBeTruthy();
    expect(payments!.length).toBeGreaterThan(0);

    const paymentId = payments![0].id;

    // Fetch receipt PDF directly
    const receiptPdfResponse = await page.request.get(`/api/orders/${orderId}/payments/${paymentId}/receipt/pdf`);
    expect(receiptPdfResponse.status()).toBe(200);
    expect(receiptPdfResponse.headers()['content-type']).toBe('application/pdf');
  });
});
