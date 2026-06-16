import { getProfiles } from "@/lib/data/users";
import { getCurrentAuthUserId } from "@/lib/data/auth";
import { UserManagement } from "@/components/users/user-management";

export default async function UsersPage() {
  const [users, currentUserId] = await Promise.all([
    getProfiles(),
    getCurrentAuthUserId(),
  ]);

  return (
    <div>
      <UserManagement users={users} currentUserId={currentUserId} />
    </div>
  );
}
