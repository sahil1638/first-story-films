import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getCurrentAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function updateCurrentUserPassword(password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.message.toLowerCase().includes("different from the old password")) {
      return;
    }
    throw new Error(error.message || "Failed to update your password");
  }

  if (!data.user) {
    throw new Error("Failed to update your password");
  }
}
