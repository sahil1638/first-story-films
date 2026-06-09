import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEntriesSummary } from "@/lib/services/accounting";

const summaryFilterSchema = z.object({
  type: z.enum(["income", "expense", "both"]).optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = summaryFilterSchema.parse(params);
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}
