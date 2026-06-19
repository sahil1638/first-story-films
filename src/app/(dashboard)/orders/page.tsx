import { getOrders } from "@/lib/data/orders";
import { OrdersTable } from "@/components/orders/orders-table";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    payment?: string;
    bill?: string;
    budget?: string;
    dateStart?: string;
    dateEnd?: string;
  }>;
}

export default async function OrdersPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const ordersData = await getOrders({
    page,
    limit: 20,
    search: searchParams.search ?? "",
    status: searchParams.status ?? "all",
    payment: searchParams.payment ?? "all",
    bill: searchParams.bill ?? "all",
    budget: searchParams.budget ?? "all",
    dateStart: searchParams.dateStart ?? "",
    dateEnd: searchParams.dateEnd ?? "",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Orders</h1>
      </div>
      <OrdersTable orders={ordersData.orders} totalItems={ordersData.count} />
    </div>
  );
}
