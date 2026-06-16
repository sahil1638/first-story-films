import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { adminCreateUser, adminUpdateUserRole } from "@/lib/data/service-role/users";
import { testRunId, cleanupTestData } from "./test-cleanup";

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
  const msg = `Skipping profile role RLS test: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

async function signInClient(email: string, password: string) {
  const client = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function getAuthRole(adminClient: SupabaseClient, userId: string) {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error) throw error;
  return data.user?.app_metadata?.role;
}

describe("Profile role escalation regression tests", () => {
  let adminClient: SupabaseClient | null = null;
  let salesClient: SupabaseClient | null = null;
  let managerClient: SupabaseClient | null = null;
  let adminUserClient: SupabaseClient | null = null;

  let salesUser: User | null = null;
  let managerUser: User | null = null;
  let adminUser: User | null = null;
  let targetUser: User | null = null;
  const password = "TestPassword123!";

  beforeAll(async () => {
    expect(supabaseUrl).toBeDefined();
    expect(supabaseAnonKey).toBeDefined();
    expect(serviceRoleKey).toBeDefined();

    try {
      adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
        auth: { persistSession: false },
      });

      const stamp = Date.now();
      const createdSales = await adminCreateUser({
        name: "Sales Role Test",
        email: `s1-sales-${stamp}@example.com`,
        password,
        role: "sales",
      });
      const createdManager = await adminCreateUser({
        name: "Manager Role Test",
        email: `s1-manager-${stamp}@example.com`,
        password,
        role: "manager",
      });
      const createdAdmin = await adminCreateUser({
        name: "Admin Role Test",
        email: `s1-admin-${stamp}@example.com`,
        password,
        role: "admin",
      });
      const createdTarget = await adminCreateUser({
        name: "Target Role Test",
        email: `s1-target-${stamp}@example.com`,
        password,
        role: "sales",
      });

      salesUser = createdSales;
      managerUser = createdManager;
      adminUser = createdAdmin;
      targetUser = createdTarget;

      // Tag all created users with testRunId
      for (const u of [salesUser, managerUser, adminUser, targetUser]) {
        if (u) {
          await adminClient.from("profiles").update({
            test_run_id: testRunId,
            created_by_test: true,
          }).eq("id", u.id);
        }
      }

      salesClient = await signInClient(createdSales.email!, password);
      managerClient = await signInClient(createdManager.email!, password);
      adminUserClient = await signInClient(createdAdmin.email!, password);
      integrationReady = true;
    } catch (error) {
      if (isCi) throw error;
      integrationSkipReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it("sales user cannot update own profiles.role to admin and auth metadata remains unchanged", async () => {
    if (!requireIntegrationReady()) return;

    const { error } = await salesClient!
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", salesUser!.id);

    expect(error).not.toBeNull();

    const { data: profile } = await adminClient!
      .from("profiles")
      .select("role")
      .eq("id", salesUser!.id)
      .single();
    expect(profile?.role).toBe("sales");
    await expect(getAuthRole(adminClient!, salesUser!.id)).resolves.toBe("sales");
  });

  it("sales user cannot update another user's profiles.role", async () => {
    if (!requireIntegrationReady()) return;

    const { error } = await salesClient!
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", targetUser!.id);

    expect(error).not.toBeNull();
    await expect(getAuthRole(adminClient!, targetUser!.id)).resolves.toBe("sales");
  });

  it("manager cannot become admin and auth metadata remains unchanged", async () => {
    if (!requireIntegrationReady()) return;

    const { error } = await managerClient!
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", managerUser!.id);

    expect(error).not.toBeNull();
    await expect(getAuthRole(adminClient!, managerUser!.id)).resolves.toBe("manager");
  });

  it("admin can update another user's role through the approved service-role admin path", async () => {
    if (!requireIntegrationReady()) return;

    await adminUpdateUserRole(targetUser!.id, "manager");

    const { data: profile, error } = await adminClient!
      .from("profiles")
      .select("role")
      .eq("id", targetUser!.id)
      .single();

    expect(error).toBeNull();
    expect(profile?.role).toBe("manager");
    await expect(getAuthRole(adminClient!, targetUser!.id)).resolves.toBe("manager");
  });

  it("admin authenticated client still cannot bypass the approved role update path directly", async () => {
    if (!requireIntegrationReady()) return;

    const { error } = await adminUserClient!
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", targetUser!.id);

    expect(error).not.toBeNull();
  });

  it("service-role user creation path still creates profile and auth metadata roles", async () => {
    if (!requireIntegrationReady()) return;

    const created = await adminCreateUser({
      name: "Service Path Role Test",
      email: `s1-service-${Date.now()}@example.com`,
      password,
      role: "manager",
    });

    await adminClient!.from("profiles").update({
      test_run_id: testRunId,
      created_by_test: true,
    }).eq("id", created.id);

    try {
      const { data: profile, error } = await adminClient!
        .from("profiles")
        .select("role")
        .eq("id", created.id)
        .single();

      expect(error).toBeNull();
      expect(profile?.role).toBe("manager");
      await expect(getAuthRole(adminClient!, created.id)).resolves.toBe("manager");
    } finally {
      await adminClient!.auth.admin.deleteUser(created.id);
      await adminClient!.from("profiles").delete().eq("id", created.id);
    }
  });
});
