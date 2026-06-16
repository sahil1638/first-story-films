import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    throw new Error("Admin access required");
  }

  // Automatically reconcile all roles before reading profiles
  try {
    const { reconcileAllUserRoles } = await import("@/lib/data/service-role/users");
    await reconcileAllUserRoles();
  } catch (err) {
    console.error("Auto-reconciliation during getProfiles failed:", err);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch profiles");
  }
  return (data ?? []) as Profile[];
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    return null;
  }

  return data as Profile;
}

export async function getCurrentUserProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return getProfileById(user.id);
}
