import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { reconcileAllUserRoles } from "@/lib/data/service-role/users";

export async function GET() {
  try {
    // 1. Check Bearer Token (for service role / cron scheduler checks)
    const authHeader = (await headers()).get("authorization") || "";
    const token = authHeader.replace(/^bearer\s+/i, "").trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let isAuthorized = false;

    if (serviceRoleKey && token === serviceRoleKey) {
      isAuthorized = true;
    } else {
      // 2. Check Admin Session
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role === "admin") {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const count = await reconcileAllUserRoles();

    return NextResponse.json({
      success: true,
      message: `Reconciliation completed. Reconciled ${count} drifting user roles.`,
      reconciled_count: count,
    });
  } catch (error) {
    console.error("Maintenance Reconciliation Route Failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
