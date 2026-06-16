import { describe, it, expect } from "vitest";
import eslintConfig from "../../../eslint.config.mjs";

interface RestrictedImportPath {
  name: string;
  message?: string;
}

interface RestrictedImportPattern {
  group: string[];
  message?: string;
}

interface RestrictedImportsConfig {
  paths?: RestrictedImportPath[];
  patterns?: RestrictedImportPattern[];
}

interface ESLintRuleConfig {
  files?: string[];
  rules?: {
    "no-restricted-imports"?: [string, RestrictedImportsConfig];
    [key: string]: unknown;
  };
}

describe("Next.js Server/Client Boundary Lint Rules (Issue N1)", () => {
  it("should enforce that client components cannot import server-only modules or Supabase server/admin", () => {
    // Find the client components rule block
    const clientBlock = (eslintConfig as ESLintRuleConfig[]).find(
      (block) =>
        block.files &&
        block.files.includes("src/components/**/*.{ts,tsx}") &&
        block.files.includes("src/app/login/page.tsx")
    );

    expect(clientBlock).toBeDefined();
    const rules = clientBlock?.rules;
    expect(rules).toBeDefined();

    const restrictedImports = rules?.["no-restricted-imports"];
    expect(restrictedImports).toBeDefined();

    const config = (restrictedImports as [string, RestrictedImportsConfig])[1];
    expect(config.paths).toBeDefined();
    expect(config.patterns).toBeDefined();

    // Verify server Supabase wrappers are restricted
    expect(config.paths?.some((p) => p.name === "@/lib/supabase/server")).toBe(true);
    expect(config.paths?.some((p) => p.name === "@/lib/supabase/admin")).toBe(true);

    // Verify direct Supabase SDK is restricted
    expect(config.paths?.some((p) => p.name === "@supabase/supabase-js")).toBe(true);

    // Verify server-only DAL and service-role modules are restricted
    expect(config.patterns?.some((p) => p.group.includes("@/lib/data/**"))).toBe(true);
    expect(config.patterns?.some((p) => p.group.includes("@/lib/data/service-role/**"))).toBe(true);
  });
});

