import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { MasterCrud } from "@/components/masters/master-crud";
import { getEvents } from "@/lib/data/masters";

export default async function EventsMasterPage() {
  await requireManagerOrAdmin();
  const events = await getEvents();

  return (
    <MasterCrud
      title="Events Master"
      table="events"
      nameField="name"
      nameLabel="Event Name"
      columns={[
        { key: "name", label: "Event Name" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
      items={events as Record<string, unknown>[]}
    />
  );
}
