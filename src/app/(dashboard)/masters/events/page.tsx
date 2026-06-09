import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { MasterCrud } from "@/components/masters/master-crud";

export default async function EventsMasterPage() {
  await requireManagerOrAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });

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
      items={(data ?? []) as Record<string, unknown>[]}
    />
  );
}
