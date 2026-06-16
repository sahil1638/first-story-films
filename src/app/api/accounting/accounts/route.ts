import { NextRequest, NextResponse } from "next/server";
import { getAccounts, createAccount } from "@/lib/data/accounting";
import { accountCreateSchema, pagedAccountFilterSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";

export async function GET(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = pagedAccountFilterSchema.parse(params);
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
    return handleApiError(error, { context: "accounting.accounts.list" });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireManagerOrAdminOrThrow();
    const body = await request.json();
    const payload = accountCreateSchema.parse(body);
    const result = await createAccount(payload);
    if (!result.success) {
      return handleApiError(new Error(result.error ?? "Could not create account"), { context: "accounting.accounts.create" });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    return handleApiError(error, { context: "accounting.accounts.create" });
  }
}
