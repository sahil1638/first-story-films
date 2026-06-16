import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { AuthorizationError, handleApiError } from "./api-errors";

async function responseBody(response: Response) {
  return {
    status: response.status,
    body: await response.json() as { error: string },
  };
}

describe("handleApiError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("maps Zod validation errors to 400 with a safe message", async () => {
    const result = z.object({ id: z.string().uuid() }).safeParse({ id: "bad" });
    if (result.success) throw new Error("Expected validation to fail");

    const parsed = await responseBody(handleApiError(result.error, { context: "test.validation" }));

    expect(parsed.status).toBe(400);
    expect(parsed.body.error).toBe("Invalid request payload.");
  });

  it("maps unauthorized errors to 401", async () => {
    const parsed = await responseBody(handleApiError(new Error("Unauthorized"), { context: "test.auth" }));

    expect(parsed.status).toBe(401);
    expect(parsed.body.error).toBe("Authentication required.");
  });

  it("maps forbidden errors to 403", async () => {
    const parsed = await responseBody(handleApiError(new AuthorizationError("Admin access required"), { context: "test.forbidden" }));

    expect(parsed.status).toBe(403);
    expect(parsed.body.error).toBe("You do not have permission to perform this action.");
  });

  it("maps not-found errors to 404", async () => {
    const parsed = await responseBody(handleApiError(new Error("Account not found"), { context: "test.not-found" }));

    expect(parsed.status).toBe(404);
    expect(parsed.body.error).toBe("Requested resource was not found.");
  });

  it("maps constraint conflicts to 409 without leaking raw database details", async () => {
    const raw = "violates foreign key constraint \"accounting_entries_account_id_fkey\" on table \"accounting_entries\"";
    const parsed = await responseBody(handleApiError(new Error(raw), { context: "test.conflict" }));

    expect(parsed.status).toBe(409);
    expect(parsed.body.error).toBe("The request conflicts with existing records.");
    expect(parsed.body.error).not.toContain("accounting_entries");
    expect(consoleErrorSpy).toHaveBeenCalledWith("API request failed", expect.objectContaining({
      context: "test.conflict",
      internalMessage: raw,
      safeMessage: "The request conflicts with existing records.",
    }));
  });

  it("maps unknown errors to 500 with a generic message", async () => {
    const parsed = await responseBody(handleApiError(new Error("database connection reset with SQL details"), {
      context: "test.unknown",
    }));

    expect(parsed.status).toBe(500);
    expect(parsed.body.error).toBe("An unexpected error occurred. Please try again later.");
    expect(parsed.body.error).not.toContain("SQL");
  });
});
