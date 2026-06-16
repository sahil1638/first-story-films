import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { persistOperationalEvent } from "@/lib/data/service-role/ops";

export type Severity = "info" | "warn" | "error";

export type OperationalEvent = {
  event: string;
  severity: Severity;
  message: string;
  alert?: boolean;
  context?: Record<string, unknown>;
};

const SEVERITY_LEVELS: Record<Severity, number> = {
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEY_REGEX = /password|token|secret|key|email|phone|mobile|contact|address|card|cvv|ssn|name|fullname|couple_name/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_REGEX.test(key);
}

function sanitizeVal(
  val: unknown,
  depth: number,
  maxDepth: number,
  visited: WeakSet<object>
): unknown {
  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === "function") {
    return "[function]";
  }

  if (typeof val !== "object") {
    return val;
  }

  if (val instanceof Error) {
    return val.message;
  }

  if (depth >= maxDepth) {
    return "[max depth reached]";
  }

  if (visited.has(val)) {
    return "[circular]";
  }

  visited.add(val);

  try {
    if (Array.isArray(val)) {
      return val.map((item) => sanitizeVal(item, depth + 1, maxDepth, visited));
    }

    const entries = Object.entries(val);
    const sanitizedEntries = entries.map(([key, value]) => {
      if (isSensitiveKey(key)) {
        return [key, "[redacted]"];
      }
      return [key, sanitizeVal(value, depth + 1, maxDepth, visited)];
    });

    return Object.fromEntries(sanitizedEntries);
  } finally {
    visited.delete(val);
  }
}

function sanitizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined;
  return sanitizeVal(context, 0, 6, new WeakSet<object>()) as Record<string, unknown>;
}

async function sendWebhookAlert(payload: Record<string, unknown>): Promise<void> {
  const url = process.env.OPERATIONAL_ALERT_WEBHOOK_URL;
  if (!url) return;

  const maxAttempts = Number(process.env.OPERATIONAL_ALERT_MAX_ATTEMPTS ?? 3);
  let attempt = 0;
  let delay = Number(process.env.OPERATIONAL_ALERT_INITIAL_DELAY_MS ?? 200);

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout per attempt

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (response.ok) {
        return;
      }
      console.warn(`Telemetry alert attempt ${attempt} returned status ${response.status}`);
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Telemetry alert attempt ${attempt} failed:`, err);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  throw new Error("All telemetry alert webhook attempts failed.");
}

function getDurableSink() {
  const configured = process.env.OPERATIONAL_ALERT_DURABLE_SINK?.trim().toLowerCase();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "supabase" : "none";
}

async function persistToSupabase(payload: Record<string, unknown>): Promise<void> {
  const { error } = await persistOperationalEvent({
    event: payload.event,
    severity: payload.severity,
    alert: payload.alert,
    message: payload.message,
    context: payload.context,
  });

  if (error) {
    throw new Error(error.message || "Failed to persist operational event");
  }
}

async function persistToFile(payload: Record<string, unknown>): Promise<void> {
  const configuredPath = process.env.OPERATIONAL_ALERT_FILE_PATH;
  if (!configuredPath) {
    throw new Error("OPERATIONAL_ALERT_FILE_PATH is required when OPERATIONAL_ALERT_DURABLE_SINK=file");
  }

  const targetPath = path.resolve(configuredPath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await appendFile(targetPath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function persistDurableAlert(payload: Record<string, unknown>): Promise<void> {
  const sink = getDurableSink();
  if (sink === "none") return;

  try {
    if (sink === "supabase") {
      await persistToSupabase(payload);
      return;
    }

    if (sink === "file") {
      await persistToFile(payload);
      return;
    }

    console.warn(`Unknown OPERATIONAL_ALERT_DURABLE_SINK "${sink}". Skipping durable alert persistence.`);
  } catch (error) {
    console.error("Durable operational alert persistence failed.", {
      sink,
      event: payload.event,
      severity: payload.severity,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function logOperationalEvent({
  event,
  severity,
  message,
  alert = severity === "error",
  context,
}: OperationalEvent): Promise<void> | void {
  const sanitizedContext = sanitizeContext(context);
  const payload = {
    ts: new Date().toISOString(),
    event,
    severity,
    alert,
    message,
    context: sanitizedContext,
  };
  const line = JSON.stringify(payload);

  // Keep console logging as fallback/standard
  if (severity === "error") {
    console.error(line);
  } else if (severity === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }

  // Determine if telemetry alert should be sent
  const minSeverityEnv = (process.env.OPERATIONAL_ALERT_MIN_SEVERITY || "error").toLowerCase() as Severity;
  const targetMinLevel = SEVERITY_LEVELS[minSeverityEnv] || 3;
  const currentLevel = SEVERITY_LEVELS[severity] || 1;

  const meetsMinSeverity = currentLevel >= targetMinLevel;

  const isSecuritySensitive =
    /unauthorized|escalation|privilege|rate_limit|auth|security|lockout|hack|bypass/i.test(event) ||
    /unauthorized|escalation|privilege|rate_limit|auth|security|lockout|hack|bypass/i.test(message);

  const shouldAlert = alert || severity === "error" || meetsMinSeverity || isSecuritySensitive;

  if (shouldAlert) {
    return (async () => {
      await persistDurableAlert(payload);
      try {
        await sendWebhookAlert(payload);
      } catch (error) {
        console.error("Telemetry alert webhook delivery failed.", {
          event,
          severity,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }
}
