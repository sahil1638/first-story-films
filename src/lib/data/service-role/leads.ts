import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadFormInput } from "@/lib/actions/leads";
import { cookies } from "next/headers";

export async function createPublicLead(input: LeadFormInput) {
  const supabase = createAdminClient();
  let testRunId: string | undefined;

  try {
    const cookieStore = await cookies();
    testRunId = cookieStore.get("test_run_id")?.value;
  } catch {
    // Ignore error if called outside of request context (e.g. static generation / build time)
  }

  const payload = {
    ...input,
    ...(testRunId ? { test_run_id: testRunId, created_by_test: true } : {}),
  };

  const { data, error } = await supabase.rpc("create_public_lead_rpc", {
    p_input: payload,
  });

  if (error) {
    throw new Error(error.message || "Failed to create public lead");
  }

  return data as string;
}

