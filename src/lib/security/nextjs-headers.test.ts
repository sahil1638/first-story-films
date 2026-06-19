/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from "vitest";
import nextConfig from "../../../next.config";

describe("Next.js Security Headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should define headers function returning all required security headers", async () => {
    expect(nextConfig.headers).toBeDefined();
    const headersList = await nextConfig.headers!();
    expect(headersList.length).toBeGreaterThan(0);

    const firstHeaderConfig = headersList[0];
    expect(firstHeaderConfig.source).toBe("/:path*");

    const headers = firstHeaderConfig.headers;
    const keys = headers.map((h) => h.key);

    expect(keys).toContain("Content-Security-Policy");
    expect(keys).toContain("Strict-Transport-Security");
    expect(keys).toContain("X-Frame-Options");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("Referrer-Policy");
    expect(keys).toContain("Permissions-Policy");
  });

  it("should conditionalize upgrade-insecure-requests and parse Supabase origin safely", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    const devConfig = (await import("../../../next.config")).default;
    const devHeaders = await devConfig.headers!();
    const devCsp = devHeaders[0].headers.find((h: any) => h.key === "Content-Security-Policy")?.value || "";
    expect(devCsp).not.toContain("upgrade-insecure-requests");
    expect(devCsp).toContain("img-src 'self' data: blob: https://example.supabase.co");
    expect(devCsp).toContain("media-src 'self' data: blob: https://example.supabase.co");
    expect(devCsp).toContain("connect-src 'self' https://example.supabase.co wss://example.supabase.co");
    expect(devCsp).toContain("frame-src 'none'");
    expect(devCsp).toContain("worker-src 'self' blob:");
    expect(devCsp).toContain("manifest-src 'self'");

    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "invalid-url");
    const prodConfig = (await import("../../../next.config")).default;
    const prodHeaders = await prodConfig.headers!();
    const prodCsp = prodHeaders[0].headers.find((h: any) => h.key === "Content-Security-Policy")?.value || "";
    expect(prodCsp).toContain("upgrade-insecure-requests");
    expect(prodCsp).not.toContain("invalid-url");
  });

  it("should support local Supabase websocket origins without allowing arbitrary hosts", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");

    const localConfig = (await import("../../../next.config")).default;
    const localHeaders = await localConfig.headers!();
    const localCsp = localHeaders[0].headers.find((h: any) => h.key === "Content-Security-Policy")?.value || "";

    expect(localCsp).toContain("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321");
    expect(localCsp).not.toContain("*");
  });
});
