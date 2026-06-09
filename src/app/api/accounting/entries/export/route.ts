import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildEntriesCsv } from "@/lib/services/accounting";

const exportFilterSchema = z.object({
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
    const filters = exportFilterSchema.parse(params);
    const csv = await buildEntriesCsv({
      type: filters.type,
      accountId: filters.accountId,
      categoryId: filters.categoryId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      search: filters.search,
      page: 1,
      limit: 1000,
      sortBy: "entry_date",
      sortOrder: "desc",
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=accounting-entries.csv",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export" }, { status: 400 });
  }
}
