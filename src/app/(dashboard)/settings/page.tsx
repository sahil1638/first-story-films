import { requireManagerOrAdmin } from "@/lib/auth/ui-guards";
import { SettingsForm } from "@/components/settings/settings-form";
import { getSettings } from "@/lib/data/masters";

export default async function SettingsPage() {
  await requireManagerOrAdmin();
  const data = await getSettings();
  const map = Object.fromEntries(data.map((s) => [s.key, s.value]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3 mb-4">
        <h1 className="text-2xl font-bold text-stone-900 leading-none">Settings</h1>
      </div>
      <SettingsForm settings={map} />
    </div>
  );
}
