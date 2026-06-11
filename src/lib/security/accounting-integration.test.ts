import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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
  } catch (e) {
    // Ignore error
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("Accounting Transactional Mutations Integration Tests", () => {
  let adminClient: any;
  let managerClient: any;
  let salesClient: any;

  let managerUser: any;
  let salesUser: any;

  let testAccount: any;
  let testCategoryIncome: any;
  let testCategoryExpense: any;
  let testQuotation: any;
  let testOrder: any;
  let testService: any;
  let testAgency: any;

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(supabaseAnonKey).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
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
    });
    if (mErr) throw mErr;
    managerUser = mUser.user;

    const { data: sUser, error: sErr } = await adminClient.auth.admin.createUser({
      email: salesEmail,
      password,
      email_confirm: true,
      app_metadata: { role: "sales" },
    });
    if (sErr) throw sErr;
    salesUser = sUser.user;

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
  });

  afterAll(async () => {
    // Clean up created entities
    if (testOrder?.id) {
      await adminClient.from("orders").delete().eq("id", testOrder.id);
    }
    if (testQuotation?.id) {
      await adminClient.from("quotations").delete().eq("id", testQuotation.id);
    }
    if (testAccount?.id) {
      await adminClient.from("accounting_accounts").delete().eq("id", testAccount.id);
    }
    if (testCategoryIncome?.id) {
      await adminClient.from("accounting_categories").delete().eq("id", testCategoryIncome.id);
    }
    if (testCategoryExpense?.id) {
      await adminClient.from("accounting_categories").delete().eq("id", testCategoryExpense.id);
    }
    if (testService?.id) {
      await adminClient.from("services").delete().eq("id", testService.id);
    }
    if (testAgency?.id) {
      await adminClient.from("agencies").delete().eq("id", testAgency.id);
    }

    // Clean up test users
    if (managerUser?.id) {
      await adminClient.auth.admin.deleteUser(managerUser.id);
    }
    if (salesUser?.id) {
      await adminClient.auth.admin.deleteUser(salesUser.id);
    }
  });

  describe("update_accounting_entry_cascade RPC", () => {
    it("should allow a manager to update a payment-linked accounting entry, updating linked payment and order totals", async () => {
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
      expect(updatedEntry.amount).toBe(400);
      expect(updatedEntry.entry_date).toBe("2026-06-12");

      const { data: updatedPayment } = await adminClient
        .from("payments")
        .select("amount, payment_date")
        .eq("id", payment.id)
        .single();
      expect(updatedPayment.amount).toBe(400);

      const { data: updatedOrder } = await adminClient
        .from("orders")
        .select("paid_amount, payment_status")
        .eq("id", testOrder.id)
        .single();
      expect(updatedOrder.paid_amount).toBe(400);
      expect(updatedOrder.payment_status).toBe("partial_paid");

      // Clean up
      await adminClient.from("accounting_entries").delete().eq("id", entry.id);
      await adminClient.from("payments").delete().eq("id", payment.id);
      await adminClient.from("orders").update({ paid_amount: 0, payment_status: "unpaid" }).eq("id", testOrder.id);
    });

    it("should reject and rollback if the updated payment amount exceeds the order total limit", async () => {
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
      expect(rpcErr.message).toContain("Payment cannot exceed remaining amount");

      // Verify that no records were mutated (rollback validated)
      const { data: freshEntry } = await adminClient
        .from("accounting_entries")
        .select("amount")
        .eq("id", entry.id)
        .single();
      expect(freshEntry.amount).toBe(200);

      const { data: freshPayment } = await adminClient
        .from("payments")
        .select("amount")
        .eq("id", payment.id)
        .single();
      expect(freshPayment.amount).toBe(200);

      const { data: freshOrder } = await adminClient
        .from("orders")
        .select("paid_amount")
        .eq("id", testOrder.id)
        .single();
      expect(freshOrder.paid_amount).toBe(200);

      // Clean up
      await adminClient.from("accounting_entries").delete().eq("id", entry.id);
      await adminClient.from("payments").delete().eq("id", payment.id);
      await adminClient.from("orders").update({ paid_amount: 0, payment_status: "unpaid" }).eq("id", testOrder.id);
    });

    it("should deny access and make no database mutations when executed by a sales role user", async () => {
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
      expect(rpcErr.message).toContain("Manager or admin access required");

      const { data: freshEntry } = await adminClient
        .from("accounting_entries")
        .select("amount")
        .eq("id", entry.id)
        .single();
      expect(freshEntry.amount).toBe(100);

      await adminClient.from("accounting_entries").delete().eq("id", entry.id);
    });
  });

  describe("delete_accounting_entry_cascade RPC", () => {
    it("should allow a manager to delete a payment-linked accounting entry, which deletes both rows and syncs order totals", async () => {
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
      expect(updatedOrder.paid_amount).toBe(0);
      expect(updatedOrder.payment_status).toBe("unpaid");
    });

    it("should allow a manager to delete a production job-linked accounting entry, which deletes both rows", async () => {
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
});
