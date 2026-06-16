import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function persistOperationalEvent(data: {
  event: unknown;
  severity: unknown;
  alert: unknown;
  message: unknown;
  context: unknown;
}) {
  const supabase = createAdminClient();
  return supabase.from("operational_events").insert({
    event: data.event,
    severity: data.severity,
    alert: data.alert,
    message: data.message,
    context: data.context,
  });
}
