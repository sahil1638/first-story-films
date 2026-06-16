import "server-only";

import { logOperationalEvent } from "@/lib/ops/operational-logger";
import { downloadCachedPdfObject, uploadCachedPdfObject } from "@/lib/data/service-role/pdf";

interface CacheEntry {
  buffer: Buffer;
  version: string;
  expiresAt: number;
  lastAccessAt: number;
  sizeBytes: number;
}

type CacheConfig = {
  ttlSeconds: number;
  maxEntries: number;
  maxBytes: number;
};

const DEFAULT_TTL_SECONDS = 900;
const DEFAULT_MAX_ENTRIES = 20;
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

const cache = new Map<string, CacheEntry>();
let totalBytes = 0;

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getConfig(): CacheConfig {
  return {
    ttlSeconds: readPositiveIntegerEnv("PDF_CACHE_TTL_SECONDS", DEFAULT_TTL_SECONDS),
    maxEntries: readPositiveIntegerEnv("PDF_CACHE_MAX_ENTRIES", DEFAULT_MAX_ENTRIES),
    maxBytes: readPositiveIntegerEnv("PDF_CACHE_MAX_BYTES", DEFAULT_MAX_BYTES),
  };
}

function getCacheBackend() {
  return (process.env.PDF_CACHE_BACKEND ?? "memory").trim().toLowerCase();
}

function getStorageBucket() {
  return process.env.PDF_CACHE_BUCKET?.trim() || "pdf-cache";
}

function storageObjectPath(key: string, version: string) {
  const encodedKey = Buffer.from(key).toString("base64url");
  const encodedVersion = Buffer.from(version).toString("base64url");
  return `${encodedKey}/${encodedVersion}.pdf`;
}

function evictEntry(key: string, reason: string, extra: Record<string, unknown> = {}) {
  const entry = cache.get(key);
  if (!entry) return false;

  cache.delete(key);
  totalBytes = Math.max(0, totalBytes - entry.sizeBytes);

  logOperationalEvent({
    event: "pdf_cache_eviction",
    severity: "info",
    message: `PDF cache evicted key: ${key}`,
    alert: false,
    context: {
      key,
      version: entry.version,
      reason,
      sizeBytes: entry.sizeBytes,
      totalBytes,
      entries: cache.size,
      ...extra,
    },
  });

  return true;
}

function evictExpiredEntries(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      evictEntry(key, "ttl_expired", {
        expiresAt: entry.expiresAt,
        lastAccessAt: entry.lastAccessAt,
      });
    }
  }
}

function evictToLimits(now: number) {
  const config = getConfig();
  evictExpiredEntries(now);

  while (cache.size > config.maxEntries || totalBytes > config.maxBytes) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;

    evictEntry(oldestKey, cache.size > config.maxEntries ? "max_entries" : "max_bytes", {
      maxEntries: config.maxEntries,
      maxBytes: config.maxBytes,
    });
  }
}

export function getCachedPdf(key: string, version: string): Buffer | null {
  const now = Date.now();
  evictExpiredEntries(now);

  const entry = cache.get(key);
  if (!entry) {
    logOperationalEvent({
      event: "pdf_cache_miss",
      severity: "info",
      message: `PDF cache miss for key: ${key}`,
      alert: false,
      context: { key, version, reason: "not_found" },
    });
    return null;
  }

  if (entry.expiresAt <= now) {
    evictEntry(key, "ttl_expired", {
      expiresAt: entry.expiresAt,
      lastAccessAt: entry.lastAccessAt,
    });

    logOperationalEvent({
      event: "pdf_cache_miss",
      severity: "info",
      message: `PDF cache miss for key: ${key}`,
      alert: false,
      context: { key, version, reason: "expired" },
    });
    return null;
  }

  if (entry.version !== version) {
    logOperationalEvent({
      event: "pdf_cache_miss",
      severity: "info",
      message: `PDF cache miss for key: ${key}`,
      alert: false,
      context: { key, version, reason: "version_mismatch", cachedVersion: entry.version },
    });
    return null;
  }

  cache.delete(key);
  entry.lastAccessAt = now;
  cache.set(key, entry);

  logOperationalEvent({
    event: "pdf_cache_hit",
    severity: "info",
    message: `PDF cache hit for key: ${key}`,
    alert: false,
    context: { key, version, sizeBytes: entry.sizeBytes, totalBytes, entries: cache.size },
  });
  return entry.buffer;
}

async function getCachedPdfFromStorage(key: string, version: string): Promise<Buffer | null> {
  const bucket = getStorageBucket();
  const objectPath = storageObjectPath(key, version);

  try {
    const { data, error } = await downloadCachedPdfObject(bucket, objectPath);
    if (error || !data) {
      logOperationalEvent({
        event: "pdf_storage_cache_miss",
        severity: "info",
        message: "PDF storage cache miss.",
        alert: false,
        context: { key, version, bucket, objectPath, reason: error?.message ?? "not_found" },
      });
      return null;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    setCachedPdf(key, version, buffer);

    logOperationalEvent({
      event: "pdf_storage_cache_hit",
      severity: "info",
      message: "PDF storage cache hit.",
      alert: false,
      context: { key, version, bucket, objectPath, sizeBytes: buffer.byteLength },
    });

    return buffer;
  } catch (error) {
    await logOperationalEvent({
      event: "pdf_storage_cache_failed",
      severity: "warn",
      message: "PDF storage cache lookup failed.",
      alert: true,
      context: { key, version, bucket, objectPath, error },
    });
    return null;
  }
}

export async function getCachedPdfArtifact(key: string, version: string): Promise<Buffer | null> {
  const memoryHit = getCachedPdf(key, version);
  if (memoryHit || getCacheBackend() !== "supabase-storage") {
    return memoryHit;
  }

  return getCachedPdfFromStorage(key, version);
}

export function setCachedPdf(key: string, version: string, buffer: Buffer): boolean {
  const now = Date.now();
  const config = getConfig();
  const sizeBytes = buffer.byteLength;

  evictExpiredEntries(now);

  if (sizeBytes > config.maxBytes) {
    logOperationalEvent({
      event: "pdf_cache_oversized_skip",
      severity: "warn",
      message: `PDF cache skipped oversized buffer for key: ${key}`,
      alert: false,
      context: {
        key,
        version,
        sizeBytes,
        maxBytes: config.maxBytes,
        ttlSeconds: config.ttlSeconds,
      },
    });
    return false;
  }

  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    totalBytes = Math.max(0, totalBytes - existing.sizeBytes);
  }

  cache.set(key, {
    buffer,
    version,
    expiresAt: now + config.ttlSeconds * 1000,
    lastAccessAt: now,
    sizeBytes,
  });
  totalBytes += sizeBytes;

  evictToLimits(now);
  return true;
}

async function setCachedPdfInStorage(key: string, version: string, buffer: Buffer): Promise<boolean> {
  const bucket = getStorageBucket();
  const objectPath = storageObjectPath(key, version);

  try {
    const { error } = await uploadCachedPdfObject(bucket, objectPath, buffer, getConfig().ttlSeconds);

    if (error) {
      throw new Error(error.message || "Storage upload failed");
    }

    logOperationalEvent({
      event: "pdf_storage_cache_set",
      severity: "info",
      message: "PDF stored in shared cache.",
      alert: false,
      context: { key, version, bucket, objectPath, sizeBytes: buffer.byteLength },
    });
    return true;
  } catch (error) {
    await logOperationalEvent({
      event: "pdf_storage_cache_set_failed",
      severity: "warn",
      message: "Failed to store PDF in shared cache.",
      alert: true,
      context: { key, version, bucket, objectPath, sizeBytes: buffer.byteLength, error },
    });
    return false;
  }
}

export async function setCachedPdfArtifact(key: string, version: string, buffer: Buffer): Promise<boolean> {
  const memoryStored = setCachedPdf(key, version, buffer);
  if (getCacheBackend() !== "supabase-storage") {
    return memoryStored;
  }

  const storageStored = await setCachedPdfInStorage(key, version, buffer);
  return memoryStored || storageStored;
}

export function clearCachedPdf(key: string): void {
  evictEntry(key, "manual_clear");
}

export function getPdfCacheSize(): number {
  return cache.size;
}

export function getPdfCacheBytes(): number {
  return totalBytes;
}

export function getPdfCacheStats() {
  const config = getConfig();
  return {
    entries: cache.size,
    bytes: totalBytes,
    ttlSeconds: config.ttlSeconds,
    maxEntries: config.maxEntries,
    maxBytes: config.maxBytes,
  };
}

export function clearAllPdfCache(): void {
  cache.clear();
  totalBytes = 0;
}
