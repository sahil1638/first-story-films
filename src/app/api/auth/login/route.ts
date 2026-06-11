import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkDbRateLimit, rateLimitKey } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Please enter your email and password." },
        { status: 400 }
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const allowed = await checkDbRateLimit(
      rateLimitKey("login", `${ip}:${email}`),
      {
        maxTokens: 5.0,
        refillRatePerSec: 5.0 / 900.0,
        cost: 1.0,
      }
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429 }
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.warn("Login failed", { email, message: error.message });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    revalidatePath("/", "layout");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.warn("Login request failed", { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 400 }
    );
  }
}
