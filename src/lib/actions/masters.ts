"use server";

import { revalidatePath } from "next/cache";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import {
  upsertMasterSchema,
  deleteMasterSchema,
  updateSettingsSchema,
  type MasterDataForTable,
  type MasterTableName,
} from "@/lib/security/schemas";
import { withSafeError } from "@/lib/security/errors";
import {
  upsertMaster as dalUpsertMaster,
  deleteMaster as dalDeleteMaster,
  updateSettings as dalUpdateSettings,
} from "@/lib/data/masters";

export async function upsertMaster(
  table: MasterTableName,
  data: MasterDataForTable<typeof table>,
  id?: string
) {
  return withSafeError(async () => {
    const parsed = upsertMasterSchema.parse({ table, data, id });
    await requireManagerOrAdminOrThrow();

    await dalUpsertMaster(parsed);

    revalidatePath(`/masters/${parsed.table === "crew_members" ? "crew" : parsed.table}`);
  });
}

export async function deleteMaster(table: MasterTableName, id: string) {
  return withSafeError(async () => {
    const parsed = deleteMasterSchema.parse({ table, id });
    await requireManagerOrAdminOrThrow();

    await dalDeleteMaster(parsed.table, parsed.id);

    revalidatePath(`/masters/${parsed.table === "crew_members" ? "crew" : parsed.table}`);
  });
}

export async function updateSettings(key: string, value: string) {
  return withSafeError(async () => {
    const parsed = updateSettingsSchema.parse({ key, value });
    await requireManagerOrAdminOrThrow();

    await dalUpdateSettings(parsed.key, parsed.value);

    revalidatePath("/settings");
  });
}
