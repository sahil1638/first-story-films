import { redirect } from "next/navigation";
import { isPreviewMode } from "@/lib/preview";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (isPreviewMode()) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");
  redirect("/login");
}
