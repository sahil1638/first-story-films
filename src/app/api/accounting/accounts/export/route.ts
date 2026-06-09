import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildAccountsCsv } from "@/lib/services/accounting";

const exportAccountsSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = exportAccountsSchema.parse(params);
    const csv = await buildAccountsCsv({
      search: filters.search,
      status: filters.status,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=accounting-accounts.csv",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export accounts" }, { status: 400 });
  }
}
