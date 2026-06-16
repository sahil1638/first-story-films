import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { CustomersTable } from "@/components/customers/customers-table";
import { getCustomers } from "@/lib/data/customers";
import { getOrdersSummaryForCustomers } from "@/lib/data/orders";

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
  const [customers, orders] = await Promise.all([
    getCustomers(),
    getOrdersSummaryForCustomers(),
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
