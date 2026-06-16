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

  if (id) {
    const { error } = await supabase.from(table).update(data).eq("id", id);
    if (error) throw new Error(error.message);
    return id;
  } else {
    const { data: inserted, error } = await supabase.from(table).insert(data).select("id").single();
    if (error || !inserted) throw new Error(error?.message ?? "Insert failed");
    return inserted.id;
  }
}

export async function syncMasterServices(
  table: MasterTableName,
  id: string,
  serviceIds: string[]
) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  if (table === "agencies") {
    const { error: delError } = await supabase.from("agency_services").delete().eq("agency_id", id);
    if (delError) throw new Error(delError.message);
    if (serviceIds.length > 0) {
      const { error: insError } = await supabase.from("agency_services").insert(
        serviceIds.map((service_id) => ({ agency_id: id, service_id }))
      );
      if (insError) throw new Error(insError.message);
    }
  }

  if (table === "crew_members") {
    const { error: delError } = await supabase.from("crew_member_services").delete().eq("crew_member_id", id);
    if (delError) throw new Error(delError.message);
    if (serviceIds.length > 0) {
      const { error: insError } = await supabase.from("crew_member_services").insert(
        serviceIds.map((service_id) => ({ crew_member_id: id, service_id }))
      );
      if (insError) throw new Error(insError.message);
    }
  }
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
