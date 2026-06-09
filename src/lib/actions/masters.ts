"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

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
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();

  if (id) {
    const { error } = await supabase.from(table).update(data).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from(table).insert(data);
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/masters/${table === "crew_members" ? "crew" : table}`);
}

export async function deleteMaster(table: TableName, id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/masters/${table === "crew_members" ? "crew" : table}`);
}

export async function syncAgencyServices(agencyId: string, serviceIds: string[]) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  await supabase.from("agency_services").delete().eq("agency_id", agencyId);
  if (serviceIds.length > 0) {
    await supabase.from("agency_services").insert(
      serviceIds.map((service_id) => ({ agency_id: agencyId, service_id }))
    );
  }
  revalidatePath("/masters/agencies");
}

export async function syncCrewServices(crewId: string, serviceIds: string[]) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  await supabase.from("crew_member_services").delete().eq("crew_member_id", crewId);
  if (serviceIds.length > 0) {
    await supabase.from("crew_member_services").insert(
      serviceIds.map((service_id) => ({ crew_member_id: crewId, service_id }))
    );
  }
  revalidatePath("/masters/crew");
}

export async function updateSettings(key: string, value: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
