import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { isPreviewMode } from "@/lib/preview";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <DashboardShell
      role={profile.role}
      userName={profile.full_name || profile.email}
      preview={isPreviewMode()}
    >
      <div className="p-3 md:p-4 text-stone-900">{children}</div>
    </DashboardShell>
  );
}
