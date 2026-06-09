"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrThrow } from "@/lib/auth/require-role";
import type { UserRole } from "@/types/database";

export async function updateUserRole(userId: string, role: UserRole) {
  await requireAdminOrThrow();
  const admin = createAdminClient();
  const { data: user, error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  });

  if (authError) throw new Error(authError.message || "Failed to update auth metadata");
  if (!user) throw new Error("Failed to update user metadata");

  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (profileError) throw new Error(profileError.message || "Failed to update profile role");

  revalidatePath("/users");
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}) {
  await requireAdminOrThrow();

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
      email: data.email,
      full_name: data.name,
      role: data.role,
    });

  if (profileError) {
    throw new Error(profileError.message || "User credentials created but failed to sync profiles table.");
  }

  revalidatePath("/users");
}

export async function updateUserDetails(userId: string, data: { name: string; role: UserRole }) {
  await requireAdminOrThrow();

  const admin = createAdminClient();
  const { data: user, error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { role: data.role, full_name: data.name },
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
    .update({ full_name: data.name, role: data.role })
    .eq("id", userId);

  if (profileError) {
    throw new Error(profileError.message || "Failed to update profile details");
  }

  revalidatePath("/users");
}

export async function changeUserPassword(userId: string, password: string) {
  await requireAdminOrThrow();

  if (!password || password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  if (currentUser && currentUser.id === userId) {
    const { data: user, error: authError } = await supabase.auth.updateUser({
      password: password,
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
    const { data: user, error: authError } = await admin.auth.admin.updateUserById(userId, {
      password: password,
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
}

export async function deleteUser(userId: string) {
  await requireAdminOrThrow();

  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  if (currentUser && currentUser.id === userId) {
    throw new Error("You cannot delete your own account.");
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    throw new Error(authError.message || "Failed to delete user in Auth");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profileError) {
    throw new Error(profileError.message || "User credentials deleted but failed to delete profile record.");
  }

  revalidatePath("/users");
}


