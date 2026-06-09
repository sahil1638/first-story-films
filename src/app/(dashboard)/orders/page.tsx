import { createClient } from "@/lib/supabase/server";
import { OrdersTable } from "@/components/orders/orders-table";
import type { Order } from "@/types/database";

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Order[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Orders</h1>
      </div>
      <OrdersTable orders={orders} />
    </div>
  );
}
