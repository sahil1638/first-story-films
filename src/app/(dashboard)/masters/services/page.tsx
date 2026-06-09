import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { MasterCrud } from "@/components/masters/master-crud";

export default async function ServicesMasterPage() {
  await requireManagerOrAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("*").order("created_at", { ascending: false });

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
      items={(data ?? []) as Record<string, unknown>[]}
    />
  );
}
