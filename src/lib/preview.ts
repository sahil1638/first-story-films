/** Set NEXT_PUBLIC_PREVIEW_MODE=true to run the UI without Supabase */
export function isPreviewMode() {
  return process.env.NEXT_PUBLIC_PREVIEW_MODE === "true";
}

export const PREVIEW_PROFILE = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "preview@firststoryfilms.local",
  full_name: "Preview Admin",
  role: "admin" as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
