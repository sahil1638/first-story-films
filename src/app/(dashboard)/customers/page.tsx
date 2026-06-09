import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { CustomersTable } from "@/components/customers/customers-table";

type CustomerRow = {
  id: string;
  couple_name: string;
  contact_number: string;
  email: string | null;
  order_id: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  your_name: string;
  contact_number: string;
  email: string | null;
  total_amount: number;
  created_at: string;
};

export default async function CustomersPage() {
  await requireManagerOrAdmin();
  const supabase = await createClient();
  const [{ data: customers }, { data: orders }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, couple_name, contact_number, email, order_id, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, your_name, contact_number, email, total_amount, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const ordersByContact = new Map<string, OrderRow[]>();
  for (const order of (orders ?? []) as OrderRow[]) {
    const key = order.contact_number;
    ordersByContact.set(key, [...(ordersByContact.get(key) ?? []), order]);
  }

  const groupedCustomers = Array.from(
    ((customers ?? []) as CustomerRow[]).reduce((map, customer) => {
      if (!map.has(customer.contact_number)) {
        map.set(customer.contact_number, customer);
      }
      return map;
    }, new Map<string, CustomerRow>())
  ).map(([contactNumber, customer]) => {
    const customerOrders = ordersByContact.get(contactNumber) ?? [];
    const latestOrder = customerOrders[0];
    return {
      ...customer,
      displayName: latestOrder?.your_name || customer.couple_name,
      displayEmail: latestOrder?.email || customer.email,
      latestOrderDate: latestOrder?.created_at ?? customer.created_at,
    };
  });

  return <CustomersTable customers={groupedCustomers} />;
}
