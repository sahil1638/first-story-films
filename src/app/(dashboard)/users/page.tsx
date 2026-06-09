import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-role";
import { UserManagement } from "@/components/users/user-management";
import type { Profile } from "@/types/database";

export default async function UsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <UserManagement users={(users ?? []) as Profile[]} />
    </div>
  );
}
