import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { syncProfileRoleFromMetadata } from "@/lib/auth/sync-profile";
import { isPreviewMode, PREVIEW_PROFILE } from "@/lib/preview";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component – ignore
          }
        },
      },
    }
  );
}

export async function getProfile() {
  if (isPreviewMode()) return PREVIEW_PROFILE;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await syncProfileRoleFromMetadata(supabase, user.id, user.user_metadata);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}
