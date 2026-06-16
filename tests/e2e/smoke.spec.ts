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

test.describe('Smoke Tests - Public Pages', () => {
  test('should load the login page and display login fields', async ({ page }) => {
    // Navigate to the login page
    await page.goto('/login');

    // Assert that the page contains the expected headings
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText('Admin & Staff login')).toBeVisible();

    // Verify email and password input elements are present
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    // Verify the Sign In button is present
    const signInButton = page.getByRole('button', { name: /Sign in/i });
    await expect(signInButton).toBeVisible();
  });

  test('should load the public inquiry form and display initial fields', async ({ page }) => {
    // Navigate to the inquiry page
    await page.goto('/inquiry');

    // Wait for the form content to be visible
    await expect(page.getByText('Your Name')).toBeVisible();
    await expect(page.getByText('Name of Couple')).toBeVisible();
    await expect(page.getByText('Contact Number (WhatsApp Preferred)')).toBeVisible();

    // Verify input fields for step 1 are visible
    const yourNameInput = page.locator('input[placeholder="Enter your full name"]');
    const coupleNameInput = page.locator('input[placeholder="e.g. Aditi & Rohan"]');
    const contactInput = page.locator('input[placeholder="e.g. +1000000022"]');

    await expect(yourNameInput).toBeVisible();
    await expect(coupleNameInput).toBeVisible();
    await expect(contactInput).toBeVisible();

    // Verify the step transition button is visible
    const continueButton = page.getByRole('button', { name: /Continue to Function Details/i });
    await expect(continueButton).toBeVisible();
  });
});

test.describe('Full Business Flow E2E - Lead to Order and Payment', () => {
  let adminClient: SupabaseClient;
  let testUser: User;
  const testRunId = randomUUID();
  const adminEmail = `e2e-admin-${Date.now()}@example.com`;
  const adminPassword = 'TestPassword123!';
  let activeEvent: { id: string; name: string } | undefined;
  let activeService: { id: string; name: string } | undefined;
  let activeDeliverable: { id: string; title: string } | undefined;

  test.beforeAll(async () => {
    // Initialize admin supabase client
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

      // Reset rate limit entries for public-lead and login to prevent throttling in tests
      const { error: err1 } = await adminClient.from('rate_limits').delete().like('key', 'public-lead:%');
      const { error: err2 } = await adminClient.from('rate_limits').delete().like('key', 'login:%');
      if (err1 || err2) {
        console.error('E2E Setup: Failed to clear rate limits:', err1 || err2);
      }

      // Create a test admin user
      const { data: userData, error: authError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          role: 'admin',
          full_name: 'E2E Test Admin',
        },
      });

      if (authError || !userData.user) {
        throw new Error(authError?.message || 'Failed to create E2E admin user');
      }
      testUser = userData.user;

      // Ensure the profile is synced and role set to admin
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: testUser.id,
        email: adminEmail,
        full_name: 'E2E Test Admin',
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

  test('should submit a public inquiry, login as admin, convert lead to quotation, convert to order, and add payment', async ({ page }) => {
    test.skip(!activeEvent || !activeService, 'Requires active event and service in database');
    const event = activeEvent!;
    const service = activeService!;

    // --- Part 1: Submit Public Inquiry ---
    await page.goto('/inquiry');
    await page.context().addCookies([
      {
        name: 'test_run_id',
        value: testRunId,
        url: page.url(),
      },
    ]);

    // Fill Step 1
    await page.locator('label:has-text("Your Name") + input').fill('John Guest');
    await page.locator('label:has-text("Name of Couple") + input').fill('John and Jane');
    
    await page.locator('label:has-text("How did you come to know about us?") + select').selectOption('Our Instagram Page (First Story Films)');
    await page.locator('label:has-text("Contact Number") + input').fill('9876543210');
    await page.locator('label:has-text("Email") + input').fill('e2e-guest@example.com');
    await page.locator('label:has-text("Event Location") + input').fill('Jaipur');
    await page.locator('label:has-text("Wedding Date") + input').fill('2026-12-25');
    await page.locator('label:has-text("Wedding Venue") + input').fill('Rambagh Palace');

    await page.locator('label:has-text("Album Requirement") + select').selectOption('Yes');
    await page.locator('label:has-text("Drone Shoot Requirement") + select').selectOption('Yes');
    await page.locator('label:has-text("Shooting Side") + select').selectOption('Groom Side');
    await page.locator('label:has-text("Pre-Wedding Shoot") + select').selectOption('No');
    await page.locator('label:has-text("Number of Functions") + input').fill('1');

    await page.getByRole('button', { name: /Continue to Function Details/i }).click();

    // Fill Step 2
    await page.locator('label:has-text("Day Date") + input').fill('2026-12-25');
    await page.locator('label:has-text("First Event Name") + select').selectOption(event.id);
    await page.locator(`label:has-text("${service.name}")`).locator('input[type="checkbox"]').check();

    await page.getByRole('button', { name: /Continue/i }).click();

    // Fill Step 3
    await page.locator('label:has-text("Any other information to help customize deliverables?") + select').selectOption('no');
    await page.locator('label:has-text("Kindly note that the quotation will be drafted")').locator('input[type="checkbox"]').check();
    await page.locator('label:has-text("Budget Range") + select').selectOption('Rs. 1,00,000 - 1,25,000');

    try {
      await page.getByRole('button', { name: /Submit Inquiry/i }).click();
      // Verify Redirect to Success Page
      await page.waitForURL(/\/inquiry\/success/, { timeout: 8000 });
    } catch (err) {
      const dialogText = await page.locator('[role="dialog"]').allTextContents().catch(() => []);
      const alertModalText = await page.locator('.fixed').allTextContents().catch(() => []);
      console.error('SUBMISSION TIMEOUT DIAGNOSTICS:', { dialogText, alertModalText });
      await page.screenshot({ path: 'test-results/submission-failure.png' }).catch(() => {});
      throw err;
    }
    const successUrl = page.url();
    const createdLeadId = new URL(successUrl).searchParams.get('id');
    expect(createdLeadId).toBeTruthy();

    await expect(page.getByText('Your wedding inquiry has been submitted successfully.')).toBeVisible();

    // Clear context cookies to ensure we can log in freshly
    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: 'test_run_id',
        value: testRunId,
        url: page.url(),
      },
    ]);

    // --- Part 2: Login as Admin ---
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(adminEmail);
    await page.locator('input[type="password"]').fill(adminPassword);
    await page.getByRole('button', { name: /Sign in/i }).click();

    await page.waitForURL(/\/dashboard/);
    await expect(page.getByText('Pending Leads')).toBeVisible();

    // --- Part 3: Access Lead and Convert to Quotation ---
    await page.goto(`/leads/${createdLeadId}`);
    await expect(page.getByText('John and Jane')).toBeVisible();
    await expect(page.locator('select[aria-label="Lead status"]')).toHaveValue('pending');

    await page.getByRole('button', { name: /Convert to Quotation/i }).click();
    
    // Fill service counts in the Convert Modal
    await page.locator(`label:has-text("${service.name} Count") + input`).fill('2');
    
    if (activeDeliverable) {
      await page.getByRole('button', { name: /Select deliverables.../i }).click();
      await page.locator('div.absolute button', { hasText: activeDeliverable.title }).first().click();
      // Click the select button again to close the dropdown
      await page.getByRole('button', { name: `1 selected` }).click();
    }

    await page.locator('label:has-text("Quotation Amount") + input').fill('50000');
    await page.locator('button[type="submit"]:has-text("Convert to Quotation")').click();

    // Verify Redirect to Quotation Page
    await page.waitForURL(/\/quotations\//);
    const quotationUrl = page.url();
    const quotationId = quotationUrl.split('/').pop()?.split('?')[0];
    expect(quotationId).toBeTruthy();

    await expect(page.getByText('QUOTATION')).toBeVisible();
    await expect(page.getByText('Rs. 50,000')).toBeVisible();

    // Verify Quotation PDF download button is visible
    const quotePdfButton = page.locator('button:has(svg.lucide-file-text)').first();
    await expect(quotePdfButton).toBeVisible();

    // --- Part 4: Convert Quotation to Order ---
    await page.getByRole('button', { name: /Convert to Order/i }).click();

    await page.locator('label:has-text("Bill Type") + select').selectOption('non_gst');
    await page.locator('label:has-text("Order Amount before GST") + input').fill('50000');
    await page.locator('button[type="submit"]:has-text("Convert to Order")').click();

    // Verify Redirect to Order Page
    await page.waitForURL(/\/orders\//);
    const orderUrl = page.url();
    const orderId = orderUrl.split('/').pop()?.split('?')[0];
    expect(orderId).toBeTruthy();

    await expect(page.getByText('ORDER BOOKING')).toBeVisible();
    
    // Verify Order PDF download button is visible
    const orderPdfButton = page.locator('button:has(svg.lucide-file-text)').first();
    await expect(orderPdfButton).toBeVisible();

    // --- Part 5: Add Payment ---
    await page.getByRole('button', { name: /Add payment/i }).click();
    
    await page.locator('label:has-text("Payment amount") + input').fill('10000');
    await page.locator('label:has-text("Remarks") + textarea').fill('E2E Advance Payment');
    await page.locator('button:has-text("Add payment")').last().click();

    // Verify payment was recorded in the table
    await expect(page.getByText('E2E Advance Payment')).toBeVisible();
    await expect(page.getByText('10,000').first()).toBeVisible();

    // Verify Receipt PDF download button is visible in the payments table
    const receiptPdfButton = page.locator('table button:has(svg.lucide-file-text)').first();
    await expect(receiptPdfButton).toBeVisible();
  });
});
