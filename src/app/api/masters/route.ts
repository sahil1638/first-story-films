import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import { upsertMaster, deleteMaster } from "@/lib/data/masters";
import { deleteMasterSchema, upsertMasterSchema, type MasterTableName } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";

function masterPath(table: MasterTableName) {
  return `/masters/${table === "crew_members" ? "crew" : table}`;
}

export async function POST(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const body = await request.json();
    const payload = upsertMasterSchema.parse(body);

    const itemId = await upsertMaster(payload);
    revalidatePath(masterPath(payload.table));

    return NextResponse.json({ id: itemId, success: true });
  } catch (error) {
    return handleApiError(error, { context: "masters.upsert" });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const payload = deleteMasterSchema.parse({
      table: request.nextUrl.searchParams.get("table"),
      id: request.nextUrl.searchParams.get("id"),
    });

    await deleteMaster(payload.table, payload.id);
    revalidatePath(masterPath(payload.table));
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: "masters.delete" });
  }
}
