import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config";

describe("Next.js Security Headers (Issue A2)", () => {
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
});
