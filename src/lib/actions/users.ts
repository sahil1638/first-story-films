"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrThrow } from "@/lib/auth/require-role";
import type { UserRole } from "@/types/database";
import { z } from "zod";
import {
  uuidSchema,
  userRoleSchema,
  createUserSchema,
  updateUserDetailsSchema,
} from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";

export async function updateUserRole(userId: string, role: UserRole) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    const parsedRole = userRoleSchema.parse(role);

    await requireAdminOrThrow();
    const admin = createAdminClient();
    const { data: user, error: authError } = await admin.auth.admin.updateUserById(parsedUserId, {
      user_metadata: { role: parsedRole },
    });

    if (authError) throw new Error(authError.message || "Failed to update auth metadata");
    if (!user) throw new Error("Failed to update user metadata");

    const supabase = await createClient();
    const { error: profileError } = await supabase.from("profiles").update({ role: parsedRole }).eq("id", parsedUserId);
    if (profileError) throw new Error(profileError.message || "Failed to update profile role");

    revalidatePath("/users");
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}) {
  return withSafeError(async () => {
    const parsed = createUserSchema.parse(data);
    await requireAdminOrThrow();

    const admin = createAdminClient();
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: {
        role: parsed.role,
        full_name: parsed.name,
      },
    });

    if (authError) {
      throw new Error(authError.message || "Failed to create user in Auth");
    }

    if (!authData.user) {
      throw new Error("Failed to create user in Auth");
    }

    // Fallback explicit upsert in profiles to ensure immediate consistency
    const supabase = await createClient();
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: authData.user.id,
        email: parsed.email,
        full_name: parsed.name,
        role: parsed.role,
      });

    if (profileError) {
      throw new Error(profileError.message || "User credentials created but failed to sync profiles table.");
    }

    revalidatePath("/users");
  });
}

export async function updateUserDetails(userId: string, data: { name: string; role: UserRole }) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    const parsedData = updateUserDetailsSchema.parse(data);
    await requireAdminOrThrow();

    const admin = createAdminClient();
    const { data: user, error: authError } = await admin.auth.admin.updateUserById(parsedUserId, {
      user_metadata: { role: parsedData.role, full_name: parsedData.name },
    });

    if (authError) {
      throw new Error(authError.message || "Failed to update auth metadata");
    }

    if (!user) {
      throw new Error("Failed to update user metadata");
    }

    const supabase = await createClient();
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: parsedData.name, role: parsedData.role })
      .eq("id", parsedUserId);

    if (profileError) {
      throw new Error(profileError.message || "Failed to update profile details");
    }

    revalidatePath("/users");
  });
}

export async function changeUserPassword(userId: string, password: string) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    const parsedPassword = z.string().min(6, "Password must be at least 6 characters").parse(password);
    await requireAdminOrThrow();

    const supabase = await createClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();

    if (currentUser && currentUser.id === parsedUserId) {
      const { data: user, error: authError } = await supabase.auth.updateUser({
        password: parsedPassword,
      });

      if (authError) {
        if (authError.message.toLowerCase().includes("different from the old password")) {
          // Ignore validation error as requested by the user
        } else {
          throw new Error(authError.message || "Failed to update your password");
        }
      }

      if (!user && (!authError || !authError.message.toLowerCase().includes("different from the old password"))) {
        throw new Error("Failed to update your password");
      }
    } else {
      const admin = createAdminClient();
      const { data: user, error: authError } = await admin.auth.admin.updateUserById(parsedUserId, {
        password: parsedPassword,
      });

      if (authError) {
        if (authError.message.toLowerCase().includes("different from the old password")) {
          // Ignore validation error as requested by the user
        } else {
          throw new Error(authError.message || "Failed to update password");
        }
      }

      if (!user && (!authError || !authError.message.toLowerCase().includes("different from the old password"))) {
        throw new Error("Failed to update password");
      }
    }

    revalidatePath("/users");
  });
}

export async function deleteUser(userId: string) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    await requireAdminOrThrow();

    const supabase = await createClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser && currentUser.id === parsedUserId) {
      throw new Error("You cannot delete your own account.");
    }

    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(parsedUserId);
    if (authError) {
      throw new Error(authError.message || "Failed to delete user in Auth");
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", parsedUserId);

    if (profileError) {
      throw new Error(profileError.message || "User credentials deleted but failed to delete profile record.");
    }

    revalidatePath("/users");
  });
}
