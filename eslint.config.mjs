import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message: "Supabase data access must go through src/lib/data/** or src/lib/supabase/**.",
            },
            {
              name: "@supabase/ssr",
              message: "Supabase clients must be created only in src/lib/supabase/**.",
            },
            {
              name: "@/lib/supabase/client",
              message: "Client components must use server actions or DAL-backed API routes instead of direct Supabase access.",
            },
            {
              name: "@/lib/supabase/server",
              message: "Server code outside auth exceptions must use the Data Access Layer in src/lib/data/**.",
            },
            {
              name: "@/lib/supabase/admin",
              message: "Service-role access must stay behind src/lib/data/** or rate-limit/auth exceptions.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/supabase/*"],
              message: "Supabase wrappers are only importable from the DAL, auth exceptions, proxy, and rate limiter.",
            },
          ],
        },
      ],
    },
  },
  // Targeted overrides to allow Supabase imports in DAL, tests, and auth/rate-limit/proxy exceptions
  {
    files: [
      "src/lib/data/**/*.{ts,tsx}",
      "src/lib/supabase/**/*.{ts,tsx}",
      "src/lib/security/**/*.test.ts",
      "src/lib/security/test-cleanup.ts",
      "src/lib/security/rate-limit.ts",
      "src/lib/auth/sync-profile.ts",
      "src/app/api/auth/**/*.{ts,tsx}",
      "src/app/auth/**/*.{ts,tsx}",
      "src/proxy.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Enforce Next.js client component boundary rules (Issue N1)
  {
    files: [
      "src/components/**/*.{ts,tsx}",
      "src/app/login/page.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/server",
              message: "Client Components cannot import the Supabase server client wrapper.",
            },
            {
              name: "@/lib/supabase/admin",
              message: "Client Components cannot import the Supabase admin client wrapper.",
            },
            {
              name: "@supabase/supabase-js",
              message: "Client Components cannot import the Supabase JS client directly.",
            },
            {
              name: "@supabase/ssr",
              message: "Client Components cannot import Supabase SSR helpers.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/data/**", "@/lib/data/*"],
              message: "Client Components cannot import server-only Data Access Layer (DAL) modules.",
            },
            {
              group: ["@/lib/data/service-role/**", "@/lib/data/service-role/*"],
              message: "Client Components cannot import service-role admin modules.",
            },
          ],
        },
      ],
    },
  },
  // Enforce throw-based guards in API routes, server actions, and DAL (Issue AU2)
  {
    files: [
      "src/app/api/**/*.{ts,tsx}",
      "src/lib/actions/**/*.{ts,tsx}",
      "src/lib/data/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth/ui-guards",
              message: "API routes, Server Actions, and Data Access Layer (DAL) modules must use throw-based guards (from enforce-role.ts or require-role.ts) instead of redirect-based UI guards.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
