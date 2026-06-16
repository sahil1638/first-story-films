import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function downloadCachedPdfObject(bucket: string, objectPath: string) {
  const supabase = createAdminClient();
  return supabase.storage.from(bucket).download(objectPath);
}

export async function uploadCachedPdfObject(bucket: string, objectPath: string, buffer: Buffer, ttlSeconds: number) {
  const supabase = createAdminClient();
  return supabase.storage.from(bucket).upload(objectPath, buffer, {
    contentType: "application/pdf",
    cacheControl: String(ttlSeconds),
    upsert: true,
  });
}

export async function tryAcquirePdfRenderSlot(data: {
  maxSlots: number;
  leaseSeconds: number;
  owner: string;
}) {
  const supabase = createAdminClient();
  return supabase.rpc("try_acquire_pdf_render_slot", {
    p_max_slots: data.maxSlots,
    p_lease_seconds: data.leaseSeconds,
    p_owner: data.owner,
  });
}

export async function releasePdfRenderSlot(data: {
  slotId: number;
  owner: string;
}) {
  const supabase = createAdminClient();
  return supabase.rpc("release_pdf_render_slot", {
    p_slot_id: data.slotId,
    p_owner: data.owner,
  });
}
