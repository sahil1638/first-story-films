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
import { NextRequest } from "next/server";

// Import route handlers
import { GET as getAccounts, POST as postAccount } from "@/app/api/accounting/accounts/route";
import { GET as getCategories, POST as postCategory } from "@/app/api/accounting/categories/route";
import { GET as getEntries } from "@/app/api/accounting/entries/route";

// Import server actions
import { deleteOrder } from "@/lib/actions/orders";
import { addEntry } from "@/lib/actions/accounting";
import { deleteLead } from "@/lib/actions/leads";

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
  const msg = `Skipping API authorization integration test: ${integrationSkipReason || "Supabase test database unavailable"}`;
  if (isCi) {
    throw new Error(msg);
  }
  console.warn(msg);
  return false;
}

describe("API and Action Authorization Boundary Tests (AU1)", () => {
  let adminClient!: SupabaseClient;
  let managerClient!: SupabaseClient;
  let salesClient!: SupabaseClient;
  let anonClient!: SupabaseClient;

  let managerUser!: User;
  let salesUser!: User;

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
      const managerEmail = `auth-boundary-manager-${stamp}@example.com`;
      const salesEmail = `auth-boundary-sales-${stamp}@example.com`;
      const password = "TestPassword123!";

      // 1. Create temporary test users
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

      // Tag created users with testRunId
      for (const u of [managerUser, salesUser]) {
        if (u) {
          await adminClient.from("profiles").update({
            test_run_id: testRunId,
            created_by_test: true,
          }).eq("id", u.id);
        }
      }

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

      integrationReady = true;
    } catch (error) {
      if (isCi) throw error;
      integrationSkipReason = error instanceof Error ? error.message : String(error);
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe("Direct Route Handlers Protection", () => {
    it("should return 401 Unauthorized for unauthenticated clients accessing accounting accounts GET/POST", async () => {
      if (!requireIntegrationReady()) return;
      currentMockClient = anonClient;

      const getReq = new NextRequest("http://localhost/api/accounting/accounts");
      const getRes = await getAccounts(getReq);
      expect(getRes.status).toBe(401);

      const postReq = new NextRequest("http://localhost/api/accounting/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Unauthenticated Account", openingBalance: 1000 }),
      });
      const postRes = await postAccount(postReq);
      expect(postRes.status).toBe(401);
    });

    it("should return 403 Forbidden for sales clients accessing accounting accounts GET/POST", async () => {
      if (!requireIntegrationReady()) return;
      currentMockClient = salesClient;

      const getReq = new NextRequest("http://localhost/api/accounting/accounts");
      const getRes = await getAccounts(getReq);
      expect(getRes.status).toBe(403);

      const postReq = new NextRequest("http://localhost/api/accounting/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Sales Account", openingBalance: 1000 }),
      });
      const postRes = await postAccount(postReq);
      expect(postRes.status).toBe(403);
    });

    it("should return 401/403 for categories route handlers GET/POST", async () => {
      if (!requireIntegrationReady()) return;
      
      // Unauthenticated
      currentMockClient = anonClient;
      const getReqAnon = new NextRequest("http://localhost/api/accounting/categories");
      const getResAnon = await getCategories(getReqAnon);
      expect(getResAnon.status).toBe(401);

      const postReqAnon = new NextRequest("http://localhost/api/accounting/categories", {
        method: "POST",
        body: JSON.stringify({ name: "Anon Category", type: "income" }),
      });
      const postResAnon = await postCategory(postReqAnon);
      expect(postResAnon.status).toBe(401);

      // Unauthorized (Sales)
      currentMockClient = salesClient;
      const getReqSales = new NextRequest("http://localhost/api/accounting/categories");
      const getResSales = await getCategories(getReqSales);
      expect(getResSales.status).toBe(403);

      const postReqSales = new NextRequest("http://localhost/api/accounting/categories", {
        method: "POST",
        body: JSON.stringify({ name: "Sales Category", type: "income" }),
      });
      const postResSales = await postCategory(postReqSales);
      expect(postResSales.status).toBe(403);
    });

    it("should return 401/403 for entries route handlers GET/POST", async () => {
      if (!requireIntegrationReady()) return;

      // Unauthenticated
      currentMockClient = anonClient;
      const getReqAnon = new NextRequest("http://localhost/api/accounting/entries");
      const getResAnon = await getEntries(getReqAnon);
      expect(getResAnon.status).toBe(401);

      // Unauthorized (Sales)
      currentMockClient = salesClient;
      const getReqSales = new NextRequest("http://localhost/api/accounting/entries");
      const getResSales = await getEntries(getReqSales);
      expect(getResSales.status).toBe(403);
    });
  });

  describe("Direct Server Actions Protection", () => {
    const dummyUuid = "123e4567-e89b-12d3-a456-426614174000";

    it("should reject direct deletion of orders via server action for sales role", async () => {
      if (!requireIntegrationReady()) return;
      currentMockClient = salesClient;

      await expect(deleteOrder(dummyUuid)).rejects.toThrow("Manager or admin access required");
    });

    it("should reject direct adding of entries via server action for sales role", async () => {
      if (!requireIntegrationReady()) return;
      currentMockClient = salesClient;

      await expect(
        addEntry("income", dummyUuid, dummyUuid, 100, "2026-06-12")
      ).rejects.toThrow("Manager or admin access required");
    });

    it("should reject direct deletion of leads via server action for sales role", async () => {
      if (!requireIntegrationReady()) return;
      currentMockClient = salesClient;

      await expect(deleteLead(dummyUuid)).rejects.toThrow("Manager or admin access required");
    });
  });

  describe("Direct DB RPC Protection (Bypassing Application Layer)", () => {
    const dummyUuid = "123e4567-e89b-12d3-a456-426614174000";

    it("should reject direct RPC calls from anonymous/unauthenticated users", async () => {
      if (!requireIntegrationReady()) return;

      const { error: err1 } = await anonClient.rpc("delete_order_cascade", { order_id: dummyUuid });
      expect(err1).not.toBeNull();
      // Unauthenticated users either have no execute permission or fail current_user_role()
      expect(err1?.message).toMatch(/permission denied|Unauthorized/i);

      const { error: err2 } = await anonClient.rpc("delete_accounting_entry_cascade", { entry_id: dummyUuid });
      expect(err2).not.toBeNull();
      expect(err2?.message).toMatch(/permission denied|Unauthorized/i);
    });

    it("should reject direct RPC calls from unauthorized users (sales role)", async () => {
      if (!requireIntegrationReady()) return;

      const { error: err1 } = await salesClient.rpc("delete_order_cascade", { order_id: dummyUuid });
      expect(err1).not.toBeNull();
      expect(err1?.message).toContain("Manager or admin access required");

      const { error: err2 } = await salesClient.rpc("delete_accounting_entry_cascade", { entry_id: dummyUuid });
      expect(err2).not.toBeNull();
      expect(err2?.message).toContain("Manager or admin access required");
    });
  });
});
