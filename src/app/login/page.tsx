"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import { Film } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const timer = setTimeout(() => setError(errorParam), 0);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
      }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Login failed");
      setLoading(false);
      return;
    }
    const redirect = searchParams.get("redirect") || "/dashboard";
    router.push(redirect);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950 p-4">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Film className="mb-2 h-10 w-10 text-amber-600" />
          <h1 className="text-xl font-semibold text-stone-900">{APP_NAME}</h1>
          <p className="text-sm text-stone-500">Admin & Staff login</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
        {process.env.NEXT_PUBLIC_PREVIEW_MODE === "true" ? (
          <p className="mt-4 text-center text-sm">
            <a href="/dashboard" className="font-medium text-amber-600 hover:underline">
              Open dashboard (preview mode, no login)
            </a>
          </p>
        ) : (
          <p className="mt-4 text-center text-xs text-stone-400">
            Wedding Inquiry Registration: {" "}
            <a href="/inquiry" className="text-amber-600 hover:underline">
              Inquiry Form
            </a>
          </p>
        )}
      </Card>
    </div>
  );
}
