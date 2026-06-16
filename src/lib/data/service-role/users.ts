import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";
import { logOperationalEvent } from "@/lib/ops/operational-logger";

async function updateProfileWithRetry(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  updates: Record<string, unknown>,
  maxRetries = 3,
  delayMs = 50
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await admin.from("profiles").update(updates).eq("id", userId);
    if (!error) {
      return; // success
    }
    lastError = error;
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error("Profile update failed after retries");
}

async function upsertProfileWithRetry(
  admin: ReturnType<typeof createAdminClient>,
  profile: Record<string, unknown>,
  maxRetries = 3,
  delayMs = 50
) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { error } = await admin.from("profiles").upsert(profile);
    if (!error) {
      return; // success
    }
    lastError = error;
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error("Profile upsert failed after retries");
}

export async function adminUpdateUserRole(userId: string, role: UserRole) {
  const admin = createAdminClient();
  try {
    const { data, error } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });
    if (error) {
      throw new Error(error.message || "Failed to update auth metadata");
    }

    try {
      await updateProfileWithRetry(admin, userId, { role });
    } catch (profileError) {
      await logOperationalEvent({
        event: "split_brain_alert",
        severity: "error",
        message: `CRITICAL: Profile role update failed after Auth update succeeded. Split-brain state active for user ${userId}.`,
        alert: true,
        context: { action: "update_role_sync_failure", userId, role, error: profileError },
      });
      throw new Error(`Role updated in Auth, but failed to sync to profiles table for user ${userId}. Please run the repair action to resync.`);
    }

    logOperationalEvent({
      event: "role_change_succeeded",
      severity: "info",
      message: "User role updated.",
      alert: false,
      context: { action: "update_role", userId, role },
    });

    return data;
  } catch (error) {
    await logOperationalEvent({
      event: "role_change_failed",
      severity: "error",
      message: "User role update failed.",
      context: { action: "update_role", userId, role, error },
    });
    throw error;
  }
}

export async function adminCreateUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}) {
  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      role: data.role,
      full_name: data.name,
    },
  });
  if (authError || !authData.user) {
    throw new Error(authError?.message || "Failed to create user in Auth");
  }

  try {
    await upsertProfileWithRetry(admin, {
      id: authData.user.id,
      email: data.email,
      full_name: data.name,
      role: data.role,
    });
  } catch (error) {
    await logOperationalEvent({
      event: "split_brain_alert",
      severity: "error",
      message: `CRITICAL: Profile creation failed after Auth creation succeeded. Split-brain state active for user ${authData.user.id}.`,
      alert: true,
      context: { action: "create_user_sync_failure", userId: authData.user.id, role: data.role, error },
    });
    throw new Error(`User created in Auth, but profile table sync failed for user ${authData.user.id}. Please run the repair action to resync.`);
  }

  return authData.user;
}

export async function adminUpdateUserDetails(userId: string, data: { name: string; role: UserRole }) {
  const admin = createAdminClient();
  try {
    const { data: user, error: authError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { role: data.role, full_name: data.name },
    });
    if (authError || !user) {
      throw new Error(authError?.message || "Failed to update auth metadata");
    }

    try {
      await updateProfileWithRetry(admin, userId, { full_name: data.name, role: data.role });
    } catch (profileError) {
      await logOperationalEvent({
        event: "split_brain_alert",
        severity: "error",
        message: `CRITICAL: Profile update failed after Auth update succeeded. Split-brain state active for user ${userId}.`,
        alert: true,
        context: { action: "update_details_sync_failure", userId, role: data.role, error: profileError },
      });
      throw new Error(`User details updated in Auth, but profile table sync failed for user ${userId}. Please run the repair action to resync.`);
    }

    logOperationalEvent({
      event: "role_change_succeeded",
      severity: "info",
      message: "User details and role updated.",
      alert: false,
      context: { action: "update_details", userId, role: data.role },
    });

    return user;
  } catch (error) {
    await logOperationalEvent({
      event: "role_change_failed",
      severity: "error",
      message: "User details and role update failed.",
      context: { action: "update_details", userId, role: data.role, error },
    });
    throw error;
  }
}

export async function adminChangeUserPassword(userId: string, password: string) {
  const admin = createAdminClient();
  const { data: user, error: authError } = await admin.auth.admin.updateUserById(userId, {
    password,
  });
  if (authError || !user) {
    throw new Error(authError?.message || "Failed to update password");
  }
  return user;
}

export async function adminDeleteUser(userId: string) {
  const admin = createAdminClient();
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(error.message || "Failed to delete user in Auth");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      throw new Error(profileError.message || "User credentials deleted but failed to delete profile record.");
    }

    logOperationalEvent({
      event: "role_change_succeeded",
      severity: "info",
      message: "User deleted.",
      alert: false,
      context: { action: "delete_user", userId },
    });
  } catch (error) {
    await logOperationalEvent({
      event: "role_change_failed",
      severity: "error",
      message: "User delete failed.",
      context: { action: "delete_user", userId, error },
    });
    throw error;
  }
}

export async function adminRepairUserRole(userId: string, maxRetries = 3, delayMs = 50) {
  const admin = createAdminClient();

  // Log repair attempt
  await logOperationalEvent({
    event: "role_repair_attempt",
    severity: "info",
    message: `Attempting to repair user role metadata from profiles.role for user ${userId}.`,
    alert: false,
    context: { action: "repair_role_attempt", userId },
  });

  // 1. Read profiles.role (treat it as the authoritative source of truth)
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, email, full_name")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    const errorMsg = profileError?.message || `Profile not found for user ${userId}. Cannot repair.`;
    await logOperationalEvent({
      event: "role_repair_failed",
      severity: "error",
      message: `CRITICAL: Role repair failed because profiles record is missing or unreadable for user ${userId}.`,
      alert: true,
      context: { action: "repair_role_fail", userId, error: errorMsg },
    });
    throw new Error(errorMsg);
  }

  // 2. Sync Supabase Auth metadata from profiles.role with retry logic
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data: userData, error: authError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          role: profile.role,
          full_name: profile.full_name,
        },
      });

      if (!authError && userData) {
        // Success!
        await logOperationalEvent({
          event: "role_repair_succeeded",
          severity: "info",
          message: `User role metadata repaired successfully from profiles.role for user ${userId} to role ${profile.role}.`,
          alert: false,
          context: { action: "repair_role_success", userId, role: profile.role },
        });
        return userData;
      }
      lastError = authError;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // If we reach here, all retries failed. This is an unresolved split-brain case.
  const finalErrorMsg = lastError?.message || String(lastError) || "Unknown error";
  await logOperationalEvent({
    event: "role_repair_unresolved",
    severity: "error",
    message: `CRITICAL: Role reconciliation failed for user ${userId} after ${maxRetries} attempts. Unresolved split-brain state exists.`,
    alert: true,
    context: { action: "repair_role_unresolved", userId, role: profile.role, error: finalErrorMsg },
  });

  throw new Error(`Role reconciliation failed after ${maxRetries} retries: ${finalErrorMsg}`);
}

export async function reconcileAllUserRoles() {
  const admin = createAdminClient();
  const { data: { users: authUsers }, error: listError } = await admin.auth.admin.listUsers();
  if (listError || !authUsers) {
    throw new Error(listError?.message || "Failed to list auth users during reconciliation");
  }

  // Fetch all profiles
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, role, full_name");

  if (profilesError || !profiles) {
    throw new Error(profilesError?.message || "Failed to fetch profiles during reconciliation");
  }

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  let reconcileCount = 0;

  for (const authUser of authUsers) {
    const dbProfile = profileMap.get(authUser.id);
    if (!dbProfile) {
      continue;
    }

    const authUserRole = authUser.user_metadata?.role;
    const authAppRole = authUser.app_metadata?.role;

    if (authUserRole !== dbProfile.role || authAppRole !== dbProfile.role) {
      try {
        await adminRepairUserRole(authUser.id);
        reconcileCount++;
      } catch (err) {
        console.error(`Auto-reconciliation failed for user ${authUser.id}:`, err);
      }
    }
  }

  return reconcileCount;
}
