import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCategoryById, updateCategory, deleteCategory } from "@/lib/services/accounting";

const categoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["income", "expense"]).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const category = await getCategoryById(id);
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to fetch category" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const payload = categoryUpdateSchema.parse(body);
    const result = await updateCategory(id, payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not update category" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await deleteCategory(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not delete category" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete category" }, { status: 400 });
  }
}
