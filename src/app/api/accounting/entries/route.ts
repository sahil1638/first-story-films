import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEntries, createEntry } from "@/lib/services/accounting";

const entryFilterSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  type: z.enum(["income", "expense", "both"]).optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const entryCreateSchema = z.object({
  type: z.enum(["income", "expense"]),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.number().positive(),
  entryDate: z.string().min(1),
  remarks: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = entryCreateSchema.parse(body);
    const result = await createEntry(payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not create entry" }, { status: 400 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
  }
}
