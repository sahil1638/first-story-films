import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import {
  adminCreateUser,
  adminUpdateUserRole,
  adminRepairUserRole,
} from "@/lib/data/service-role/users";
import * as adminClientModule from "@/lib/supabase/admin";
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
  const msg = `Skipping split-brain tests: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

// Spying & Mocking the profiles table behavior
let shouldFailProfileUpdate = false;
let profileUpdateFailCount = 0;
let failLimit = 0;

const originalCreateAdminClient = adminClientModule.createAdminClient;

vi.spyOn(adminClientModule, "createAdminClient").mockImplementation(() => {
  const client = originalCreateAdminClient();
  const originalFrom = client.from.bind(client);

  client.from = (table: string) => {
    if (table === "profiles" && shouldFailProfileUpdate) {
      return {
        update: (updates: Record<string, unknown>) => {
          return {
            eq: (col: string, val: unknown) => {
              profileUpdateFailCount++;
              if (profileUpdateFailCount <= failLimit) {
                return Promise.resolve({ error: { message: "Mocked profiles update error" } });
              }
              return originalFrom("profiles").update(updates).eq(col, val);
            },
          };
        },
        upsert: (profile: Record<string, unknown>) => {
          profileUpdateFailCount++;
          if (profileUpdateFailCount <= failLimit) {
            return Promise.resolve({ error: { message: "Mocked profiles upsert error" } });
          }
          return originalFrom("profiles").upsert(profile);
        },
        select: (columns?: string) => {
          return originalFrom("profiles").select(columns);
        },
      } as unknown as ReturnType<SupabaseClient["from"]>;
    }
    return originalFrom(table);
  };
  return client;
});

describe("Split-Brain Reconciliation and Role Repair Tests", () => {
  let adminClient!: SupabaseClient;
  let testUser!: User;

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    try {
      adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false },
      });

      const stamp = Date.now();
      testUser = await adminCreateUser({
        name: "Split Brain Test User",
        email: `split-brain-${stamp}@example.com`,
        password: "TestPassword123!",
        role: "sales",
      });

      // Tag profile with testRunId
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

  it("should succeed fully when database is healthy", async () => {
    if (!requireIntegrationReady()) return;

    shouldFailProfileUpdate = false;
    profileUpdateFailCount = 0;

    const res = await adminUpdateUserRole(testUser.id, "manager");
    expect(res.user.user_metadata?.role).toBe("manager");

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", testUser.id)
      .single();
    expect(profile?.role).toBe("manager");
  });

  it("should retry and succeed when transient DB failure occurs", async () => {
    if (!requireIntegrationReady()) return;

    shouldFailProfileUpdate = true;
    profileUpdateFailCount = 0;
    failLimit = 1; // Fails on 1st attempt, succeeds on 2nd attempt (within max 3 attempts)

    const res = await adminUpdateUserRole(testUser.id, "sales");
    expect(res.user.user_metadata?.role).toBe("sales");
    expect(profileUpdateFailCount).toBe(2); // Attempt 1: fail, Attempt 2: success

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", testUser.id)
      .single();
    expect(profile?.role).toBe("sales");
  });

  it("should throw a safe repair error and log operational alerts when retries are exhausted", async () => {
    if (!requireIntegrationReady()) return;

    shouldFailProfileUpdate = true;
    profileUpdateFailCount = 0;
    failLimit = 3; // Fails all 3 attempts

    await expect(adminUpdateUserRole(testUser.id, "admin")).rejects.toThrow(
      /Please run the repair action to resync/
    );

    expect(profileUpdateFailCount).toBe(3); // 3 attempts total

    // Verify split-brain state:
    // Auth metadata was updated to admin
    const { data: authData } = await adminClient.auth.admin.getUserById(testUser.id);
    expect(authData.user?.user_metadata?.role).toBe("admin");

    // DB profile remained at sales (the source of truth)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", testUser.id)
      .single();
    expect(profile?.role).toBe("sales");
  });

  it("should successfully repair split-brain state by restoring Auth metadata from profiles.role", async () => {
    if (!requireIntegrationReady()) return;

    // Turn off mocks to restore normal operations
    shouldFailProfileUpdate = false;

    // Verify currently split-brain: Auth metadata has role admin, DB has role sales
    const { data: authBefore } = await adminClient.auth.admin.getUserById(testUser.id);
    expect(authBefore.user?.user_metadata?.role).toBe("admin");

    const { data: profileBefore } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", testUser.id)
      .single();
    expect(profileBefore?.role).toBe("sales");

    // Run repair action
    const repairedUser = await adminRepairUserRole(testUser.id);

    // Verify Auth metadata is now repaired to sales, matching profiles.role
    expect(repairedUser.user.user_metadata?.role).toBe("sales");

    const { data: authAfter } = await adminClient.auth.admin.getUserById(testUser.id);
    expect(authAfter.user?.user_metadata?.role).toBe("sales");

    const { data: profileAfter } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", testUser.id)
      .single();
    expect(profileAfter?.role).toBe("sales");
  });

  it("should log unresolved split-brain failures to the operational events sink when auth metadata updates fail repeatedly", async () => {
    if (!requireIntegrationReady()) return;

    const originalSink = process.env.OPERATIONAL_ALERT_DURABLE_SINK;
    process.env.OPERATIONAL_ALERT_DURABLE_SINK = "supabase";

    try {
      let updateAttempts = 0;
      vi.spyOn(adminClientModule, "createAdminClient").mockImplementation(() => {
        const client = originalCreateAdminClient();
        client.auth.admin.updateUserById = (async () => {
          updateAttempts++;
          return { data: { user: null }, error: { message: "Mocked auth metadata update failure" } };
        }) as unknown as typeof client.auth.admin.updateUserById;
        return client;
      });

      // Run repair action and expect it to fail after retries (with small delay for fast test execution)
      await expect(adminRepairUserRole(testUser.id, 3, 5)).rejects.toThrow(/Role reconciliation failed/);

      // Verify it attempted 3 times
      expect(updateAttempts).toBe(3);

      // Restore createAdminClient mock to normal
      vi.spyOn(adminClientModule, "createAdminClient").mockImplementation(() => {
        return originalCreateAdminClient();
      });

      // Verify a critical alert event was created in operational_events table (the durable sink)
      const { data: events, error: eventErr } = await adminClient
        .from("operational_events")
        .select("*")
        .eq("event", "role_repair_unresolved")
        .order("created_at", { ascending: false })
        .limit(1);

      expect(eventErr).toBeNull();
      expect(events).toBeTruthy();
      expect(events!.length).toBe(1);
      expect(events![0].severity).toBe("error");
      expect(events![0].alert).toBe(true);
      expect(events![0].context?.userId).toBe(testUser.id);
    } finally {
      process.env.OPERATIONAL_ALERT_DURABLE_SINK = originalSink;
    }
  });
});
