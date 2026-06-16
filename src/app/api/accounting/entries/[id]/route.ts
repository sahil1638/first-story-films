import { NextRequest, NextResponse } from "next/server";
import { getEntryById, updateEntry, deleteEntry } from "@/lib/data/accounting";
import { entryUpdateRouteSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const entry = await getEntryById(id);
    if (!entry) return handleApiError(new Error("Entry not found"), { context: "accounting.entries.get" });
    return NextResponse.json(entry);
  } catch (error) {
    return handleApiError(error, { context: "accounting.entries.get" });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const body = await request.json();
    const payload = entryUpdateRouteSchema.parse(body);
    const result = await updateEntry(id, payload);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not update entry"), { context: "accounting.entries.update" });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: "accounting.entries.update" });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const result = await deleteEntry(id);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not delete entry"), { context: "accounting.entries.delete" });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: "accounting.entries.delete" });
  }
}
