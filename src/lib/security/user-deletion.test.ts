import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { adminCreateUser, adminDeleteUser } from "@/lib/data/service-role/users";
import { testRunId, cleanupTestData } from "./test-cleanup";

// Load environment variables manually if needed
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
    // Ignore
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const isCi = process.env.CI === "true";

let integrationReady = false;
let integrationSkipReason = "";

function requireIntegrationReady() {
  if (integrationReady) return true;
  const msg = `Skipping user deletion integration tests: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

describe("User Deletion Cascade Verification", () => {
  let adminClient: SupabaseClient;
  let testUser: User;
  let createdLeadId: string | undefined;
  let createdCategoryId: string | undefined;

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    try {
      adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false },
      });

      const stamp = Date.now();
      testUser = await adminCreateUser({
        name: "Deletion Test User",
        email: `delete-test-${stamp}@example.com`,
        password: "TestPassword123!",
        role: "sales",
      });

      // Tag the test user's profile with test run ID
      await adminClient.from("profiles").update({
        test_run_id: testRunId,
        created_by_test: true,
      }).eq("id", testUser.id);

      integrationReady = true;
    } catch (error) {
      if (isCi) throw error;
      integrationSkipReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("should successfully delete a user when they have created leads and accounting categories, setting created_by to NULL", async () => {
    if (!requireIntegrationReady()) return;

    // 1. Verify user profile exists
    const { data: profileBefore } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", testUser.id)
      .single();
    expect(profileBefore?.id).toBe(testUser.id);

    // 2. Create a lead associated with the user
    const { data: lead, error: leadError } = await adminClient
      .from("leads")
      .insert({
        your_name: "Test Lead Creator",
        couple_name: "John & Jane Deletion",
        contact_number: "1234567890",
        event_location: "Test Location",
        wedding_date: "2026-12-31",
        album_requirement: "No",
        drone_requirement: "No",
        shooting_side: "Both",
        pre_wedding_shoot: "No",
        budget_range: "Rs. 1,00,000 - 1,25,000",
        created_by: testUser.id,
        test_run_id: testRunId,
        created_by_test: true,
      })
      .select()
      .single();

    expect(leadError).toBeNull();
    expect(lead).toBeDefined();
    createdLeadId = lead.id;
    expect(lead.created_by).toBe(testUser.id);

    // 3. Create an accounting category associated with the user
    const { data: category, error: categoryError } = await adminClient
      .from("accounting_categories")
      .insert({
        name: "Test Category Deletion",
        type: "expense",
        status: "active",
        created_by: testUser.id,
        test_run_id: testRunId,
        created_by_test: true,
      })
      .select()
      .single();

    expect(categoryError).toBeNull();
    expect(category).toBeDefined();
    createdCategoryId = category.id;
    expect(category.created_by).toBe(testUser.id);

    // 4. Perform user deletion
    await expect(adminDeleteUser(testUser.id)).resolves.not.toThrow();

    // 5. Verify user profile is deleted
    const { data: profileAfter } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", testUser.id)
      .maybeSingle();
    expect(profileAfter).toBeNull();

    // 6. Verify lead still exists but created_by is set to NULL
    const { data: leadAfter } = await adminClient
      .from("leads")
      .select("id, created_by")
      .eq("id", createdLeadId)
      .single();
    expect(leadAfter).not.toBeNull();
    expect(leadAfter!.created_by).toBeNull();

    // 7. Verify accounting category still exists but created_by is set to NULL
    const { data: categoryAfter } = await adminClient
      .from("accounting_categories")
      .select("id, created_by")
      .eq("id", createdCategoryId)
      .single();
    expect(categoryAfter).not.toBeNull();
    expect(categoryAfter!.created_by).toBeNull();
  });
});
