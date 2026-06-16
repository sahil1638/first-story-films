import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { testRunId, cleanupTestData } from "./test-cleanup";

vi.mock("server-only", () => ({}));

let testSupabaseClient: SupabaseClient | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => testSupabaseClient),
}));
import fs from "fs";
import path from "path";
import { getAccounts, getAccountById } from "@/lib/data/accounting";

// Load environment variables manually from .env.local if not already defined
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split("\n").forEach((line) => {
        const parts = line.split("=");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join("=").trim();
          process.env[key] = value;
        }
      });
    }
  } catch {
    // Ignore error
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type TestRecord = {
  id: string;
  [key: string]: unknown;
};

const isCi = process.env.CI === "true";
let integrationReady = false;
let integrationSkipReason = "";

function requireIntegrationReady() {
  if (integrationReady) return true;
  const msg = `Skipping accounting integration test: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

describe("Accounting Transactional Mutations Integration Tests", () => {
  let adminClient!: SupabaseClient;
  let managerClient!: SupabaseClient;
  let salesClient!: SupabaseClient;

  let managerUser!: User;
  let salesUser!: User;

  let testAccount!: TestRecord;
  let testCategoryIncome!: TestRecord;
  let testCategoryExpense!: TestRecord;
  let testQuotation!: TestRecord;
  let testOrder!: TestRecord;
  let testService!: TestRecord;
  let testAgency!: TestRecord;

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(supabaseAnonKey).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    try {
      const rawAdminClient = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false },
      });

      // Wrap adminClient in Proxy to automatically append test_run_id and created_by_test to inserts/upserts
      adminClient = new Proxy(rawAdminClient, {
        get(target, prop, receiver) {
          if (prop === "from") {
            return (table: string) => {
              const queryBuilder = target.from(table);
              const originalInsert = queryBuilder.insert.bind(queryBuilder);
              const originalUpsert = queryBuilder.upsert.bind(queryBuilder);

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              queryBuilder.insert = (values: any, options?: any) => {
                if (Array.isArray(values)) {
                  values = values.map(v => ({
                    ...v,
                    test_run_id: testRunId,
                    created_by_test: true,
                  }));
                } else if (typeof values === "object" && values !== null) {
                  values = {
                    ...values,
                    test_run_id: testRunId,
                    created_by_test: true,
                  };
                }
                return originalInsert(values, options);
              };

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              queryBuilder.upsert = (values: any, options?: any) => {
                if (Array.isArray(values)) {
                  values = values.map(v => ({
                    ...v,
                    test_run_id: testRunId,
                    created_by_test: true,
                  }));
                } else if (typeof values === "object" && values !== null) {
                  values = {
                    ...values,
                    test_run_id: testRunId,
                    created_by_test: true,
                  };
                }
                return originalUpsert(values, options);
              };

              return queryBuilder;
            };
          }
          return Reflect.get(target, prop, receiver);
        }
      });

    // 1. Create temporary test users
    const managerEmail = `test-manager-${Date.now()}@example.com`;
    const salesEmail = `test-sales-${Date.now()}@example.com`;
    const password = "TestPassword123!";

    const { data: mUser, error: mErr } = await adminClient.auth.admin.createUser({
      email: managerEmail,
      password,
      email_confirm: true,
      app_metadata: { role: "manager" },
      user_metadata: { role: "manager" },
    });
    if (mErr) throw mErr;
    managerUser = mUser.user;

    // Manually force profiles table sync to ensure the DB-backed current_user_role() evaluates correctly
    const { error: mProfErr } = await adminClient.from("profiles").upsert({
      id: managerUser.id,
      email: managerEmail,
      role: "manager",
    });
    if (mProfErr) throw mProfErr;

    const { data: sUser, error: sErr } = await adminClient.auth.admin.createUser({
      email: salesEmail,
      password,
      email_confirm: true,
      app_metadata: { role: "sales" },
      user_metadata: { role: "sales" },
    });
    if (sErr) throw sErr;
    salesUser = sUser.user;

    const { error: sProfErr } = await adminClient.from("profiles").upsert({
      id: salesUser.id,
      email: salesEmail,
      role: "sales",
    });
    if (sProfErr) throw sProfErr;

    // 2. Sign in user clients
    managerClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false },
    });
    const { error: mSignInErr } = await managerClient.auth.signInWithPassword({
      email: managerEmail,
      password,
    });
    if (mSignInErr) throw mSignInErr;

    salesClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false },
    });
    const { error: sSignInErr } = await salesClient.auth.signInWithPassword({
      email: salesEmail,
      password,
    });
    if (sSignInErr) throw sSignInErr;

    // 3. Setup core database records (using admin privilege)
    const { data: account, error: accErr } = await adminClient
      .from("accounting_accounts")
      .insert({ name: `Test Account ${Date.now()}`, opening_balance: 5000, status: "active" })
      .select()
      .single();
    if (accErr) throw accErr;
    testAccount = account;

    const { data: catInc, error: catIncErr } = await adminClient
      .from("accounting_categories")
      .insert({ name: `Test Income Cat ${Date.now()}`, type: "income", status: "active" })
      .select()
      .single();
    if (catIncErr) throw catIncErr;
    testCategoryIncome = catInc;

    const { data: catExp, error: catExpErr } = await adminClient
      .from("accounting_categories")
      .insert({ name: `Test Expense Cat ${Date.now()}`, type: "expense", status: "active" })
      .select()
      .single();
    if (catExpErr) throw catExpErr;
    testCategoryExpense = catExp;

    const { data: quotation, error: quoteErr } = await adminClient
      .from("quotations")
      .insert({
        couple_name: "Test Couple",
        your_name: "Test User",
        contact_number: "9876543210",
        wedding_date: "2026-06-20",
        wedding_venue: "Test Venue",
        budget_range: "50k-100k",
        event_location: "Test Location",
        album_requirement: "yes",
        drone_requirement: "yes",
        shooting_side: "both",
        pre_wedding_shoot: "yes",
        functions_count: 1,
        status: "pending",
      })
      .select()
      .single();
    if (quoteErr) throw quoteErr;
    testQuotation = quotation;

    const { data: order, error: orderErr } = await adminClient
      .from("orders")
      .insert({
        quotation_id: testQuotation.id,
        couple_name: "Test Couple",
        your_name: "Test User",
        contact_number: "9876543210",
        wedding_date: "2026-06-20",
        wedding_venue: "Test Venue",
        event_location: "Test Location",
        budget_range: "50k-100k",
        subtotal_amount: 1000,
        gst_rate: 0,
        gst_amount: 0,
        total_amount: 1000,
        paid_amount: 0,
        payment_status: "unpaid",
        status: "pending",
      })
      .select()
      .single();
    if (orderErr) throw orderErr;
    testOrder = order;

    const { data: service, error: srvErr } = await adminClient
      .from("services")
      .insert({ name: `Test Service ${Date.now()}`, status: "active" })
      .select()
      .single();
    if (srvErr) throw srvErr;
    testService = service;

    const { data: agency, error: agcErr } = await adminClient
      .from("agencies")
      .insert({
        company_name: `Test Agency ${Date.now()}`,
        person_name: "Test Person",
        contact_number: "9876543210",
        status: "active",
      })
      .select()
      .single();
    if (agcErr) throw agcErr;
      testAgency = agency;
      integrationReady = true;
    } catch (error) {
      if (isCi) {
        throw error;
      }
      integrationSkipReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe("update_accounting_entry_cascade RPC", () => {
    it("should allow a manager to update a payment-linked accounting entry, updating linked payment and order totals", async () => {
      if (!requireIntegrationReady()) return;
      // 1. Create a linked payment and accounting entry
      const { data: payment, error: payErr } = await adminClient
        .from("payments")
        .insert({
          order_id: testOrder.id,
          amount: 200,
          payment_date: "2026-06-11",
          receipt_number: `RCP-TEST-${Date.now()}`,
        })
        .select()
        .single();
      expect(payErr).toBeNull();

      const { data: entry, error: entErr } = await adminClient
        .from("accounting_entries")
        .insert({
          type: "income",
          account_id: testAccount.id,
          category_id: testCategoryIncome.id,
          amount: 200,
          entry_date: "2026-06-11",
          source: "order_payment",
          source_id: payment.id,
        })
        .select()
        .single();
      expect(entErr).toBeNull();

      // Sync order paid_amount
      await adminClient
        .from("orders")
        .update({ paid_amount: 200, payment_status: "partial_paid" })
        .eq("id", testOrder.id);

      // 2. Perform update using manager client
      const { data: rpcResult, error: rpcErr } = await managerClient.rpc("update_accounting_entry_cascade", {
        entry_id: entry.id,
        new_amount: 400,
        new_entry_date: "2026-06-12",
        new_remarks: "Updated notes",
      });
      expect(rpcErr).toBeNull();
      expect(rpcResult).toBeDefined();

      // Verify returning values match expected metadata
      const row = rpcResult[0];
      expect(row.out_order_id).toBe(testOrder.id);
      expect(row.out_source).toBe("order_payment");
      expect(row.out_source_id).toBe(payment.id);

      // 3. Verify modifications propagated and synced
      const { data: updatedEntry } = await adminClient
        .from("accounting_entries")
        .select("amount, entry_date, remarks")
        .eq("id", entry.id)
        .single();
      expect(updatedEntry!.amount).toBe(400);
      expect(updatedEntry!.entry_date).toBe("2026-06-12");

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("amount, payment_date")
        .eq("id", payment.id)
        .single();
      expect(updatedPayment!.amount).toBe(400);

      const { data: updatedOrder } = await adminClient
        .from("orders")
        .select("paid_amount, payment_status")
        .eq("id", testOrder.id)
        .single();
      expect(updatedOrder!.paid_amount).toBe(400);
      expect(updatedOrder!.payment_status).toBe("partial_paid");

      // Clean up
      await adminClient.from("accounting_entries").delete().eq("id", entry.id);
      await adminClient.from("payments").delete().eq("id", payment.id);
      await adminClient.from("orders").update({ paid_amount: 0, payment_status: "unpaid" }).eq("id", testOrder.id);
    });

    it("should reject and rollback if the updated payment amount exceeds the order total limit", async () => {
      if (!requireIntegrationReady()) return;
      const { data: payment } = await adminClient
        .from("payments")
        .insert({
          order_id: testOrder.id,
          amount: 200,
          payment_date: "2026-06-11",
          receipt_number: `RCP-TEST-${Date.now()}`,
        })
        .select()
        .single();

      const { data: entry } = await adminClient
        .from("accounting_entries")
        .insert({
          type: "income",
          account_id: testAccount.id,
          category_id: testCategoryIncome.id,
          amount: 200,
          entry_date: "2026-06-11",
          source: "order_payment",
          source_id: payment.id,
        })
        .select()
        .single();

      await adminClient
        .from("orders")
        .update({ paid_amount: 200, payment_status: "partial_paid" })
        .eq("id", testOrder.id);

      // Attempt to set payment to 1500 (order limit is 1000)
      const { error: rpcErr } = await managerClient.rpc("update_accounting_entry_cascade", {
        entry_id: entry.id,
        new_amount: 1500,
        new_entry_date: "2026-06-12",
        new_remarks: "Should fail",
      });

      expect(rpcErr).not.toBeNull();
      expect(rpcErr?.message).toContain("Payment cannot exceed remaining amount");

      // Verify that no records were mutated (rollback validated)
      const { data: freshEntry } = await adminClient
        .from("accounting_entries")
        .select("amount")
        .eq("id", entry.id)
        .single();
      expect(freshEntry!.amount).toBe(200);

      const { data: freshPayment } = await adminClient
        .from("payments")
        .select("amount")
        .eq("id", payment.id)
        .single();
      expect(freshPayment!.amount).toBe(200);

      const { data: freshOrder } = await adminClient
        .from("orders")
        .select("paid_amount")
        .eq("id", testOrder.id)
        .single();
      expect(freshOrder!.paid_amount).toBe(200);

      // Clean up
      await adminClient.from("accounting_entries").delete().eq("id", entry.id);
      await adminClient.from("payments").delete().eq("id", payment.id);
      await adminClient.from("orders").update({ paid_amount: 0, payment_status: "unpaid" }).eq("id", testOrder.id);
    });

    it("should deny access and make no database mutations when executed by a sales role user", async () => {
      if (!requireIntegrationReady()) return;
      const { data: entry } = await adminClient
        .from("accounting_entries")
        .insert({
          type: "income",
          account_id: testAccount.id,
          category_id: testCategoryIncome.id,
          amount: 100,
          entry_date: "2026-06-11",
        })
        .select()
        .single();

      const { error: rpcErr } = await salesClient.rpc("update_accounting_entry_cascade", {
        entry_id: entry.id,
        new_amount: 300,
        new_entry_date: "2026-06-12",
        new_remarks: "Unpermitted write",
      });

      expect(rpcErr).not.toBeNull();
      expect(rpcErr?.message).toContain("Manager or admin access required");

      const { data: freshEntry } = await adminClient
        .from("accounting_entries")
        .select("amount")
        .eq("id", entry.id)
        .single();
      expect(freshEntry!.amount).toBe(100);

      await adminClient.from("accounting_entries").delete().eq("id", entry.id);
    });
  });

  describe("delete_accounting_entry_cascade RPC", () => {
    it("should allow a manager to delete a payment-linked accounting entry, which deletes both rows and syncs order totals", async () => {
      if (!requireIntegrationReady()) return;
      const { data: payment } = await adminClient
        .from("payments")
        .insert({
          order_id: testOrder.id,
          amount: 300,
          payment_date: "2026-06-11",
          receipt_number: `RCP-TEST-${Date.now()}`,
        })
        .select()
        .single();

      const { data: entry } = await adminClient
        .from("accounting_entries")
        .insert({
          type: "income",
          account_id: testAccount.id,
          category_id: testCategoryIncome.id,
          amount: 300,
          entry_date: "2026-06-11",
          source: "order_payment",
          source_id: payment.id,
        })
        .select()
        .single();

      await adminClient
        .from("orders")
        .update({ paid_amount: 300, payment_status: "partial_paid" })
        .eq("id", testOrder.id);

      // Execute cascade delete
      const { data: rpcResult, error: rpcErr } = await managerClient.rpc("delete_accounting_entry_cascade", {
        entry_id: entry.id,
      });
      expect(rpcErr).toBeNull();
      expect(rpcResult).toBeDefined();

      const row = rpcResult[0];
      expect(row.out_order_id).toBe(testOrder.id);
      expect(row.out_source).toBe("order_payment");

      // Verify deletions
      const { data: deletedEntry } = await adminClient
        .from("accounting_entries")
        .select("*")
        .eq("id", entry.id)
        .maybeSingle();
      expect(deletedEntry).toBeNull();

      const { data: deletedPayment } = await adminClient
        .from("payments")
        .select("*")
        .eq("id", payment.id)
        .maybeSingle();
      expect(deletedPayment).toBeNull();

      const { data: updatedOrder } = await adminClient
        .from("orders")
        .select("paid_amount, payment_status")
        .eq("id", testOrder.id)
        .single();
      expect(updatedOrder!.paid_amount).toBe(0);
      expect(updatedOrder!.payment_status).toBe("unpaid");
    });

    it("should allow a manager to delete a production job-linked accounting entry, which deletes both rows", async () => {
      if (!requireIntegrationReady()) return;
      const { data: job, error: jobErr } = await adminClient
        .from("production_jobs")
        .insert({
          order_id: testOrder.id,
          agency_id: testAgency.id,
          service_id: testService.id,
          payable_amount: 250,
        })
        .select()
        .single();
      expect(jobErr).toBeNull();

      const { data: entry } = await adminClient
        .from("accounting_entries")
        .insert({
          type: "expense",
          account_id: testAccount.id,
          category_id: testCategoryExpense.id,
          amount: 250,
          entry_date: "2026-06-11",
          source: "production_job",
          source_id: job.id,
        })
        .select()
        .single();

      // Execute cascade delete
      const { data: rpcResult, error: rpcErr } = await managerClient.rpc("delete_accounting_entry_cascade", {
        entry_id: entry.id,
      });
      expect(rpcErr).toBeNull();
      expect(rpcResult).toBeDefined();

      const row = rpcResult[0];
      expect(row.out_order_id).toBe(testOrder.id);
      expect(row.out_source).toBe("production_job");

      // Verify deletions
      const { data: deletedEntry } = await adminClient
        .from("accounting_entries")
        .select("*")
        .eq("id", entry.id)
        .maybeSingle();
      expect(deletedEntry).toBeNull();

      const { data: deletedJob } = await adminClient
        .from("production_jobs")
        .select("*")
        .eq("id", job.id)
        .maybeSingle();
      expect(deletedJob).toBeNull();
    });
  });

  describe("add_order_payment RPC sequence receipt format", () => {
    it("should generate sequential, collision-free receipt numbers", async () => {
      if (!requireIntegrationReady()) return;

      const dateStr = "2026-06-12";
      
      // Call add_order_payment the first time
      const { data: receipt1, error: err1 } = await managerClient.rpc("add_order_payment", {
        order_id: testOrder.id,
        amount: 50,
        payment_date: dateStr,
        notes: "First test payment",
        created_by_user: managerUser.id,
      });
      expect(err1).toBeNull();
      expect(receipt1).toMatch(/^RCP-20260612-\d{6}$/);

      // Call add_order_payment the second time for the same date
      const { data: receipt2, error: err2 } = await managerClient.rpc("add_order_payment", {
        order_id: testOrder.id,
        amount: 50,
        payment_date: dateStr,
        notes: "Second test payment",
        created_by_user: managerUser.id,
      });
      expect(err2).toBeNull();
      expect(receipt2).toMatch(/^RCP-20260612-\d{6}$/);

      // Verify receipt2 suffix is exactly receipt1 suffix + 1
      const num1 = parseInt(receipt1.split("-")[2], 10);
      const num2 = parseInt(receipt2.split("-")[2], 10);
      expect(num2).toBe(num1 + 1);

      // Clean up the created payments to restore order status
      await adminClient.from("payments").delete().eq("order_id", testOrder.id);
      await adminClient.from("accounting_entries").delete().eq("remarks", "First test payment");
      await adminClient.from("accounting_entries").delete().eq("remarks", "Second test payment");
      await adminClient.from("orders").update({ paid_amount: 0, payment_status: "unpaid" }).eq("id", testOrder.id);
    });
  });

  describe("invoice sequence RPC boundary and invoice creation", () => {
    it("should deny direct sequence helper execution and generate invoices through the authorized wrapper", async () => {
      if (!requireIntegrationReady()) return;

      const testDate = "2099-11-20";
      await adminClient.from("invoices").delete().eq("order_id", testOrder.id);
      await adminClient
        .from("invoice_number_sequences")
        .delete()
        .eq("invoice_date", testDate);

      const { error: directErr } = await managerClient.rpc("next_invoice_number", {
        p_invoice_date: testDate,
        p_invoice_type: "gst",
      });
      expect(directErr).not.toBeNull();
      expect(directErr?.message).toMatch(/permission denied/i);

      const { data: gstInv1, error: gstErr1 } = await managerClient.rpc("create_order_invoice", {
        p_order_id: testOrder.id,
        p_invoice_type: "gst",
        p_amount: 100,
        p_invoice_date: testDate,
        p_created_by: managerUser.id,
      });
      expect(gstErr1).toBeNull();
      expect(gstInv1).toBe("INV-GST-20991120-000001");

      const { data: gstInv2, error: gstErr2 } = await managerClient.rpc("create_order_invoice", {
        p_order_id: testOrder.id,
        p_invoice_type: "gst",
        p_amount: 125,
        p_invoice_date: testDate,
        p_created_by: managerUser.id,
      });
      expect(gstErr2).toBeNull();
      expect(gstInv2).toBe("INV-GST-20991120-000002");

      const { data: regInv1, error: regErr1 } = await managerClient.rpc("create_order_invoice", {
        p_order_id: testOrder.id,
        p_invoice_type: "non_gst",
        p_amount: 150,
        p_invoice_date: testDate,
        p_created_by: managerUser.id,
      });
      expect(regErr1).toBeNull();
      expect(regInv1).toBe("INV-20991120-000001");

      await adminClient.from("invoices").delete().eq("order_id", testOrder.id);
      await adminClient
        .from("invoice_number_sequences")
        .delete()
        .eq("invoice_date", testDate);
    });
  });

  describe("Payment concurrency overpayment prevention (A1)", () => {
    it("should prevent concurrent overpayment via row lock (A1)", async () => {
      if (!requireIntegrationReady()) return;

      // Ensure the order has a clean state of total = 1000 and paid = 800 (remaining = 200)
      await adminClient.from("payments").delete().eq("order_id", testOrder.id);
      
      const { error: prepPayErr } = await adminClient
        .from("payments")
        .insert({
          order_id: testOrder.id,
          amount: 800,
          payment_date: "2026-06-12",
          receipt_number: `RCP-CONC-PREP-${Date.now()}`,
          notes: "Prep payment",
        });
      expect(prepPayErr).toBeNull();

      await adminClient
        .from("orders")
        .update({ paid_amount: 800, payment_status: "partial_paid" })
        .eq("id", testOrder.id);

      // Now remaining amount is 200. We will fire two concurrent payments of 200 each.
      // Under concurrency control (row locking), one transaction must commit first, and the other transaction
      // must wait, then check the updated remaining amount, and fail with "Payment cannot exceed remaining amount".
      const promises = Array.from({ length: 2 }).map((_, i) =>
        managerClient.rpc("add_order_payment", {
          order_id: testOrder.id,
          amount: 200,
          payment_date: "2026-06-12",
          notes: `Concurrent payment test ${i}`,
          created_by_user: managerUser.id,
        })
      );

      const results = await Promise.allSettled(promises);
      
      const fulfilledResults = results.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r): r is PromiseFulfilledResult<any> => r.status === "fulfilled"
      );

      // Check results: exactly one should be successful (error is null) and one should fail (error is defined)
      const successResponses = fulfilledResults.filter(
        (r) => r.value.error === null
      );
      const errorResponses = fulfilledResults.filter(
        (r) => r.value.error !== null
      );

      expect(successResponses.length).toBe(1);
      expect(errorResponses.length).toBe(1);
      
      const errObj = errorResponses[0].value.error;
      expect(errObj.message).toMatch(/already fully paid|exceed remaining amount/i);

      // Clean up
      await adminClient.from("payments").delete().eq("order_id", testOrder.id);
      await adminClient.from("accounting_entries").delete().filter("remarks", "like", "Concurrent payment test%");
      await adminClient.from("orders").update({ paid_amount: 0, payment_status: "unpaid" }).eq("id", testOrder.id);
    });
  });

  describe("Account Balance SQL Aggregation Verification", () => {
    let mockAccount: TestRecord;

    beforeAll(() => {
      // Direct our DAL calls to use managerClient which is authenticated as manager
      testSupabaseClient = managerClient;
    });

    it("should calculate correct balances for an account with no entries (empty account)", async () => {
      if (!requireIntegrationReady()) return;
      // 1. Create a clean account with opening balance
      const openingBal = 1250.50;
      const { data: account, error: createErr } = await adminClient
        .from("accounting_accounts")
        .insert({
          name: `Empty Account Test ${Date.now()}`,
          opening_balance: openingBal,
          status: "active",
        })
        .select()
        .single();
      expect(createErr).toBeNull();
      mockAccount = account;

      // 2. Fetch the account details via DAL
      const detail = await getAccountById(mockAccount.id);
      expect(detail).not.toBeNull();
      expect(Number(detail!.opening_balance)).toBe(openingBal);
      expect(detail!.total_in).toBe(0);
      expect(detail!.total_out).toBe(0);
      expect(detail!.current_balance).toBe(openingBal);
      expect(detail!.entry_count).toBe(0);

      // 3. Fetch via getAccounts and search for it
      const listResult = await getAccounts({ search: mockAccount.name as string });
      expect(listResult.accounts.length).toBe(1);
      const found = listResult.accounts[0];
      expect(found.id).toBe(mockAccount.id);
      expect(found.total_in).toBe(0);
      expect(found.total_out).toBe(0);
      expect(found.current_balance).toBe(openingBal);
      expect(found.entry_count).toBe(0);
    });

    it("should calculate correct debit/credit balances and entry count on transactions", async () => {
      if (!requireIntegrationReady()) return;
      // 1. Create some accounting entries (credits and debits)
      // Income: 800.00
      const { data: entry1, error: err1 } = await adminClient
        .from("accounting_entries")
        .insert({
          type: "income",
          account_id: mockAccount.id,
          category_id: testCategoryIncome.id,
          amount: 800.00,
          entry_date: "2026-06-12",
          remarks: "Test Income",
        })
        .select()
        .single();
      expect(err1).toBeNull();

      // Expense: 350.25
      const { data: entry2, error: err2 } = await adminClient
        .from("accounting_entries")
        .insert({
          type: "expense",
          account_id: mockAccount.id,
          category_id: testCategoryExpense.id,
          amount: 350.25,
          entry_date: "2026-06-12",
          remarks: "Test Expense",
        })
        .select()
        .single();
      expect(err2).toBeNull();

      // 2. Fetch single account detail via DAL
      const detail = await getAccountById(mockAccount.id);
      expect(detail).not.toBeNull();
      expect(detail!.total_in).toBe(800.00);
      expect(detail!.total_out).toBe(350.25);
      expect(detail!.entry_count).toBe(2);
      // Expected current_balance = 1250.50 + 800.00 - 350.25 = 1700.25
      expect(detail!.current_balance).toBe(1700.25);

      // 3. Fetch list of accounts via getAccounts
      const listResult = await getAccounts({ search: mockAccount.name as string });
      expect(listResult.accounts.length).toBe(1);
      const found = listResult.accounts[0];
      expect(found.total_in).toBe(800.00);
      expect(found.total_out).toBe(350.25);
      expect(found.entry_count).toBe(2);
      expect(found.current_balance).toBe(1700.25);

      // Clean up
      await adminClient.from("accounting_entries").delete().in("id", [entry1.id, entry2.id]);
    });

    it("should enforce RLS when querying via the security_invoker view", async () => {
      if (!requireIntegrationReady()) return;
      // Query using the sales role user, who doesn't have permissions for accounting
      testSupabaseClient = salesClient;
      await expect(getAccountById(mockAccount.id)).rejects.toThrow();
      await expect(getAccounts({ search: mockAccount.name as string })).rejects.toThrow();

      // Restore manager client
      testSupabaseClient = managerClient;
    });

    afterAll(async () => {
      if (mockAccount?.id) {
        await adminClient.from("accounting_accounts").delete().eq("id", mockAccount.id);
      }
    });
  });
});
