import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import type { MasterTableName, UpsertMasterInput } from "@/lib/security/schemas";

export async function getServices() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEvents() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getActiveServices() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getActiveEvents() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "active")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDeliverables() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliverables").select("*").order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAgencies() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .select("*, agency_services(service_id)")
    .order("company_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCrewMembers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crew_members")
    .select("*, crew_member_services(service_id)")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSettingByKey(key: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value ?? null;
}

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

export async function getServicesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDeliverablesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliverables").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEventsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("id, name").in("id", ids);
  if (error) throw new Error(error.message);
  return data ?? [];
}
