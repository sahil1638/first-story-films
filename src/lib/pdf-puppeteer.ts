import puppeteer from "puppeteer";
import type { Browser } from "puppeteer";
import fs from "node:fs";

// Note: PDF_MAX_CONCURRENT_RENDERS controls concurrency within a single Node process.
// It does not coordinate across multiple serverless or container instances.
// For horizontal scaling under high render load, use a distributed queue (e.g. BullMQ, Inngest)
// with dedicated worker processes or external browser rendering pools.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logOperationalEvent } from "@/lib/ops/operational-logger";
import { releasePdfRenderSlot, tryAcquirePdfRenderSlot } from "@/lib/data/service-role/pdf";

export const getPdfRenderTimeoutMs = () => Number(process.env.PDF_RENDER_TIMEOUT_MS ?? 30000);
export const PDF_MAX_CONCURRENT_RENDERS = Number(process.env.PDF_MAX_CONCURRENT_RENDERS ?? 2);
export const PDF_MAX_HTML_BYTES = Number(process.env.PDF_MAX_HTML_BYTES ?? 2_000_000);
export const PDF_MAX_OUTPUT_BYTES = Number(process.env.PDF_MAX_OUTPUT_BYTES ?? 10_000_000);

export const PDF_CHROMIUM_NO_SANDBOX_ENV = "PDF_CHROMIUM_NO_SANDBOX";
export const PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK_ENV = "PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK";

const DEFAULT_PDF_CHROMIUM_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
];

const NO_SANDBOX_PDF_CHROMIUM_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"];
const PDF_CHROMIUM_RUNTIME_REQUIREMENTS = [
  "hardened isolated worker/container",
  "non-root runtime where possible",
  "seccomp/AppArmor/user namespace controls where applicable",
];

let activePdfRenders = 0;
const pdfQueue: Array<() => void> = [];

function getPdfRenderLockMode() {
  return (process.env.PDF_RENDER_LOCK_MODE ?? "local").trim().toLowerCase();
}

function createRenderLockOwner(context: string) {
  return `${context}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function getPdfRenderLeaseSeconds(timeoutMs: number) {
  const configured = Number(process.env.PDF_RENDER_LOCK_LEASE_SECONDS);
  if (Number.isFinite(configured) && configured >= 5) {
    return Math.floor(configured);
  }
  return Math.max(30, Math.ceil(timeoutMs / 1000) + 10);
}

async function withLocalPdfRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activePdfRenders >= PDF_MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => {
      pdfQueue.push(resolve);
    });
  }

  activePdfRenders += 1;
  try {
    return await task();
  } finally {
    activePdfRenders -= 1;
    pdfQueue.shift()?.();
  }
}

async function acquireDatabasePdfRenderSlot(
  context: string,
  timeoutMs: number
): Promise<{ slotId: number; owner: string }> {
  const start = Date.now();
  const owner = createRenderLockOwner(context);
  const leaseSeconds = getPdfRenderLeaseSeconds(timeoutMs);
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await tryAcquirePdfRenderSlot({
      maxSlots: PDF_MAX_CONCURRENT_RENDERS,
      leaseSeconds,
      owner,
    });

    if (error) {
      await logOperationalEvent({
        event: "pdf_render_lock_failed",
        severity: "error",
        message: "Could not acquire database PDF render lock.",
        context: { context, error },
      });
      throw new Error("PDF render lock is unavailable.");
    }

    if (typeof data === "number" && data > 0) {
      return { slotId: data, owner };
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  await logOperationalEvent({
    event: "pdf_render_lock_timeout",
    severity: "warn",
    message: "Timed out waiting for database PDF render lock.",
    alert: true,
    context: { context, timeoutMs, maxConcurrentRenders: PDF_MAX_CONCURRENT_RENDERS },
  });
  throw new Error("Too many PDF renders are running. Please try again later.");
}

async function releaseDatabasePdfRenderSlot(slotId: number, owner: string, context: string) {
  try {
    const { error } = await releasePdfRenderSlot({
      slotId,
      owner,
    });

    if (error) {
      throw new Error(error.message || "Failed to release PDF render lock");
    }
  } catch (error) {
    await logOperationalEvent({
      event: "pdf_render_lock_release_failed",
      severity: "warn",
      message: "Failed to release database PDF render lock.",
      alert: true,
      context: { context, slotId, error },
    });
  }
}

async function withPdfRenderSlot<T>(
  task: () => Promise<T>,
  context: string,
  timeoutMs: number
): Promise<T> {
  if (getPdfRenderLockMode() !== "database") {
    return withLocalPdfRenderSlot(task);
  }

  const lock = await acquireDatabasePdfRenderSlot(context, timeoutMs);
  try {
    return await task();
  } finally {
    await releaseDatabasePdfRenderSlot(lock.slotId, lock.owner, context);
  }
}


const chromiumCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean) as string[];

function getExecutablePath() {
  return chromiumCandidates.find((candidate) => fs.existsSync(candidate));
}

function isTruthyEnv(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function isPdfChromiumNoSandboxEnabled() {
  return isTruthyEnv(process.env[PDF_CHROMIUM_NO_SANDBOX_ENV]);
}

export function isPdfChromiumNoSandboxProductionAcknowledged() {
  return isTruthyEnv(process.env[PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK_ENV]);
}

export function getPdfChromiumLaunchArgs() {
  return isPdfChromiumNoSandboxEnabled()
    ? [...NO_SANDBOX_PDF_CHROMIUM_ARGS, ...DEFAULT_PDF_CHROMIUM_ARGS]
    : [...DEFAULT_PDF_CHROMIUM_ARGS];
}

export async function assertPdfChromiumSandboxPolicy(context: string) {
  const noSandboxEnabled = isPdfChromiumNoSandboxEnabled();
  if (!noSandboxEnabled) {
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const productionAcknowledged = isPdfChromiumNoSandboxProductionAcknowledged();

  if (isProduction && !productionAcknowledged) {
    await logOperationalEvent({
      event: "pdf_chromium_no_sandbox_blocked",
      severity: "warn",
      message: "Blocked Chromium no-sandbox mode in production without explicit acknowledgement.",
      alert: true,
      context: {
        context,
        nodeEnv: process.env.NODE_ENV,
        noSandboxEnabled,
        productionAcknowledged,
      },
    });

    throw new Error(
      "PDF Chromium no-sandbox mode is blocked in production unless PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK=true."
    );
  }

  await logOperationalEvent({
    event: "pdf_chromium_no_sandbox_enabled",
    severity: "warn",
    message: isProduction
      ? "Chromium no-sandbox mode is enabled in production by explicit acknowledgement. Run the renderer in a hardened isolated worker/container with a non-root runtime where possible and seccomp/AppArmor/user namespace controls where applicable."
      : "Chromium no-sandbox mode is enabled by explicit opt-in. Run the renderer in a hardened isolated worker/container with a non-root runtime where possible and seccomp/AppArmor/user namespace controls where applicable.",
    alert: true,
    context: {
      context,
      nodeEnv: process.env.NODE_ENV,
      noSandboxEnabled,
      productionAcknowledged,
      runtimeRequirements: PDF_CHROMIUM_RUNTIME_REQUIREMENTS,
    },
  });
}

function isAllowedPdfResource(url: string) {
  if (
    url === "about:blank" ||
    url.startsWith("data:") ||
    url.startsWith("https://fonts.googleapis.com/") ||
    url.startsWith("https://fonts.gstatic.com/")
  ) {
    return true;
  }

  if (url.startsWith("file://")) {
    const publicDir = path.resolve(process.cwd(), "public");
    const filePath = path.resolve(fileURLToPath(url));
    return filePath === publicDir || filePath.startsWith(`${publicDir}${path.sep}`);
  }

  return false;
}

function mimeTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function isPublicFilePath(filePath: string) {
  const publicDir = path.resolve(process.cwd(), "public");
  const resolvedPath = path.resolve(filePath);
  return resolvedPath === publicDir || resolvedPath.startsWith(`${publicDir}${path.sep}`);
}

function inlinePublicFileImages(htmlContent: string) {
  return htmlContent.replace(/file:\/\/\/[^"')]+/g, (fileUrl) => {
    const filePath = path.resolve(fileURLToPath(fileUrl));
    if (!isPublicFilePath(filePath) || !fs.existsSync(filePath)) {
      return fileUrl;
    }

    const content = fs.readFileSync(filePath);
    return `data:${mimeTypeForFile(filePath)};base64,${content.toString("base64")}`;
  });
}

/**
 * Compiles a luxury HTML/CSS template to a PDF Buffer using a headless browser (Puppeteer).
 * 
 * Enforces the following configurations:
 * 1. printBackground: true (renders background colors, gradients, and images)
 * 2. Margins: top: 0, left: 0, right: 0 (enables full-bleed hero headers)
 * 3. Asset Loading: Wait for all network resources to settle (Google Fonts, Unsplash assets)
 */
export async function compileHtmlToPdf(htmlContent: string, context = "pdf.render"): Promise<Buffer> {
  const htmlBytes = Buffer.byteLength(htmlContent, "utf8");
  if (htmlBytes > PDF_MAX_HTML_BYTES) {
    await logOperationalEvent({
      event: "pdf_render_rejected",
      severity: "warn",
      message: "PDF HTML input exceeded configured size limit.",
      alert: true,
      context: { context, htmlBytes, maxHtmlBytes: PDF_MAX_HTML_BYTES },
    });
    throw new Error("PDF input is too large to render safely.");
  }

  const timeoutMs = getPdfRenderTimeoutMs();
  return withPdfRenderSlot(() => renderPdf(htmlContent, context, htmlBytes, timeoutMs), context, timeoutMs);
}

async function renderPdf(htmlContent: string, context: string, htmlBytes: number, timeoutMs: number): Promise<Buffer> {
  const start = Date.now();
  const executablePath = getExecutablePath();
  const renderHtml = inlinePublicFileImages(htmlContent);
  await assertPdfChromiumSandboxPolicy(context);

  let browser: Browser | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let hasTimedOut = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(async () => {
      hasTimedOut = true;
      if (browser) {
        try {
          await browser.close();
        } catch {
          // ignore
        }
      }
      reject(new Error(`PDF render timed out after ${timeoutMs}ms (${context})`));
    }, timeoutMs);
  });

  const workPromise = (async () => {
    const launchedBrowser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: getPdfChromiumLaunchArgs(),
    });

    if (hasTimedOut) {
      await launchedBrowser.close();
      throw new Error(`PDF render timed out after ${timeoutMs}ms (${context})`);
    }
    browser = launchedBrowser;

    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      if (isAllowedPdfResource(request.url())) {
        await request.continue();
      } else {
        await request.abort();
      }
    });

    // Set a standard desktop User-Agent to bypass CDN bot blocking (e.g. Unsplash/Cloudflare 403 Forbidden)
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    await page.setContent(renderHtml, {
      waitUntil: "load",
      timeout: timeoutMs,
    });

    // Explicit brief delay to ensure sub-layout styles and fonts are rendered
    await new Promise((r) => setTimeout(r, process.env.NODE_ENV === "test" ? 0 : 1000));

    // Generate A4 PDF with full-bleed configuration
    const pdfUint8Array = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
      },
    });

    const pdf = Buffer.from(pdfUint8Array);
    if (pdf.byteLength > PDF_MAX_OUTPUT_BYTES) {
      await logOperationalEvent({
        event: "pdf_render_rejected",
        severity: "warn",
        message: "PDF output exceeded configured size limit.",
        alert: true,
        context: { context, htmlBytes, outputBytes: pdf.byteLength, maxOutputBytes: PDF_MAX_OUTPUT_BYTES },
      });
      throw new Error("PDF output is too large to return safely.");
    }

    logOperationalEvent({
      event: "pdf_render_succeeded",
      severity: "info",
      message: "PDF rendered successfully.",
      alert: false,
      context: {
        context,
        htmlBytes,
        outputBytes: pdf.byteLength,
        durationMs: Date.now() - start,
        activePdfRenders,
      },
    });

    return pdf;
  })();

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } catch (error) {
    await logOperationalEvent({
      event: "pdf_render_failed",
      severity: "error",
      message: "PDF render failed.",
      context: {
        context,
        htmlBytes,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const activeBrowser = browser as Browser | null;
    if (activeBrowser) {
      try {
        await activeBrowser.close();
      } catch {
        // ignore
      }
    }
  }
}
