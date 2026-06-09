import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccounts, createAccount } from "@/lib/services/accounting";

const accountFilterSchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const accountCreateSchema = z.object({
  name: z.string().min(1),
  openingBalance: z.number().min(0),
  status: z.enum(["active", "inactive"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = accountFilterSchema.parse(params);
    const result = await getAccounts({
      page: filters.page ? Number(filters.page) : 1,
      limit: filters.limit ? Number(filters.limit) : 20,
      status: filters.status,
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
    const payload = accountCreateSchema.parse(body);
    const result = await createAccount(payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? "Could not create account" }, { status: 400 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
  }
}
