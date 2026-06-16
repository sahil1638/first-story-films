import { NextRequest, NextResponse } from "next/server";
import { getEntriesSummary } from "@/lib/data/accounting";
import { entrySummaryFilterSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function GET(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = entrySummaryFilterSchema.parse(params);
    const summary = await getEntriesSummary({
      type: filters.type,
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      search: filters.search,
    });
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, { context: "accounting.entries.summary" });
  }
}
