import { createClient } from "@/lib/supabase/server";
import { requireManagerOrAdmin } from "@/lib/auth/require-role";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  await requireManagerOrAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("*");
  const map = Object.fromEntries((data ?? []).map((s) => [s.key, s.value]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Settings</h1>
      </div>
      <SettingsForm settings={map} />
    </div>
  );
}
