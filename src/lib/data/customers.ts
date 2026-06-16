import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function getCustomers() {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, couple_name, contact_number, email, order_id, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch customers");
  }
  return data ?? [];
}

export async function getCustomerById(id: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, couple_name, contact_number, email, created_at")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message || "Failed to fetch customer");
  }
  return data;
}

export async function getCustomerOrders(contactNumber: string) {
  await requireManagerOrAdminOrThrow();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_services(id, person_count, services(name))")
    .eq("contact_number", contactNumber)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch customer orders");
  }
  return data ?? [];
}
