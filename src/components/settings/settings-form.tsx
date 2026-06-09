"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateSettings } from "@/lib/actions/masters";
import { FileText, ScrollText } from "lucide-react";

const FIELDS = [
  {
    key: "terms_and_conditions",
    label: "Terms & Conditions",
    meta: "Quotation PDF",
    icon: FileText,
    iconClass: "bg-amber-50 text-amber-600",
  },
  {
    key: "agreement_content",
    label: "Agreement Content",
    meta: "Order PDF",
    icon: ScrollText,
    iconClass: "bg-blue-50 text-blue-600",
  },
];

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const [values, setValues] = useState(settings);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setLoading(true);
    setSaved(false);
    try {
      for (const f of FIELDS) {
        await updateSettings(f.key, values[f.key] ?? "");
      }
      setSaved(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {FIELDS.map((f) => (
          <Card key={f.key} className="!p-3">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${f.iconClass}`}>
                  <f.icon className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-stone-900">{f.label}</h2>
                  <p className="text-xs font-medium text-stone-500">{f.meta}</p>
                </div>
              </div>
            </div>
            <textarea
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="min-h-[460px] w-full resize-y rounded-xl border border-stone-200 bg-stone-50/50 p-4 text-sm leading-7 text-stone-800 shadow-inner outline-none transition-colors placeholder:text-stone-400 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20"
            />
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <p className="text-sm font-medium text-emerald-600">Settings saved.</p>}
        <Button loading={loading} onClick={save} tooltip="Save">
          Save
        </Button>
      </div>
    </div>
  );
}
