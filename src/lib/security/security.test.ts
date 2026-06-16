import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { z } from "zod";
import {
  EXPORT_ROW_LIMIT,
  MAX_PAGE_SIZE,
  normalizePagination,
} from "@/lib/data/accounting";
import {
  uuidSchema,
  dateStringSchema,
  createUserSchema,
  positiveNumberSchema,
  updateEntrySchema,
  userRoleSchema,
  upsertMasterSchema,
  deleteMasterSchema,
  updateSettingsSchema,
} from "./schemas";
import { withSafeError } from "./errors";
import { rateLimitKey, checkRateLimit } from "./rate-limit";

describe("Zod Security Schemas", () => {
  describe("Masters payload strict validation", () => {
    it("should reject service master upsert with unknown fields", () => {
      const payload = {
        table: "services",
        data: {
          name: "Wedding Video",
          status: "active",
          unknown_field: "malicious",
        },
      };
      const result = upsertMasterSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject delete master with unknown fields", () => {
      const payload = {
        table: "services",
        id: "123e4567-e89b-12d3-a456-426614174000",
        unknown_field: "malicious",
      };
      const result = deleteMasterSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("should reject update settings with unknown fields", () => {
      const payload = {
        key: "terms_and_conditions",
        value: "Some terms",
        unknown_field: "malicious",
      };
      const result = updateSettingsSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
  describe("UUID Schema", () => {
    it("should accept valid UUIDs", () => {
      const validUuid = "123e4567-e89b-12d3-a456-426614174000";
      expect(uuidSchema.safeParse(validUuid).success).toBe(true);
    });

    it("should reject invalid UUID formats", () => {
      const invalidUuid = "not-a-uuid-12345";
      expect(uuidSchema.safeParse(invalidUuid).success).toBe(false);
    });
  });

  describe("Date String Schema", () => {
    it("should accept valid YYYY-MM-DD date strings", () => {
      expect(dateStringSchema.safeParse("2026-06-11").success).toBe(true);
    });

    it("should reject invalid formats", () => {
      expect(dateStringSchema.safeParse("11-06-2026").success).toBe(false);
      expect(dateStringSchema.safeParse("2026/06/11").success).toBe(false);
      expect(dateStringSchema.safeParse("2026-06-32").success).toBe(false); // Invalid calendar day
    });
  });

  describe("Create User Schema", () => {
    it("should validate a correct user object", () => {
      const validUser = {
        name: "John Doe",
        email: "john@example.com",
        password: "secretpassword",
        role: "manager",
      };
      expect(createUserSchema.safeParse(validUser).success).toBe(true);
    });

    it("should reject invalid email or short password", () => {
      const invalidUser = {
        name: "John Doe",
        email: "invalid-email",
        password: "123", // too short
        role: "manager",
      };
      const result = createUserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });

  describe("User Role Schema", () => {
    it("should accept admin, manager, and sales", () => {
      expect(userRoleSchema.safeParse("admin").success).toBe(true);
      expect(userRoleSchema.safeParse("manager").success).toBe(true);
      expect(userRoleSchema.safeParse("sales").success).toBe(true);
    });

    it("should reject crew and finance", () => {
      expect(userRoleSchema.safeParse("crew").success).toBe(false);
      expect(userRoleSchema.safeParse("finance").success).toBe(false);
      expect(userRoleSchema.safeParse("other").success).toBe(false);
    });
  });


  describe("Positive Number Schema", () => {
    it("should accept positive numbers", () => {
      expect(positiveNumberSchema.safeParse(10.5).success).toBe(true);
    });

    it("should reject zero or negative numbers", () => {
      expect(positiveNumberSchema.safeParse(0).success).toBe(false);
      expect(positiveNumberSchema.safeParse(-5).success).toBe(false);
    });
  });

  describe("Update Entry Schema", () => {
    it("should accept partial valid updates", () => {
      const updates = {
        amount: 250.5,
        entry_date: "2026-06-11",
        remarks: "Updated remark",
      };
      expect(updateEntrySchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        updates
      }).success).toBe(true);
    });

    it("should reject negative amounts or invalid dates", () => {
      expect(updateEntrySchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        updates: { amount: -10 }
      }).success).toBe(false);

      expect(updateEntrySchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
        updates: { entry_date: "invalid-date" }
      }).success).toBe(false);
    });
  });
});

describe("Error Boundaries (withSafeError)", () => {
  it("should propagate ZodErrors formatted nicely", async () => {
    const fn = async () => {
      z.string().parse(123);
    };
    await expect(withSafeError(fn)).rejects.toThrow("Validation Error");
  });

  it("should propagate intentional business/auth errors", async () => {
    const fn = async () => {
      throw new Error("Unauthorized: Manager or admin access required");
    };
    await expect(withSafeError(fn)).rejects.toThrow("Unauthorized: Manager or admin access required");
  });

  it("should obscure raw internal database errors", async () => {
    const fn = async () => {
      throw new Error("violates foreign key constraint 'leads_created_by_fkey'");
    };
    await expect(withSafeError(fn)).rejects.toThrow("An unexpected error occurred. Please try again later.");
  });
});

describe("Rate Limiting Utilities", () => {
  it("should format rate limit keys correctly", () => {
    expect(rateLimitKey("login", "  TEST@example.com  ")).toBe("login:test@example.com");
  });

  it("should rate limit requests correctly in memory", () => {
    const key = "test-rate-limit";
    // First 2 requests allowed
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 }).allowed).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 }).allowed).toBe(true);
    // Third request blocked
    expect(checkRateLimit(key, { limit: 2, windowMs: 1000 }).allowed).toBe(false);
  });
});

describe("Accounting pagination limits", () => {
  it("caps oversized page limits", () => {
    expect(normalizePagination(2, MAX_PAGE_SIZE + 500)).toEqual({
      page: 2,
      limit: MAX_PAGE_SIZE,
      from: MAX_PAGE_SIZE,
      to: MAX_PAGE_SIZE * 2 - 1,
    });
  });

  it("keeps export limit above the public pagination cap", () => {
    expect(EXPORT_ROW_LIMIT).toBeGreaterThan(MAX_PAGE_SIZE);
  });
});
