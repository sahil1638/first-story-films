import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { MasterCrud } from "@/components/masters/master-crud";
import { getDeliverables } from "@/lib/data/masters";

export default async function DeliverablesMasterPage() {
  await requireManagerOrAdmin();
  const deliverables = await getDeliverables();

  return (
    <MasterCrud
      title="Deliverables Master"
      table="deliverables"
      nameField="title"
      nameLabel="Title"
      columns={[
        { key: "title", label: "Title" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
      items={deliverables as Record<string, unknown>[]}
    />
  );
}
