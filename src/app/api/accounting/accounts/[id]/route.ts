import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountById, updateAccount, deleteAccount } from "@/lib/services/accounting";

const accountUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  openingBalance: z.number().min(0).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const account = await getAccountById(id);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json(account);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to fetch account" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const payload = accountUpdateSchema.parse(body);
    const result = await updateAccount(id, payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not update account" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await deleteAccount(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not delete account" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete account" }, { status: 400 });
  }
}
