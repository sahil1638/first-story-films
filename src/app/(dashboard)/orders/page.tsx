import { getOrders } from "@/lib/data/orders";
import { OrdersTable } from "@/components/orders/orders-table";

export default async function OrdersPage() {
  const orders = await getOrders();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Orders</h1>
      </div>
      <OrdersTable orders={orders} />
    </div>
  );
}
