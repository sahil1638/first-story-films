import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { buildAccountsCsv } from "@/lib/data/accounting";
import { exportAccountsSchema } from "@/lib/security/schemas";
import { handleApiError } from "@/lib/security/api-errors";
import { requireManagerOrAdminOrThrow } from "@/lib/auth/require-role";
import { checkDbRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const profile = await requireManagerOrAdminOrThrow();

    // Rate limiting: max 5 requests, refilling 1 token every 10 seconds (0.1/sec)
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userKey = profile ? `user:${profile.id}` : `ip:${ip}`;
    const allowed = await checkDbRateLimit(rateLimitKey("export", userKey), {
      maxTokens: 5,
      refillRatePerSec: 0.1,
      cost: 1.0,
      context: "accounting.accounts.export",
    });
    if (!allowed) {
      return new Response("Too many export requests. Please try again later.", { status: 429 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = exportAccountsSchema.parse(params);
    const csv = await buildAccountsCsv({
      search: filters.search,
      status: filters.status,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });

    const lines = csv.split("\n");
    const count = lines.length > 1 ? lines.length - 1 : 0;
    const filterContext = Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    const csvWithMetadata = `${csv}\n\n# Export Metadata\n# Total Rows: ${count}\n# Capped Limit: 1000\n# Filters: ${filterContext || "None"}\n# Note: This export is capped at 1000 rows. For larger datasets, a background/streaming export path is planned.\n`;

    return new Response(csvWithMetadata, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=accounting-accounts.csv",
        "X-Export-Row-Count": String(count),
        "X-Export-Limit": "1000",
        "X-Export-Warning": "Export is capped at 1000 rows. Refine filters if needed.",
        "X-Export-Filters": filterContext || "none",
      },
    });
  } catch (error) {
    return handleApiError(error, { context: "accounting.accounts.export" });
  }
}
