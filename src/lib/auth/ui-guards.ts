import "server-only";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/enforce-role";
import type { Profile, UserRole } from "@/types/database";

export async function getProfileOrRedirect(redirectTo = "/login"): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    redirect(redirectTo);
  }
  return profile;
}

export async function requireRole(roles: UserRole[], redirectTo = "/dashboard"): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    redirect("/login");
  }
  if (!roles.includes(profile.role)) {
    redirect(redirectTo);
  }
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  return requireRole(["admin"]);
}

export async function requireManagerOrAdmin(): Promise<Profile> {
  return requireRole(["admin", "manager"]);
}
