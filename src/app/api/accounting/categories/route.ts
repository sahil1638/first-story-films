import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCategories, createCategory } from "@/lib/services/accounting";

const categoryFilterSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const categoryCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["income", "expense"]),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = categoryFilterSchema.parse(params);
    const result = await getCategories({
      page: filters.page ? Number(filters.page) : 1,
      limit: filters.limit ? Number(filters.limit) : 20,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = categoryCreateSchema.parse(body);
    const result = await createCategory(payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not create category" }, { status: 400 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
  }
}
