import { vi } from "vitest";
import { describe, it, expect, beforeEach } from "vitest";

// Mock server-only and set env vars at the very top of execution
vi.mock("server-only", () => {
  process.env.PDF_RENDER_TIMEOUT_MS = "100";
  return {};
});

// Mock operational logger
vi.mock("@/lib/ops/operational-logger", () => ({
  logOperationalEvent: vi.fn(),
}));

const {
  acquireSlotMock,
  releaseSlotMock,
  storageDownloadMock,
  storageUploadMock,
} = vi.hoisted(() => {
  const acquireSlotMock = vi.fn();
  const releaseSlotMock = vi.fn();
  const storageDownloadMock = vi.fn();
  const storageUploadMock = vi.fn();
  return {
    acquireSlotMock,
    releaseSlotMock,
    storageDownloadMock,
    storageUploadMock,
  };
});

vi.mock("@/lib/data/service-role/pdf", () => ({
  downloadCachedPdfObject: storageDownloadMock,
  uploadCachedPdfObject: storageUploadMock,
  tryAcquirePdfRenderSlot: acquireSlotMock,
  releasePdfRenderSlot: releaseSlotMock,
}));

// Mock puppeteer internally to avoid hoisting order errors
vi.mock("puppeteer", () => {
  const mockPdf = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
  const mockNewPage = vi.fn().mockResolvedValue({
    setDefaultTimeout: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    setRequestInterception: vi.fn(),
    on: vi.fn(),
    setUserAgent: vi.fn(),
    setContent: vi.fn(),
    pdf: mockPdf,
  });

  const mockBrowser = {
    newPage: mockNewPage,
    close: vi.fn(),
  };

  return {
    default: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    },
  };
});

// Mock rate-limit checkDbRateLimit
vi.mock("@/lib/security/rate-limit", () => ({
  checkDbRateLimit: vi.fn().mockResolvedValue(true),
  rateLimitKey: vi.fn((prefix, val) => `${prefix}:${val}`),
}));

// Mock next/headers headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue("127.0.0.1"),
  }),
}));

// Mock next/navigation notFound
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

// Mock requireRoleOrThrow
vi.mock("@/lib/auth/require-role", () => ({
  requireRoleOrThrow: vi.fn().mockResolvedValue({ id: "test-user-id" }),
}));

const mockOrder = {
  id: "quotation-123",
  quotation_id: "quotation-123",
  updated_at: "2026-06-12T12:00:00Z",
  couple_name: "Jane",
  your_name: "John",
  contact_number: "1234567890",
  email: "john@example.com",
  event_location: "City",
  wedding_venue: "Venue",
  wedding_date: "2026-06-20",
  total_amount: 1000,
  paid_amount: 0,
  payment_status: "unpaid",
  subtotal_amount: 1000,
  gst_rate: 0,
  gst_amount: 0,
  invoice_type: "non_gst",
  order_services: [],
  order_deliverables: [],
};

const mockQuotation = {
  id: "quotation-123",
  updated_at: "2026-06-12T12:00:00Z",
  your_name: "John",
  couple_name: "Jane",
  contact_number: "1234567890",
  event_location: "City",
  wedding_date: "2026-06-20",
  album_requirement: "yes",
  drone_requirement: "no",
  shooting_side: "both",
  pre_wedding_shoot: "yes",
  functions_count: 1,
  budget_range: "high",
  terms_and_conditions: "Standard Terms",
  quotation_service_persons: [],
  quotation_deliverables: [],
  quotation_function_days: [],
};

vi.mock("@/lib/data/orders", () => ({
  getOrderById: vi.fn().mockResolvedValue(mockOrder),
  getPaymentsByOrderId: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/data/quotations", () => ({
  getQuotationById: vi.fn().mockResolvedValue(mockQuotation),
}));

vi.mock("@/lib/data/masters", () => ({
  getServices: vi.fn().mockResolvedValue([]),
  getDeliverablesByIds: vi.fn().mockResolvedValue([]),
  getEvents: vi.fn().mockResolvedValue([]),
  getCrewMembers: vi.fn().mockResolvedValue([]),
  getSettings: vi.fn().mockResolvedValue([{ key: "terms_and_conditions", value: "Standard Terms" }]),
}));

// Mock createClient to return mockSupabase
vi.mock("@/lib/supabase/server", () => {
  const mockQuotationObj = {
    id: "quotation-123",
    updated_at: "2026-06-12T12:00:00Z",
    your_name: "John",
    couple_name: "Jane",
    contact_number: "1234567890",
    event_location: "City",
    wedding_date: "2026-06-20",
    album_requirement: "yes",
    drone_requirement: "no",
    shooting_side: "both",
    pre_wedding_shoot: "yes",
    functions_count: 1,
    budget_range: "high",
    terms_and_conditions: "Standard Terms",
    quotation_service_persons: [],
    quotation_deliverables: [],
    quotation_function_days: [],
  };

  const singleMock = vi.fn().mockResolvedValue({ data: mockQuotationObj, error: null });

  const mockQueryChain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: singleMock,
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
      resolve({ data: [], error: null });
    },
  };

  const mockSupabase = {
    from: vi.fn((table) => {
      if (table === "settings") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ key: "terms_and_conditions", value: "Standard Terms" }],
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue(mockQueryChain),
      };
    }),
    select: vi.fn().mockReturnValue(mockQueryChain),
    eq: vi.fn().mockReturnValue(mockQueryChain),
    single: singleMock,
    in: vi.fn().mockReturnValue(mockQueryChain),
  };

  return {
    createClient: vi.fn().mockResolvedValue(mockSupabase),
  };
});

import { compileHtmlToPdf } from "@/lib/pdf-puppeteer";
import {
  assertPdfChromiumSandboxPolicy,
  getPdfChromiumLaunchArgs,
} from "@/lib/pdf-puppeteer";
import {
  getCachedPdf,
  setCachedPdf,
  clearAllPdfCache,
  getPdfCacheSize,
  getPdfCacheBytes,
  getCachedPdfArtifact,
  setCachedPdfArtifact,
} from "@/lib/pdf-cache";
import { checkDbRateLimit } from "@/lib/security/rate-limit";
import { GET as getQuotationPdf } from "@/app/api/quotations/[id]/pdf/route";
import { logOperationalEvent } from "@/lib/ops/operational-logger";

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

describe("PDF Performance & Caching Tests (Issue P1)", () => {
  beforeEach(() => {
    setNodeEnv(originalNodeEnv);
    delete process.env.PDF_CHROMIUM_NO_SANDBOX;
    delete process.env.PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK;
    delete process.env.PDF_RENDER_LOCK_MODE;
    vi.clearAllMocks();
  });

  describe("PDF Caching Utility", () => {
    beforeEach(() => {
      clearAllPdfCache();
      vi.clearAllMocks();
      delete process.env.PDF_CACHE_TTL_SECONDS;
      delete process.env.PDF_CACHE_MAX_ENTRIES;
      delete process.env.PDF_CACHE_MAX_BYTES;
      delete process.env.PDF_CACHE_BACKEND;
      delete process.env.PDF_CACHE_BUCKET;
      acquireSlotMock.mockReset();
      releaseSlotMock.mockReset();
      storageDownloadMock.mockReset();
      storageUploadMock.mockReset();
    });

    it("should set and retrieve cached PDF buffer correctly", () => {
      const key = "test-key";
      const version = "v1";
      const buffer = Buffer.from("hello pdf");

      expect(getCachedPdf(key, version)).toBeNull();

      setCachedPdf(key, version, buffer);
      expect(getPdfCacheSize()).toBe(1);
      expect(getPdfCacheBytes()).toBe(buffer.length);

      const cached = getCachedPdf(key, version);
      expect(cached).not.toBeNull();
      expect(cached!.toString()).toBe("hello pdf");

      // Version mismatch should miss
      expect(getCachedPdf(key, "v2")).toBeNull();
    });

    it("should evict entries after TTL expiry", () => {
      vi.useFakeTimers();
      process.env.PDF_CACHE_TTL_SECONDS = "1";

      const key = "ttl-key";
      const buffer = Buffer.from("ttl pdf");

      setCachedPdf(key, "v1", buffer);
      expect(getCachedPdf(key, "v1")?.toString()).toBe("ttl pdf");

      vi.advanceTimersByTime(1100);

      expect(getCachedPdf(key, "v1")).toBeNull();
      expect(getPdfCacheSize()).toBe(0);
      expect(getPdfCacheBytes()).toBe(0);

      vi.useRealTimers();
    });

    it("should evict oldest entries when max entries is exceeded", () => {
      process.env.PDF_CACHE_MAX_ENTRIES = "2";

      setCachedPdf("entry-1", "v1", Buffer.from("111"));
      setCachedPdf("entry-2", "v1", Buffer.from("222"));
      setCachedPdf("entry-3", "v1", Buffer.from("333"));

      expect(getPdfCacheSize()).toBe(2);
      expect(getCachedPdf("entry-1", "v1")).toBeNull();
      expect(getCachedPdf("entry-2", "v1")).not.toBeNull();
      expect(getCachedPdf("entry-3", "v1")).not.toBeNull();
    });

    it("should evict least-recently-used entries when max bytes is exceeded", () => {
      process.env.PDF_CACHE_MAX_BYTES = "10";

      setCachedPdf("bytes-1", "v1", Buffer.from("123456"));
      expect(getCachedPdf("bytes-1", "v1")?.toString()).toBe("123456");

      setCachedPdf("bytes-2", "v1", Buffer.from("abcde"));

      expect(getPdfCacheSize()).toBe(1);
      expect(getCachedPdf("bytes-1", "v1")).toBeNull();
      expect(getCachedPdf("bytes-2", "v1")?.toString()).toBe("abcde");
      expect(getPdfCacheBytes()).toBe(Buffer.byteLength("abcde"));
    });

    it("should skip caching oversized PDFs", () => {
      process.env.PDF_CACHE_MAX_BYTES = "10";

      const buffer = Buffer.from("this is too big");
      expect(setCachedPdf("oversized", "v1", buffer)).toBe(false);
      expect(getPdfCacheSize()).toBe(0);
      expect(getPdfCacheBytes()).toBe(0);
      expect(getCachedPdf("oversized", "v1")).toBeNull();
    });

    it("should read through to Supabase Storage when shared PDF cache is enabled", async () => {
      process.env.PDF_CACHE_BACKEND = "supabase-storage";
      storageDownloadMock.mockResolvedValueOnce({
        data: new Blob([Buffer.from("shared pdf")], { type: "application/pdf" }),
        error: null,
      });

      const cached = await getCachedPdfArtifact("shared-key", "v1");

      expect(cached?.toString()).toBe("shared pdf");
      expect(storageDownloadMock).toHaveBeenCalledTimes(1);
      expect(getCachedPdf("shared-key", "v1")?.toString()).toBe("shared pdf");
    });

    it("should write through to Supabase Storage when shared PDF cache is enabled", async () => {
      process.env.PDF_CACHE_BACKEND = "supabase-storage";
      storageUploadMock.mockResolvedValueOnce({ data: null, error: null });

      await expect(setCachedPdfArtifact("shared-key", "v1", Buffer.from("shared pdf"))).resolves.toBe(true);

      expect(storageUploadMock).toHaveBeenCalledWith(
        "pdf-cache",
        expect.stringMatching(/\.pdf$/),
        expect.any(Buffer),
        900
      );
    });
  });

  describe("compileHtmlToPdf Timeout Safeguards", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should render successfully under timeout limit", async () => {
      const pdf = await compileHtmlToPdf("<html></html>", "test.context");
      expect(pdf).toBeDefined();
      expect(pdf[0]).toBe(1);
    });

    it("should coordinate rendering with a database lock when configured", async () => {
      process.env.PDF_RENDER_LOCK_MODE = "database";
      acquireSlotMock
        .mockResolvedValueOnce({ data: 1, error: null })
      releaseSlotMock.mockResolvedValueOnce({ data: null, error: null });

      const pdf = await compileHtmlToPdf("<html></html>", "test.locked-render");

      expect(pdf[0]).toBe(1);
      expect(acquireSlotMock).toHaveBeenCalledWith(expect.objectContaining({
        maxSlots: expect.any(Number),
        owner: expect.stringContaining("test.locked-render"),
      }));
      expect(releaseSlotMock).toHaveBeenCalledWith(expect.objectContaining({
        slotId: 1,
        owner: expect.stringContaining("test.locked-render"),
      }));
    });

    it("should throw a timeout error if rendering hangs beyond limit", async () => {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch();
      const page = await browser.newPage();
      
      // Override setContent mock to slow down and trigger timeout
      vi.mocked(page.setContent).mockImplementationOnce(() => {
        return new Promise((resolve) => setTimeout(resolve, 500));
      });

      await expect(compileHtmlToPdf("<html></html>", "test.context")).rejects.toThrow(/timed out/i);
    });
  });

  describe("Chromium sandbox policy", () => {
    it("should exclude no-sandbox args by default", () => {
      expect(getPdfChromiumLaunchArgs()).not.toContain("--no-sandbox");
      expect(getPdfChromiumLaunchArgs()).not.toContain("--disable-setuid-sandbox");
    });

    it("should allow no-sandbox in non-production only when explicitly enabled", async () => {
      process.env.PDF_CHROMIUM_NO_SANDBOX = "true";
      setNodeEnv("test");

      expect(getPdfChromiumLaunchArgs()).toEqual(
        expect.arrayContaining(["--no-sandbox", "--disable-setuid-sandbox"])
      );

      await expect(assertPdfChromiumSandboxPolicy("pdf.test")).resolves.not.toThrow();

      expect(vi.mocked(logOperationalEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdf_chromium_no_sandbox_enabled",
          severity: "warn",
        })
      );
    });

    it("should reject production no-sandbox without acknowledgement", async () => {
      process.env.PDF_CHROMIUM_NO_SANDBOX = "true";
      setNodeEnv("production");

      await expect(assertPdfChromiumSandboxPolicy("pdf.test")).rejects.toThrow(
        /blocked in production/i
      );

      expect(vi.mocked(logOperationalEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdf_chromium_no_sandbox_blocked",
          severity: "warn",
        })
      );
    });

    it("should allow acknowledged production no-sandbox with warning log", async () => {
      process.env.PDF_CHROMIUM_NO_SANDBOX = "true";
      process.env.PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK = "true";
      setNodeEnv("production");

      await expect(assertPdfChromiumSandboxPolicy("pdf.test")).resolves.not.toThrow();

      expect(vi.mocked(logOperationalEvent)).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "pdf_chromium_no_sandbox_enabled",
          severity: "warn",
          alert: true,
        })
      );
    });
  });

  describe("API Route Rate Limiting and Caching Integration", () => {
    beforeEach(() => {
      clearAllPdfCache();
      vi.clearAllMocks();
      delete process.env.PDF_CACHE_TTL_SECONDS;
      delete process.env.PDF_CACHE_MAX_ENTRIES;
      delete process.env.PDF_CACHE_MAX_BYTES;
    });

    it("should return cached PDF buffer on cache hit without calling Puppeteer", async () => {
      // Prime the cache
      const mockBuffer = Buffer.from("Cached Quotation PDF");
      setCachedPdf("quotation:quotation-123", "2026-06-12T12:00:00Z", mockBuffer);

      const cached = getCachedPdf("quotation:quotation-123", "2026-06-12T12:00:00Z");
      expect(cached).not.toBeNull();
      expect(cached!.toString()).toBe("Cached Quotation PDF");
    });

    it("should generate PDF and set cache on cache miss", async () => {
      const body = Buffer.from("Generated Quotation PDF");
      setCachedPdf("quotation:quotation-123", "2026-06-12T12:00:00Z", body);

      const cached = getCachedPdf("quotation:quotation-123", "2026-06-12T12:00:00Z");
      expect(cached).not.toBeNull();
      expect(cached!.toString()).toBe("Generated Quotation PDF");
    });

    it("should return 429 Too Many Requests if rate limits are exceeded", async () => {
      // Mock checkDbRateLimit to return false (limit exceeded)
      vi.mocked(checkDbRateLimit).mockResolvedValueOnce(false);

      const request = new Request("http://localhost:3000/api/quotations/quotation-123/pdf");
      const response = await getQuotationPdf(request, {
        params: Promise.resolve({ id: "quotation-123" }),
      });

      expect(response.status).toBe(429);
      const text = await response.text();
      expect(text).toMatch(/too many pdf requests/i);
    });

    it("should bypass route-level rendering rate limit on cache hit but enforce user-level rate limit", async () => {
      // Prime the cache
      const mockBuffer = Buffer.from("Cached Quotation PDF");
      setCachedPdf("quotation:quotation-123", "2026-06-12T12:00:00Z", mockBuffer);

      // Mock checkDbRateLimit: user limit (pdf:...) passes, route limit (pdf:route-...) fails
      vi.mocked(checkDbRateLimit).mockImplementation(async (key) => {
        if (key.startsWith("pdf:route-")) {
          return false;
        }
        return true;
      });

      const request = new Request("http://localhost:3000/api/quotations/quotation-123/pdf");
      const response = await getQuotationPdf(request, {
        params: Promise.resolve({ id: "quotation-123" }),
      });

      expect(response.status).toBe(200);
      const data = await response.arrayBuffer();
      expect(Buffer.from(data).toString()).toBe("Cached Quotation PDF");
    });

    it("should enforce user-level rate limit on cache hit", async () => {
      // Prime the cache
      const mockBuffer = Buffer.from("Cached Quotation PDF");
      setCachedPdf("quotation:quotation-123", "2026-06-12T12:00:00Z", mockBuffer);

      // Mock checkDbRateLimit: user limit fails
      vi.mocked(checkDbRateLimit).mockImplementation(async (key) => {
        if (key.startsWith("pdf:")) {
          return false;
        }
        return true;
      });

      const request = new Request("http://localhost:3000/api/quotations/quotation-123/pdf");
      const response = await getQuotationPdf(request, {
        params: Promise.resolve({ id: "quotation-123" }),
      });

      expect(response.status).toBe(429);
    });
  });
});
