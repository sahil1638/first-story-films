import { redirect } from "next/navigation";
import { getCurrentAuthUserId } from "@/lib/data/auth";

export default async function HomePage() {
  const userId = await getCurrentAuthUserId();

  if (userId) redirect("/dashboard");
  redirect("/login");
}
