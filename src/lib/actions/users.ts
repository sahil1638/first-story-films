"use server";

import { revalidatePath } from "next/cache";
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
import {
  adminUpdateUserRole,
  adminCreateUser,
  adminUpdateUserDetails,
  adminChangeUserPassword,
  adminDeleteUser,
  adminRepairUserRole,
} from "@/lib/data/service-role/users";
import { getCurrentAuthUserId, updateCurrentUserPassword } from "@/lib/data/auth";

export async function updateUserRole(userId: string, role: UserRole) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    const parsedRole = userRoleSchema.parse(role);

    await requireAdminOrThrow();
    await adminUpdateUserRole(parsedUserId, parsedRole);

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
    await adminCreateUser(parsed);

    revalidatePath("/users");
  });
}

export async function updateUserDetails(userId: string, data: { name: string; role: UserRole }) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    const parsedData = updateUserDetailsSchema.parse(data);
    await requireAdminOrThrow();
    await adminUpdateUserDetails(parsedUserId, parsedData);

    revalidatePath("/users");
  });
}

export async function changeUserPassword(userId: string, password: string) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    const parsedPassword = z.string().min(6, "Password must be at least 6 characters").parse(password);
    await requireAdminOrThrow();

    const currentUserId = await getCurrentAuthUserId();

    if (currentUserId === parsedUserId) {
      await updateCurrentUserPassword(parsedPassword);
    } else {
      await adminChangeUserPassword(parsedUserId, parsedPassword);
    }

    revalidatePath("/users");
  });
}

export async function deleteUser(userId: string) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    await requireAdminOrThrow();

    const currentUserId = await getCurrentAuthUserId();
    if (currentUserId === parsedUserId) {
      throw new Error("You cannot delete your own account.");
    }

    await adminDeleteUser(parsedUserId);

    revalidatePath("/users");
  });
}

export async function repairUserRole(userId: string) {
  return withSafeError(async () => {
    const parsedUserId = uuidSchema.parse(userId);
    await requireAdminOrThrow();
    await adminRepairUserRole(parsedUserId);
    revalidatePath("/users");
  });
}
