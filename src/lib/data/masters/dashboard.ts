import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireRoleOrThrow, requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

// Protected Reads: Admin, Manager, Sales
export async function getServices() {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Access denied");
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getEvents() {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Access denied");
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDeliverables() {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Access denied");
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliverables").select("*").order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getCrewMembers() {
  await requireRoleOrThrow(["admin", "manager", "sales"], "Access denied");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crew_members")
    .select("*, crew_member_services(service_id)")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Protected Reads: Admin and Manager only
export async function getAgencies() {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .select("*, agency_services(service_id)")
    .order("company_name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
