import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import type { MasterTableName, UpsertMasterInput } from "@/lib/security/schemas";

export async function upsertMaster(
  payload: UpsertMasterInput
): Promise<string> {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { table, data, id } = payload;
  const serviceIds = "serviceIds" in payload ? payload.serviceIds : [];

  const { data: itemId, error } = await supabase.rpc("upsert_master_with_service_mappings", {
    p_table: table,
    p_id: id ?? null,
    p_data: data,
    p_service_ids: serviceIds,
    p_test_run_id: null,
    p_created_by_test: false,
  });

  if (error || !itemId) {
    throw new Error(error?.message ?? "Upsert failed");
  }

  return itemId as string;
}

export async function syncMasterServices(
  table: MasterTableName,
  id: string,
  serviceIds: string[]
) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  if (table !== "agencies" && table !== "crew_members") {
    return;
  }

  const { error } = await supabase.rpc("upsert_master_with_service_mappings", {
    p_table: table,
    p_id: id,
    p_data: {},
    p_service_ids: serviceIds,
    p_test_run_id: null,
    p_created_by_test: false,
  });
  if (error) throw new Error(error.message);
}

export async function deleteMaster(table: MasterTableName, id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateSettings(key: string, value: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
