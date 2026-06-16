import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { testRunId, cleanupTestData } from "./test-cleanup";

// Mock server-only to avoid environment errors in Node/Vitest
vi.mock("server-only", () => ({}));

// Mock next/cache since server actions call revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let currentMockClient: SupabaseClient | null = null;

// Mock createClient to dynamically return the client for the current test
vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn(() => currentMockClient),
  };
});

import fs from "fs";
import path from "path";
import { convertLeadToQuotation } from "@/lib/actions/leads";

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
    // Ignore error
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
  const msg = `Skipping leads validation integration test: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

describe("Lead-to-Quotation Conversion Negative Amount Validation (DB3)", () => {
  let adminClient!: SupabaseClient;
  let salesClient!: SupabaseClient;
  let salesUser!: User;
  let testLeadId: string | null = null;
  let activeEventId: string | null = null;

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(supabaseAnonKey).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    try {
      adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false },
      });

      const stamp = Date.now();
      const salesEmail = `leads-validation-sales-${stamp}@example.com`;
      const password = "TestPassword123!";

      // 1. Create temporary test user
      const { data: sUser, error: sErr } = await adminClient.auth.admin.createUser({
        email: salesEmail,
        password,
        email_confirm: true,
        app_metadata: { role: "sales" },
      });
      if (sErr) throw sErr;
      salesUser = sUser.user;

      // Tag profile with testRunId
      await adminClient.from("profiles").update({
        test_run_id: testRunId,
        created_by_test: true,
      }).eq("id", salesUser.id);

      // 2. Sign in sales client
      salesClient = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { persistSession: false },
      });
      const { error: sSignInErr } = await salesClient.auth.signInWithPassword({
        email: salesEmail,
        password,
      });
      if (sSignInErr) throw sSignInErr;

      // 3. Retrieve an active event ID for lead function day
      const { data: event } = await adminClient.from("events").select("id").limit(1).single();
      if (event) {
        activeEventId = event.id;
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

  it("should reject negative amount conversion at the Server Action level (Zod)", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = salesClient;

    // Call the action with a negative amount; it should throw a Zod validation error
    await expect(
      convertLeadToQuotation(
        "123e4567-e89b-12d3-a456-426614174000",
        [],
        [],
        -100
      )
    ).rejects.toThrow(/Must be zero or greater/i);
  });

  it("should reject negative amount conversion at the RPC level (Postgres Check Constraint / Guard)", async () => {
    if (!requireIntegrationReady()) return;
    currentMockClient = salesClient;

    // Create a real lead to test conversion via RPC
    const { data: lead, error: leadErr } = await adminClient
      .from("leads")
      .insert({
        your_name: "Test Customer",
        couple_name: "Test & Partner",
        referral_source: "Instagram",
        contact_number: "9876543210",
        email: "customer@example.com",
        event_location: "Test Venue",
        wedding_date: "2026-06-12",
        album_requirement: "yes_large",
        drone_requirement: "one_drone",
        shooting_side: "both",
        pre_wedding_shoot: "yes_local",
        functions_count: 1,
        budget_range: "2-3L",
        test_run_id: testRunId,
        created_by_test: true,
      })
      .select()
      .single();

    expect(leadErr).toBeNull();
    expect(lead).toBeDefined();
    testLeadId = lead.id;

    // Link a function day if an event is available
    if (activeEventId) {
      await adminClient.from("lead_function_days").insert({
        lead_id: testLeadId,
        day_index: 1,
        day_date: "2026-06-12",
        first_event_id: activeEventId,
        test_run_id: testRunId,
        created_by_test: true,
      });
    }

    // Call the database function directly via RPC with negative amount.
    // It should be rejected due to check constraint / PL/pgSQL check
    const { error: rpcErr } = await salesClient.rpc("convert_lead_to_quotation", {
      lead_id: testLeadId,
      amount: -500,
      service_persons: [],
      deliverable_ids: [],
      created_by_user: salesUser.id,
    });

    expect(rpcErr).not.toBeNull();
    // It should trigger either our exception 'Quotation amount cannot be negative' or the check constraint
    expect(rpcErr?.message).toMatch(/Quotation amount cannot be negative|violates check constraint/i);
  });
});
