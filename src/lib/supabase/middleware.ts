import { canAccess } from "@/lib/auth/roles";
import type { UserRole } from "@/types/database";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isAuthRoute(path: string) {
  return path.startsWith("/login") || path.startsWith("/auth/callback");
}

function isAuthApiRoute(path: string) {
  return path.startsWith("/api/auth");
}

function isMaintenanceBearerRoute(path: string) {
  return path === "/api/maintenance/reconcile";
}

function isApiRoute(path: string) {
  return path.startsWith("/api/");
}

function isPublicRoute(path: string) {
  return (
    path.startsWith("/inquiry") ||
    path === "/" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    isAuthRoute(path) ||
    isAuthApiRoute(path) ||
    isMaintenanceBearerRoute(path)
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && !isPublicRoute(path)) {
    if (isApiRoute(path)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = (profile?.role ?? null) as UserRole | null;
    if (!role || !canAccess(role, path)) {
      if (isApiRoute(path)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
