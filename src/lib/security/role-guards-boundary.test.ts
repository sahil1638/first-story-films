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

vi.mock("@/lib/data/users", () => ({
  getCurrentUserProfile: vi.fn(),
}));

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
});
