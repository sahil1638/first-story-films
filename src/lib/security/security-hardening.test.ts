import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Mock server-only to avoid environment errors in Node/Vitest
vi.mock("server-only", () => ({}));

// Mock next/cache since server actions call revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock createClient to dynamically return the client for the current test
vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn(),
  };
});

import fs from "fs";
import path from "path";
import { adminCreateUser, adminUpdateUserRole } from "@/lib/data/service-role/users";
import { testRunId, cleanupTestData } from "./test-cleanup";

// Load environment variables manually from .env.local if not already defined
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split("\n").forEach((line) => {
        const parts = line.split("=");
        if (parts.length >= 2) {
          process.env[parts[0].trim()] = parts.slice(1).join("=").trim();
        }
      });
    }
  } catch {
    // Ignore local env loading errors.
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isCi = process.env.CI === "true";

let integrationReady = false;
let integrationSkipReason = "";

function requireIntegrationReady() {
  if (integrationReady) return true;
  const msg = `Skipping security hardening tests: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

describe("Security Hardening Tests (RLS1, RLS2, RLS3)", () => {
  let adminClient: SupabaseClient;
  let salesClient: SupabaseClient;
  let managerClient: SupabaseClient;
  let anonClient: SupabaseClient;

  let salesUser: User;
  let managerUser: User;
  let targetUser: User;

  const password = "TestPassword123!";

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(supabaseAnonKey).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    try {
      adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false },
      });

      anonClient = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { persistSession: false },
      });

      const stamp = Date.now();
      salesUser = await adminCreateUser({
        name: "Hardening Sales",
        email: `h-sales-${stamp}@example.com`,
        password,
        role: "sales",
      });

      managerUser = await adminCreateUser({
        name: "Hardening Manager",
        email: `h-manager-${stamp}@example.com`,
        password,
        role: "manager",
      });

      targetUser = await adminCreateUser({
        name: "Hardening Target",
        email: `h-target-${stamp}@example.com`,
        password,
        role: "sales",
      });

      salesClient = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { persistSession: false },
      });
      const { error: sSignInErr } = await salesClient.auth.signInWithPassword({
        email: salesUser.email!,
        password,
      });
      if (sSignInErr) throw sSignInErr;

      managerClient = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { persistSession: false },
      });
      const { error: mSignInErr } = await managerClient.auth.signInWithPassword({
        email: managerUser.email!,
        password,
      });
      if (mSignInErr) throw mSignInErr;

      // Tag created users with testRunId
      for (const u of [salesUser, managerUser, targetUser]) {
        if (u) {
          await adminClient.from("profiles").update({
            test_run_id: testRunId,
            created_by_test: true,
          }).eq("id", u.id);
        }
      }

      integrationReady = true;
    } catch (error) {
      if (isCi) throw error;
      integrationSkipReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe("RLS1: Profile Role self-escalation prevention", () => {
    it("sales cannot self-promote", async () => {
      if (!requireIntegrationReady()) return;

      const { error } = await salesClient
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", salesUser.id);

      expect(error).not.toBeNull();
      // Verify database role is still sales
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", salesUser.id)
        .single();
      expect(profile?.role).toBe("sales");
    });

    it("manager cannot self-promote to admin", async () => {
      if (!requireIntegrationReady()) return;

      const { error } = await managerClient
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", managerUser.id);

      expect(error).not.toBeNull();
      // Verify database role is still manager
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", managerUser.id)
        .single();
      expect(profile?.role).toBe("manager");
    });

    it("admin/service-role role update still works", async () => {
      if (!requireIntegrationReady()) return;

      await adminUpdateUserRole(targetUser.id, "manager");

      const { data: profile, error } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", targetUser.id)
        .single();

      expect(error).toBeNull();
      expect(profile?.role).toBe("manager");
    });

    it("stale manager JWT is denied after live profile role downgrade", async () => {
      if (!requireIntegrationReady()) return;

      try {
        await adminUpdateUserRole(managerUser.id, "sales");

        const { data: profile } = await adminClient
          .from("profiles")
          .select("role")
          .eq("id", managerUser.id)
          .single();
        expect(profile?.role).toBe("sales");

        const { error } = await managerClient.rpc("delete_order_cascade", {
          order_id: "123e4567-e89b-12d3-a456-426614174000",
        });
        expect(error).not.toBeNull();
        expect(error?.message).toContain("Manager or admin access required");
      } finally {
        await adminUpdateUserRole(managerUser.id, "manager");
      }
    });

    it("sales cannot directly delete leads or quotations through RLS", async () => {
      if (!requireIntegrationReady()) return;

      const baseRecord = {
        your_name: "RLS Delete Test",
        couple_name: "RLS Couple",
        contact_number: "9876543210",
        email: "rls-delete@example.com",
        event_location: "Test Location",
        wedding_date: "2026-06-20",
        wedding_venue: "Test Venue",
        album_requirement: "yes",
        drone_requirement: "no",
        shooting_side: "both",
        pre_wedding_shoot: "no",
        functions_count: 1,
        has_additional_info: false,
        additional_details: null,
        budget_range: "50k-100k",
        created_by: salesUser.id,
        test_run_id: testRunId,
        created_by_test: true,
      };

      const { data: lead, error: leadInsertError } = await adminClient
        .from("leads")
        .insert({
          ...baseRecord,
          source: "admin_manual",
          agreement_accepted: true,
        })
        .select("id")
        .single();
      expect(leadInsertError).toBeNull();
      expect(lead?.id).toBeDefined();

      await salesClient.from("leads").delete().eq("id", lead!.id);

      const { data: leadAfterSalesDelete } = await adminClient
        .from("leads")
        .select("id")
        .eq("id", lead!.id)
        .maybeSingle();
      expect(leadAfterSalesDelete?.id).toBe(lead!.id);

      const { error: managerLeadDeleteError } = await managerClient
        .from("leads")
        .delete()
        .eq("id", lead!.id);
      expect(managerLeadDeleteError).toBeNull();

      const { data: quotation, error: quotationInsertError } = await adminClient
        .from("quotations")
        .insert(baseRecord)
        .select("id")
        .single();
      expect(quotationInsertError).toBeNull();
      expect(quotation?.id).toBeDefined();

      await salesClient.from("quotations").delete().eq("id", quotation!.id);

      const { data: quotationAfterSalesDelete } = await adminClient
        .from("quotations")
        .select("id")
        .eq("id", quotation!.id)
        .maybeSingle();
      expect(quotationAfterSalesDelete?.id).toBe(quotation!.id);

      const { error: managerQuotationDeleteError } = await managerClient
        .from("quotations")
        .delete()
        .eq("id", quotation!.id);
      expect(managerQuotationDeleteError).toBeNull();
    });
  });

  describe("RLS2: Unauthorized RPC execute fails", () => {
    it("should reject direct execution of restricted SECURITY DEFINER RPCs for anonymous users", async () => {
      if (!requireIntegrationReady()) return;

      const dummyUuid = "123e4567-e89b-12d3-a456-426614174000";

      const { error: err1 } = await anonClient.rpc("convert_quotation_to_order", {
        quotation_id: dummyUuid,
        subtotal: 1000,
        invoice_type: "non_gst",
        service_persons: [],
        deliverable_ids: [],
        created_by_user: dummyUuid,
      });
      expect(err1).not.toBeNull();
      expect(err1?.message).toMatch(/permission denied|Unauthorized/i);

      const { error: err2 } = await anonClient.rpc("delete_order_cascade", {
        order_id: dummyUuid,
      });
      expect(err2).not.toBeNull();
      expect(err2?.message).toMatch(/permission denied|Unauthorized/i);

      const { error: err3 } = await anonClient.rpc("next_receipt_number", {
        receipt_date: "2026-06-12",
      });
      expect(err3).not.toBeNull();
      expect(err3?.message).toMatch(/permission denied|could not find.*schema cache/i);

      const { error: err4 } = await anonClient.rpc("next_invoice_number", {
        p_invoice_date: "2026-06-12",
        p_invoice_type: "gst",
      });
      expect(err4).not.toBeNull();
      expect(err4?.message).toMatch(/permission denied|could not find.*schema cache/i);
    });

    it("should reject direct receipt/invoice sequence execution for sales users", async () => {
      if (!requireIntegrationReady()) return;

      const { error: receiptErr } = await salesClient.rpc("next_receipt_number", {
        receipt_date: "2026-06-12",
      });
      expect(receiptErr).not.toBeNull();
      expect(receiptErr?.message).toMatch(/permission denied|could not find.*schema cache/i);

      const { error: invoiceErr } = await salesClient.rpc("next_invoice_number", {
        p_invoice_date: "2026-06-12",
        p_invoice_type: "gst",
      });
      expect(invoiceErr).not.toBeNull();
      expect(invoiceErr?.message).toMatch(/permission denied|could not find.*schema cache/i);
    });
  });

  describe("RLS3: Rate limiter keys validation", () => {
    it("should deny execute access to check_rate_limit for anon and authenticated users", async () => {
      if (!requireIntegrationReady()) return;

      const { error: anonErr } = await anonClient.rpc("check_rate_limit", {
        limit_key: "login:test-user-anon",
        max_tokens: 10,
        refill_rate_per_sec: 2,
        cost: 1,
      });
      expect(anonErr).not.toBeNull();
      expect(anonErr?.message).toMatch(/permission denied|Unauthorized/i);

      const { error: authErr } = await salesClient.rpc("check_rate_limit", {
        limit_key: "login:test-user-auth",
        max_tokens: 10,
        refill_rate_per_sec: 2,
        cost: 1,
      });
      expect(authErr).not.toBeNull();
      expect(authErr?.message).toMatch(/permission denied|Unauthorized/i);
    });

    it("should reject invalid/long rate limit keys via service_role", async () => {
      if (!requireIntegrationReady()) return;

      // 1. Key prefix is invalid
      const { error: err1 } = await adminClient.rpc("check_rate_limit", {
        limit_key: "malicious-prefix:test",
        max_tokens: 5,
        refill_rate_per_sec: 1,
        cost: 1,
      });
      expect(err1).not.toBeNull();
      expect(err1?.message).toContain("Invalid rate limit key prefix");

      // 2. Key is too long
      const longKey = "login:" + "a".repeat(100);
      const { error: err2 } = await adminClient.rpc("check_rate_limit", {
        limit_key: longKey,
        max_tokens: 5,
        refill_rate_per_sec: 1,
        cost: 1,
      });
      expect(err2).not.toBeNull();
      expect(err2?.message).toContain("exceed 100 characters");
    });

    it("should allow valid auth.login/public.lead/pdf/export keys via service_role", async () => {
      if (!requireIntegrationReady()) return;

      // 1. Valid login prefix key
      const { data: ok1, error: err1 } = await adminClient.rpc("check_rate_limit", {
        limit_key: "login:test-user",
        max_tokens: 10,
        refill_rate_per_sec: 2,
        cost: 1,
      });
      expect(err1).toBeNull();
      expect(ok1).toBe(true);

      // 2. Valid public-lead prefix key
      const { data: ok2, error: err2 } = await adminClient.rpc("check_rate_limit", {
        limit_key: "public-lead:test-ip",
        max_tokens: 10,
        refill_rate_per_sec: 2,
        cost: 1,
      });
      expect(err2).toBeNull();
      expect(ok2).toBe(true);

      // 3. Valid pdf prefix key
      const { data: ok3, error: err3 } = await adminClient.rpc("check_rate_limit", {
        limit_key: "pdf:test-pdf-ip",
        max_tokens: 10,
        refill_rate_per_sec: 2,
        cost: 1,
      });
      expect(err3).toBeNull();
      expect(ok3).toBe(true);

      // 4. Valid export prefix key
      const { data: ok4, error: err4 } = await adminClient.rpc("check_rate_limit", {
        limit_key: "export:test-export-ip",
        max_tokens: 10,
        refill_rate_per_sec: 2,
        cost: 1,
      });
      expect(err4).toBeNull();
      expect(ok4).toBe(true);

      // Cleanup created rate limits from database
      await adminClient
        .from("rate_limits")
        .delete()
        .in("key", [
          "login:test-user",
          "public-lead:test-ip",
          "pdf:test-pdf-ip",
          "export:test-export-ip"
        ]);
    });

    it("should prevent burst rate limit bypass under concurrency via service_role (S1)", async () => {
      if (!requireIntegrationReady()) return;

      const key = "login:concurrent-test-user";
      
      // Ensure the key does not exist initially
      await adminClient.from("rate_limits").delete().eq("key", key);

      // We set max_tokens = 1, cost = 1. Only 1 request should succeed.
      const promises = Array.from({ length: 5 }).map(() =>
        adminClient.rpc("check_rate_limit", {
          limit_key: key,
          max_tokens: 1,
          refill_rate_per_sec: 0, // no refill during the test
          cost: 1,
        })
      );

      const results = await Promise.all(promises);
      
      // Count how many requests returned true (allowed)
      const successCount = results.filter((r) => r.data === true).length;
      
      // Verify that exactly 1 request succeeded
      expect(successCount).toBe(1);

      // Cleanup
      await adminClient.from("rate_limits").delete().eq("key", key);
    });
  });

  describe("RLS4: Restricted RPC execute permissions", () => {
    it("should deny execute access to create_public_lead_rpc for anon and authenticated users, but allow service_role", async () => {
      if (!requireIntegrationReady()) return;

      const dummyInput = {
        couple_name: "Hardening Test Couple",
        your_name: "Hardening Test User",
        contact_number: "9876543210",
        wedding_date: "2026-06-20",
        album_requirement: "yes",
        drone_requirement: "yes",
        shooting_side: "both",
        pre_wedding_shoot: "yes",
        functions_count: 1,
        budget_range: "50k-100k",
        event_location: "Test Location",
        has_additional_info: false,
        agreement_accepted: true,
        function_days: [],
        test_run_id: testRunId,
        created_by_test: true,
      };

      const { error: anonErr } = await anonClient.rpc("create_public_lead_rpc", {
        p_input: dummyInput,
      });
      expect(anonErr).not.toBeNull();
      expect(anonErr?.message).toMatch(/permission denied|Unauthorized/i);

      const { error: authErr } = await salesClient.rpc("create_public_lead_rpc", {
        p_input: dummyInput,
      });
      expect(authErr).not.toBeNull();
      expect(authErr?.message).toMatch(/permission denied|Unauthorized/i);

      // Verify service_role can execute it
      const { data: leadId, error: adminErr } = await adminClient.rpc("create_public_lead_rpc", {
        p_input: dummyInput,
      });
      expect(adminErr).toBeNull();
      expect(leadId).toBeDefined();

      // Cleanup
      if (leadId) {
        await adminClient.from("leads").delete().eq("id", leadId);
      }
    });

    it("should deny execute access to reconcile_user_roles for anon and authenticated users, but allow service_role", async () => {
      if (!requireIntegrationReady()) return;

      const { error: anonErr } = await anonClient.rpc("reconcile_user_roles");
      expect(anonErr).not.toBeNull();
      expect(anonErr?.message).toMatch(/permission denied|Unauthorized/i);

      const { error: authErr } = await salesClient.rpc("reconcile_user_roles");
      expect(authErr).not.toBeNull();
      expect(authErr?.message).toMatch(/permission denied|Unauthorized/i);

      // Verify service_role can execute it
      const { data: count, error: adminErr } = await adminClient.rpc("reconcile_user_roles");
      expect(adminErr).toBeNull();
      expect(typeof count).toBe("number");
    });
  });
});
