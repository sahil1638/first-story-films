import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const testRunId = cookieStore.get("test_run_id")?.value;

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component – ignore
          }
        },
      },
    }
  );

  const isTestOrLocal =
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_TEST_CLEANUP === "true" ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes("localhost") ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes("127.0.0.1");

  if (testRunId && isTestOrLocal) {
    return new Proxy(client, {
      get(target, prop, receiver) {
        if (prop === "from") {
          return (table: string) => {
            const queryBuilder = target.from(table);
            const originalInsert = queryBuilder.insert.bind(queryBuilder);
            const originalUpsert = queryBuilder.upsert.bind(queryBuilder);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            queryBuilder.insert = (values: any, options?: any) => {
              if (Array.isArray(values)) {
                values = values.map((v) => ({
                  ...v,
                  test_run_id: testRunId,
                  created_by_test: true,
                }));
              } else if (typeof values === "object" && values !== null) {
                values = {
                  ...values,
                  test_run_id: testRunId,
                  created_by_test: true,
                };
              }
              return originalInsert(values, options);
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            queryBuilder.upsert = (values: any, options?: any) => {
              if (Array.isArray(values)) {
                values = values.map((v) => ({
                  ...v,
                  test_run_id: testRunId,
                  created_by_test: true,
                }));
              } else if (typeof values === "object" && values !== null) {
                values = {
                  ...values,
                  test_run_id: testRunId,
                  created_by_test: true,
                };
              }
              return originalUpsert(values, options);
            };

            return queryBuilder;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  return client;
}

