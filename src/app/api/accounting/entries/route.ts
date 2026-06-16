import { NextRequest, NextResponse } from "next/server";
import { getEntries, createEntry } from "@/lib/data/accounting";
import { entryCreateRouteSchema, entryFilterSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function GET(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = entryFilterSchema.parse(params);
    const result = await getEntries({
      page: filters.page ? Number(filters.page) : 1,
      limit: filters.limit ? Number(filters.limit) : 20,
      type: filters.type,
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, { context: "accounting.entries.list" });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const body = await request.json();
    const payload = entryCreateRouteSchema.parse(body);
    const result = await createEntry(payload);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not create entry"), { context: "accounting.entries.create" });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return handleApiError(error, { context: "accounting.entries.create" });
  }
}
