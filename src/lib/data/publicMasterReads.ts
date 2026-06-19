import "server-only";

import { createClient } from "@/lib/supabase/server";

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
