import "server-only";

import { getCurrentUserProfile } from "@/lib/data/users";
import { AuthenticationError, AuthorizationError } from "@/lib/security/api-errors";
import type { Profile, UserRole } from "@/types/database";

export async function getProfile(): Promise<Profile | null> {
  return getCurrentUserProfile();
}

export async function getProfileOrThrow(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    throw new AuthenticationError();
  }
  return profile;
}

export function assertRole(profile: Profile, roles: UserRole[], message = "Unauthorized"): Profile {
  if (!roles.includes(profile.role)) {
    throw new AuthorizationError(message);
  }
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
