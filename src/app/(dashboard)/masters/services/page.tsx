import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { MasterCrud } from "@/components/masters/master-crud";
import { getServices } from "@/lib/data/masters";

export default async function ServicesMasterPage() {
  await requireManagerOrAdmin();
  const services = await getServices();

  return (
    <MasterCrud
      title="Services Master"
      table="services"
      nameField="name"
      nameLabel="Service Name"
      columns={[
        { key: "name", label: "Service Name" },
        { key: "description", label: "Description" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created Date" },
      ]}
      items={services as Record<string, unknown>[]}
    />
  );
}
