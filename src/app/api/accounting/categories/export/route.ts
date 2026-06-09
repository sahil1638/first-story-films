import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildCategoriesCsv } from "@/lib/services/accounting";

const exportCategoriesSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["income", "expense", "all"]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = exportCategoriesSchema.parse(params);
    const csv = await buildCategoriesCsv({
      search: filters.search,
      type: filters.type,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=accounting-categories.csv",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export categories" }, { status: 400 });
  }
}
