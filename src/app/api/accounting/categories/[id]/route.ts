import { NextRequest, NextResponse } from "next/server";
import { getCategoryById, updateCategory, deleteCategory } from "@/lib/data/accounting";
import { categoryUpdateRouteSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const category = await getCategoryById(id);
    if (!category) return handleApiError(new Error("Category not found"), { context: "accounting.categories.get" });
    return NextResponse.json(category);
  } catch (error) {
    return handleApiError(error, { context: "accounting.categories.get" });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const body = await request.json();
    const payload = categoryUpdateRouteSchema.parse(body);
    const result = await updateCategory(id, payload);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not update category"), { context: "accounting.categories.update" });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: "accounting.categories.update" });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireManagerOrAdminOrThrow();
    const { id } = await params;
    const result = await deleteCategory(id);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not delete category"), { context: "accounting.categories.delete" });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { context: "accounting.categories.delete" });
  }
}
