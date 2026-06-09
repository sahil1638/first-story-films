import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/database";

export async function getProfileOrRedirect(redirectTo = "/login"): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect(redirectTo);
  return profile;
}

export async function requireRole(roles: UserRole[], redirectTo = "/dashboard"): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(redirectTo);
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  return requireRole(["admin"]);
}

export async function requireManagerOrAdmin(): Promise<Profile> {
  return requireRole(["admin", "manager"]);
}

export async function getProfileOrThrow(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) throw new Error("Unauthorized");
  return profile;
}

export function assertRole(profile: Profile, roles: UserRole[], message = "Unauthorized"): Profile {
  if (!roles.includes(profile.role)) throw new Error(message);
  return profile;
}

export async function requireRoleOrThrow(
  roles: UserRole[],
  message = "Unauthorized"
): Promise<Profile> {
  const profile = await getProfileOrThrow();
  return assertRole(profile, roles, message);
}

export async function requireAdminOrThrow(): Promise<Profile> {
  return requireRoleOrThrow(["admin"], "Admin access required");
}

export async function requireManagerOrAdminOrThrow(): Promise<Profile> {
  return requireRoleOrThrow(["admin", "manager"], "Manager or admin access required");
}
