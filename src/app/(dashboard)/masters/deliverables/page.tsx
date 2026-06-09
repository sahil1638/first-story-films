import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { MasterCrud } from "@/components/masters/master-crud";

export default async function DeliverablesMasterPage() {
  await requireManagerOrAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("deliverables").select("*").order("created_at", { ascending: false });

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
      items={(data ?? []) as Record<string, unknown>[]}
    />
  );
}
