"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import {
  upsertMasterSchema,
  deleteMasterSchema,
  updateSettingsSchema,
} from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";

type TableName =
  | "services"
  | "events"
  | "deliverables"
  | "agencies"
  | "crew_members";

export async function upsertMaster(
  table: TableName,
  data: Record<string, unknown>,
  id?: string
) {
  return withSafeError(async () => {
    const parsed = upsertMasterSchema.parse({ table, data, id });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();

    if (parsed.id) {
      const { error } = await supabase.from(parsed.table).update(parsed.data as any).eq("id", parsed.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from(parsed.table).insert(parsed.data as any);
      if (error) throw new Error(error.message);
    }

    revalidatePath(`/masters/${parsed.table === "crew_members" ? "crew" : parsed.table}`);
  });
}

export async function deleteMaster(table: TableName, id: string) {
  return withSafeError(async () => {
    const parsed = deleteMasterSchema.parse({ table, id });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();
    const { error } = await supabase.from(parsed.table).delete().eq("id", parsed.id);
    if (error) throw new Error(error.message);
    revalidatePath(`/masters/${parsed.table === "crew_members" ? "crew" : parsed.table}`);
  });
}

export async function updateSettings(key: string, value: string) {
  return withSafeError(async () => {
    const parsed = updateSettingsSchema.parse({ key, value });
    await requireManagerOrAdminOrThrow();
    const supabase = await createClient();
    const { error } = await supabase
      .from("settings")
      .upsert({ key: parsed.key, value: parsed.value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
  });
}
