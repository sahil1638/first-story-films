import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));

const { rpcMock, createAdminClientMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  createAdminClientMock: vi.fn(() => ({
    rpc: rpcMock,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { checkDbRateLimit } = await import("./rate-limit");

describe("checkDbRateLimit", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rpcMock.mockReset();
    createAdminClientMock.mockReset();
    createAdminClientMock.mockReturnValue({ rpc: rpcMock });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("permits when RPC returns true", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });

    await expect(checkDbRateLimit("login:secret", {
      maxTokens: 5,
      refillRatePerSec: 1,
      context: "auth.login",
    })).resolves.toBe(true);
  });

  it("blocks when RPC returns false", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });

    await expect(checkDbRateLimit("login:secret", {
      maxTokens: 5,
      refillRatePerSec: 1,
      context: "auth.login",
    })).resolves.toBe(false);
  });

  it("blocks and logs safely when RPC returns an error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc unavailable" } });

    await expect(checkDbRateLimit("login:ip:email@example.com", {
      maxTokens: 5,
      refillRatePerSec: 1,
      context: "auth.login",
    })).resolves.toBe(false);

    expect(consoleErrorSpy).toHaveBeenCalledWith("DB rate limit check failed", {
      keyPrefix: "login",
      context: "auth.login",
      message: "rpc unavailable",
    });
  });

  it("blocks and logs safely when RPC throws", async () => {
    rpcMock.mockRejectedValue(new Error("network blocked"));

    await expect(checkDbRateLimit("login:ip:email@example.com", {
      maxTokens: 5,
      refillRatePerSec: 1,
      context: "auth.login",
    })).resolves.toBe(false);

    expect(consoleErrorSpy).toHaveBeenCalledWith("DB rate limit execution failed", {
      keyPrefix: "login",
      context: "auth.login",
      message: "network blocked",
    });
  });

  it("blocks and logs safely when the service-role client is misconfigured", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("missing service role key");
    });

    await expect(checkDbRateLimit("login:ip:email@example.com", {
      maxTokens: 5,
      refillRatePerSec: 1,
      context: "auth.login",
    })).resolves.toBe(false);

    expect(consoleErrorSpy).toHaveBeenCalledWith("DB rate limit execution failed", {
      keyPrefix: "login",
      context: "auth.login",
      message: "missing service role key",
    });
  });

  it("bypasses PDF rate limits only in development", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      writable: true,
      configurable: true,
      enumerable: true,
    });

    await expect(checkDbRateLimit("pdf:user:123", {
      maxTokens: 5,
      refillRatePerSec: 1,
      context: "pdf.dev",
    })).resolves.toBe(true);

    expect(createAdminClientMock).not.toHaveBeenCalled();

    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      writable: true,
      configurable: true,
      enumerable: true,
    });
    rpcMock.mockResolvedValueOnce({ data: true, error: null });

    await expect(checkDbRateLimit("pdf:user:123", {
      maxTokens: 5,
      refillRatePerSec: 1,
      context: "pdf.production",
    })).resolves.toBe(true);

    expect(createAdminClientMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  });
});
