import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

vi.mock("server-only", () => ({}));

import { logOperationalEvent } from "./operational-logger";

describe("Operational Logger Telemetry and Alerting (Issue S3)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalEnv: any;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.OPERATIONAL_ALERT_WEBHOOK_URL = "https://example.com/webhook";
    process.env.OPERATIONAL_ALERT_MIN_SEVERITY = "error";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should log to console using severity fallback", () => {
    logOperationalEvent({
      event: "test_event",
      severity: "info",
      message: "info message",
    });
    expect(console.info).toHaveBeenCalled();
  });

  it("should send telemetry alert when severity is error", async () => {
    await logOperationalEvent({
      event: "test_error",
      severity: "error",
      message: "critical database failure",
    });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("should send telemetry alert when warning has alert: true", async () => {
    await logOperationalEvent({
      event: "test_warn",
      severity: "warn",
      message: "warning message",
      alert: true,
    });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("should send alert for security-sensitive warning events or messages", async () => {
    await logOperationalEvent({
      event: "privilege_escalation_attempt",
      severity: "warn",
      message: "User tried to change roles",
    });
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("should swallow telemetry fetch failure safely without crashing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network Failure")));

    await expect((async () => {
      await logOperationalEvent({
        event: "test_error_fail",
        severity: "error",
        message: "crash test",
      });
    })()).resolves.not.toThrow();

    expect(console.error).toHaveBeenCalled();
  });

  it("should redact secrets and sensitive PII from context before alerting", async () => {
    await logOperationalEvent({
      event: "user_created",
      severity: "error",
      message: "PII verification",
      context: {
        password: "supersecretpassword123",
        token: "jwt_token_val",
        email: "test@example.com",
        phone: "123-456-7890",
        card: "1234-5678-9012-3456",
        couple_name: "John & Jane Doe",
        normal_field: "safe_data_value",
      },
    });

    expect(globalThis.fetch).toHaveBeenCalled();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (globalThis.fetch as any).mock.calls[0];
    const sentPayload = JSON.parse(callArgs[1].body);

    expect(sentPayload.context.password).toBe("[redacted]");
    expect(sentPayload.context.token).toBe("[redacted]");
    expect(sentPayload.context.email).toBe("[redacted]");
    expect(sentPayload.context.phone).toBe("[redacted]");
    expect(sentPayload.context.card).toBe("[redacted]");
    expect(sentPayload.context.couple_name).toBe("[redacted]");
    expect(sentPayload.context.normal_field).toBe("safe_data_value");
  });

  it("should recursively redact nested objects, arrays, and Error objects in console and webhook", async () => {
    const errorInstance = new Error("db query failed");
    const circularObj: Record<string, unknown> = { name: "loop" };
    circularObj.self = circularObj;

    const contextObj = {
      user: {
        couple_name: "Secret Name",
        normal: "Visible Name",
        address: "123 Secret St",
      },
      tags: ["admin", "secret-token"],
      nestedErrors: [errorInstance],
      circular: circularObj,
      deep: {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    tooDeep: "value",
                  },
                },
              },
            },
          },
        },
      },
    };

    await logOperationalEvent({
      event: "test_deep_sanitization",
      severity: "error",
      message: "critical event",
      context: contextObj,
    });

    expect(globalThis.fetch).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callArgs = (globalThis.fetch as any).mock.calls[0];
    const sentPayload = JSON.parse(callArgs[1].body);

    expect(sentPayload.context.user.couple_name).toBe("[redacted]");
    expect(sentPayload.context.user.address).toBe("[redacted]");
    expect(sentPayload.context.user.normal).toBe("Visible Name");
    expect(sentPayload.context.nestedErrors[0]).toBe("db query failed");
    expect(sentPayload.context.circular.self).toBe("[circular]");
    expect(sentPayload.context.deep.level1.level2.level3.level4.level5).toBe("[max depth reached]");

    expect(console.error).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const consoleLine = (console.error as any).mock.calls[0][0];
    const consolePayload = JSON.parse(consoleLine);
    expect(consolePayload.context.user.couple_name).toBe("[redacted]");
    expect(consolePayload.context.user.address).toBe("[redacted]");
    expect(consolePayload.context.user.normal).toBe("Visible Name");
    expect(consolePayload.context.nestedErrors[0]).toBe("db query failed");
    expect(consolePayload.context.circular.self).toBe("[circular]");
    expect(consolePayload.context.deep.level1.level2.level3.level4.level5).toBe("[max depth reached]");
  });

  it("should await webhook delivery for critical alerts when returned promise is awaited", async () => {
    let resolved = false;
    const fetchPromise = new Promise<{ ok: boolean }>((resolve) => {
      setTimeout(() => {
        resolve({ ok: true });
        resolved = true;
      }, 50);
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

    const logPromise = logOperationalEvent({
      event: "critical_await_test",
      severity: "error",
      message: "should block until webhook done",
    });

    expect(resolved).toBe(false);
    await logPromise;
    expect(resolved).toBe(true);
  });

  it("should retry webhook delivery with exponential backoff on failure", async () => {
    vi.useFakeTimers();
    let attemptCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 3) {
        return Promise.reject(new Error("Network connection lost"));
      }
      return Promise.resolve({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const logPromise = logOperationalEvent({
      event: "retry_backoff_test",
      severity: "error",
      message: "testing retry",
    });

    // Run first attempt (immediate)
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Wait for first backoff (200ms)
    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Wait for second backoff (400ms)
    await vi.advanceTimersByTimeAsync(400);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await logPromise;
    vi.useRealTimers();
  });

  it("should swallow webhook failures after all retries are exhausted", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("Persistent connection timeout"));
    vi.stubGlobal("fetch", fetchMock);

    const logPromise = logOperationalEvent({
      event: "all_retries_fail_test",
      severity: "error",
      message: "should swallow persistent failure",
    });

    // Run first attempt
    await vi.advanceTimersByTimeAsync(0);
    // Run second attempt (delay 200ms)
    await vi.advanceTimersByTimeAsync(200);
    // Run third attempt (delay 400ms)
    await vi.advanceTimersByTimeAsync(400);

    // The promise should resolve without throwing
    await expect(logPromise).resolves.not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("should persist alert payloads to a durable file sink before webhook delivery", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ops-alerts-"));
    const logPath = path.join(tempDir, "alerts.jsonl");
    process.env.OPERATIONAL_ALERT_DURABLE_SINK = "file";
    process.env.OPERATIONAL_ALERT_FILE_PATH = logPath;

    try {
      await logOperationalEvent({
        event: "durable_file_alert",
        severity: "error",
        message: "persist me",
        context: { token: "secret", normal: "ok" },
      });

      const fileContent = await readFile(logPath, "utf8");
      const persisted = JSON.parse(fileContent.trim());
      expect(persisted.event).toBe("durable_file_alert");
      expect(persisted.context.token).toBe("[redacted]");
      expect(persisted.context.normal).toBe("ok");
      expect(globalThis.fetch).toHaveBeenCalled();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
