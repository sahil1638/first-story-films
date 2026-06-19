import { describe, expect, it } from "vitest";
import { buildIlikeOrFilter, normalizeLimit, normalizePage, sanitizePostgrestSearch } from "@/lib/data/query";

describe("PostgREST query helpers", () => {
  it("normalizes pagination inputs", () => {
    expect(normalizePage(-3)).toBe(1);
    expect(normalizePage(3)).toBe(3);
    expect(normalizeLimit(undefined)).toBe(20);
    expect(normalizeLimit(500)).toBe(100);
    expect(normalizeLimit(0)).toBe(1);
  });

  it("removes PostgREST .or syntax characters from search input", () => {
    expect(sanitizePostgrestSearch("  Alice,or(email.ilike.*)  ")).toBe("Alice or email ilike");
    expect(sanitizePostgrestSearch("%_")).toBeUndefined();
    expect(sanitizePostgrestSearch("a".repeat(120))).toHaveLength(80);
  });

  it("escapes LIKE metacharacters when building ilike filters", () => {
    expect(buildIlikeOrFilter(["name", "email"], "a%b_c")).toBe(
      "name.ilike.%a\\%b\\_c%,email.ilike.%a\\%b\\_c%"
    );
  });
});
