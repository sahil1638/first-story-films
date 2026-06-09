import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database";

const VALID_ROLES: UserRole[] = ["admin", "manager", "sales"];

export function roleFromMetadata(
  metadata: Record<string, unknown> | undefined
): UserRole | null {
  const raw = String(metadata?.role ?? "")
    .trim()
    .toLowerCase();
  if (VALID_ROLES.includes(raw as UserRole)) return raw as UserRole;
  return null;
}

/** Keep profiles.role in sync with auth user_metadata.role */
export async function syncProfileRoleFromMetadata(
  supabase: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown> | undefined
): Promise<UserRole | null> {
  const metaRole = roleFromMetadata(metadata);
  if (!metaRole) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (!profile) return null;

  if (profile.role !== metaRole) {
    await supabase.from("profiles").update({ role: metaRole }).eq("id", userId);
  }

  return metaRole;
}
