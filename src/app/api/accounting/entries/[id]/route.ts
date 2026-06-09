import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEntryById, updateEntry, deleteEntry } from "@/lib/services/accounting";

const entryUpdateSchema = z.object({
  type: z.enum(["income", "expense"]).optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  entryDate: z.string().min(1).optional(),
  remarks: z.string().nullable().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await getEntryById(id);
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    return NextResponse.json(entry);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to fetch entry" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const payload = entryUpdateSchema.parse(body);
    const result = await updateEntry(id, payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not update entry" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await deleteEntry(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not delete entry" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete entry" }, { status: 400 });
  }
}
