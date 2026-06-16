import { NextRequest, NextResponse } from "next/server";
import { getAccountById, updateAccount, deleteAccount } from "@/lib/data/accounting";
import { accountUpdateRouteSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const account = await getAccountById(id);
    if (!account) return handleApiError(new Error("Account not found"), { context: "accounting.accounts.get" });
    return NextResponse.json(account);
  } catch (error) {
    return handleApiError(error, { context: "accounting.accounts.get" });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const body = await request.json();
    const payload = accountUpdateRouteSchema.parse(body);
    const result = await updateAccount(id, payload);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not update account"), { context: "accounting.accounts.update" });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: "accounting.accounts.update" });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const result = await deleteAccount(id);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not delete account"), { context: "accounting.accounts.delete" });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: "accounting.accounts.delete" });
  }
}
