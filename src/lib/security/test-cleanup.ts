import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

// 2. Add a unique testRunId for every test run
export const testRunId = process.env.TEST_RUN_ID || randomUUID();
process.env.TEST_RUN_ID = testRunId;

export function getTestRunId() {
  return testRunId;
}

export async function cleanupTestData() {
  // 6. Hard safety guard
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Safety Guard: Cleanup can only run when NODE_ENV === 'test'");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isLocalOrTestDb =
    supabaseUrl.includes("localhost") ||
    supabaseUrl.includes("127.0.0.1") ||
    process.env.ALLOW_TEST_CLEANUP === "true";

  if (!isLocalOrTestDb) {
    throw new Error(
      `Safety Guard: Attempted to run test cleanup on non-test/non-local Supabase URL: ${supabaseUrl}. ` +
      `If this is a test database, set ALLOW_TEST_CLEANUP=true in your environment.`
    );
  }

  // Double check that we have a valid testRunId to prevent deleting all data
  if (!testRunId) {
    throw new Error("Safety Guard: No testRunId specified for cleanup!");
  }

  const admin = createAdminClient();

  // 1. Profiles & Users
  // Select profiles created by this specific test run to delete their Auth users
  const { data: testProfiles } = await admin
    .from("profiles")
    .select("id")
    .eq("test_run_id", testRunId);

  if (testProfiles && testProfiles.length > 0) {
    // Delete auth users in parallel for maximum speed
    await Promise.all(
      testProfiles.map(async (p) => {
        try {
          await admin.auth.admin.deleteUser(p.id);
        } catch {
          // Ignore user deletion failure
        }
      })
    );
  }

  // 2. Execute database-level cleanup inside a single database transaction via the cleanup_test_data RPC
  const { error } = await admin.rpc("cleanup_test_data", { p_test_run_id: testRunId });
  if (error) {
    throw new Error(`Failed to clean up test data: ${error.message}`);
  }
}
