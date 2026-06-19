import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow } from "@/lib/auth/require-role";

export async function getSettings() {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Access denied");
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSettingByKey(key: string) {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Access denied");
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
}
