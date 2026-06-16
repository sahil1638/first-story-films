import { NextRequest, NextResponse } from "next/server";
import { getCategories, createCategory } from "@/lib/data/accounting";
import { categoryCreateRouteSchema, pagedCategoryFilterSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function GET(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = pagedCategoryFilterSchema.parse(params);
    const result = await getCategories({
      page: filters.page ? Number(filters.page) : 1,
      limit: filters.limit ? Number(filters.limit) : 20,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { context: "accounting.categories.list" });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const body = await request.json();
    const payload = categoryCreateRouteSchema.parse(body);
    const result = await createCategory(payload);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not create category"), { context: "accounting.categories.create" });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return handleApiError(error, { context: "accounting.categories.create" });
  }
}
