/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url) => {
    const err = new Error("NEXT_REDIRECT");
    (err as Error & { url?: string }).url = url;
    throw err;
  }),
}));

import eslintConfig from "../../../eslint.config.mjs";
import { requireRoleOrThrow } from "@/lib/auth/enforce-role";
import { requireRole } from "@/lib/auth/ui-guards";
import { getCurrentUserProfile } from "@/lib/data/users";
import {
  getOrdersSummaryForCustomers,
  getProductionJobsByOrderId,
  getOrderById,
  getPaymentsByOrderId,
} from "@/lib/data/orders";
import {
  getServices,
  getEvents,
  getDeliverables,
  getAgencies,
  getCrewMembers,
  getSettings,
  getSettingByKey,
} from "@/lib/data/masters";

vi.mock("@/lib/data/users", () => ({
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
    then: (resolve: any) => resolve({ data: [], error: null }),
  };
  const mockSupabase = {
    from: vi.fn(() => chain),
  };
  return {
    createClient: vi.fn().mockResolvedValue(mockSupabase),
  };
});

interface RestrictedImportPath {
  name: string;
  message?: string;
}

interface RestrictedImportsConfig {
  paths?: RestrictedImportPath[];
}

interface ESLintRuleConfig {
  files?: string[];
  rules?: {
    "no-restricted-imports"?: [string, RestrictedImportsConfig];
    [key: string]: unknown;
  };
}

describe("Role Guards Boundary and Behavior (Issue AU2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should enforce that API, Actions, and DAL files cannot import redirect-based UI guards", () => {
    const apiActionsDalBlock = (eslintConfig as ESLintRuleConfig[]).find(
      (block) =>
        block.files &&
        block.files.includes("src/app/api/**/*.{ts,tsx}") &&
        block.files.includes("src/lib/actions/**/*.{ts,tsx}") &&
        block.files.includes("src/lib/data/**/*.{ts,tsx}")
    );

    expect(apiActionsDalBlock).toBeDefined();
    const rules = apiActionsDalBlock?.rules;
    expect(rules).toBeDefined();

    const restrictedImports = rules?.["no-restricted-imports"];
    expect(restrictedImports).toBeDefined();

    const config = (restrictedImports as [string, RestrictedImportsConfig])[1];
    expect(config.paths).toBeDefined();
    expect(config.paths?.some((p) => p.name === "@/lib/auth/ui-guards")).toBe(true);
  });

  it("requireRoleOrThrow (enforce-role.ts) should throw an error on failure", async () => {
    vi.mocked(getCurrentUserProfile).mockResolvedValue(null);

    await expect(requireRoleOrThrow(["admin"])).rejects.toThrow("Unauthorized");
  });

  it("requireRole (ui-guards.ts) should invoke Next.js redirect on failure", async () => {
    vi.mocked(getCurrentUserProfile).mockResolvedValue(null);
    const { redirect } = await import("next/navigation");

    await expect(requireRole(["admin"])).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/login");
  });

  describe("Orders DAL Reads Role Guards (Issue A1)", () => {
    it("should allow admin or manager to access getOrdersSummaryForCustomers and getProductionJobsByOrderId, but throw for sales or crew", async () => {
      // 1. Admin passes
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "admin", id: "1" } as any);
      await expect(getOrdersSummaryForCustomers()).resolves.not.toThrow();
      await expect(getProductionJobsByOrderId("order-1")).resolves.not.toThrow();

      // 2. Manager passes
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "manager", id: "2" } as any);
      await expect(getOrdersSummaryForCustomers()).resolves.not.toThrow();
      await expect(getProductionJobsByOrderId("order-1")).resolves.not.toThrow();

      // 3. Sales throws
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "sales", id: "3" } as any);
      await expect(getOrdersSummaryForCustomers()).rejects.toThrow("Manager or admin access required");
      await expect(getProductionJobsByOrderId("order-1")).rejects.toThrow("Manager or admin access required");

      // 4. Crew throws
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "crew", id: "4" } as any);
      await expect(getOrdersSummaryForCustomers()).rejects.toThrow("Manager or admin access required");
      await expect(getProductionJobsByOrderId("order-1")).rejects.toThrow("Manager or admin access required");
    });

    it("should allow admin, manager, or sales to access getOrderById and getPaymentsByOrderId, but throw for crew", async () => {
      // 1. Admin passes
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "admin", id: "1" } as any);
      await expect(getOrderById("order-1")).resolves.not.toThrow();
      await expect(getPaymentsByOrderId("order-1")).resolves.not.toThrow();

      // 2. Manager passes
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "manager", id: "2" } as any);
      await expect(getOrderById("order-1")).resolves.not.toThrow();
      await expect(getPaymentsByOrderId("order-1")).resolves.not.toThrow();

      // 3. Sales passes
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "sales", id: "3" } as any);
      await expect(getOrderById("order-1")).resolves.not.toThrow();
      await expect(getPaymentsByOrderId("order-1")).resolves.not.toThrow();

      // 4. Crew throws
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "crew", id: "4" } as any);
      await expect(getOrderById("order-1")).rejects.toThrow("Sales access required");
      await expect(getPaymentsByOrderId("order-1")).rejects.toThrow("Sales access required");
    });
  });

  describe("Masters and Settings Reads Role Guards (Issue SEC-03)", () => {
    it("should allow admin, manager, or sales to read services, events, deliverables, crew, and settings, but throw for crew", async () => {
      for (const role of ["admin", "manager", "sales"] as const) {
        vi.mocked(getCurrentUserProfile).mockResolvedValue({ role, id: "1" } as any);
        await expect(getServices()).resolves.not.toThrow();
        await expect(getEvents()).resolves.not.toThrow();
        await expect(getDeliverables()).resolves.not.toThrow();
        await expect(getCrewMembers()).resolves.not.toThrow();
        await expect(getSettings()).resolves.not.toThrow();
        await expect(getSettingByKey("test")).resolves.not.toThrow();
      }

      // Crew throws
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "crew", id: "2" } as any);
      await expect(getServices()).rejects.toThrow("Access denied");
      await expect(getEvents()).rejects.toThrow("Access denied");
      await expect(getDeliverables()).rejects.toThrow("Access denied");
      await expect(getCrewMembers()).rejects.toThrow("Access denied");
      await expect(getSettings()).rejects.toThrow("Access denied");
      await expect(getSettingByKey("test")).rejects.toThrow("Access denied");
    });

    it("should allow only admin or manager to read agencies, but throw for sales or crew", async () => {
      // Admin/Manager pass
      for (const role of ["admin", "manager"] as const) {
        vi.mocked(getCurrentUserProfile).mockResolvedValue({ role, id: "1" } as any);
        await expect(getAgencies()).resolves.not.toThrow();
      }

      // Sales throws
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "sales", id: "2" } as any);
      await expect(getAgencies()).rejects.toThrow("Manager or admin access required");

      // Crew throws
      vi.mocked(getCurrentUserProfile).mockResolvedValue({ role: "crew", id: "3" } as any);
      await expect(getAgencies()).rejects.toThrow("Manager or admin access required");
    });
  });
});
