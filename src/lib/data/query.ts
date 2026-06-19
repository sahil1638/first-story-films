const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_SEARCH_LENGTH = 80;
const POSTGREST_SEARCH_ALLOWED_CHARS = /[^\p{L}\p{N}\s@+\-']/gu;

export function normalizePage(value?: number) {
  return Math.max(1, Number.isFinite(value ?? NaN) ? Number(value) : 1);
}

export function normalizeLimit(value?: number) {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Number(value)));
}

export function sanitizePostgrestSearch(value?: string) {
  const cleaned = value
    ?.trim()
    .replace(POSTGREST_SEARCH_ALLOWED_CHARS, " ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_SEARCH_LENGTH)
    .trim();

  return cleaned && cleaned.length >= 2 ? cleaned : undefined;
}

export function buildIlikeOrFilter(columns: string[], search: string) {
  const escaped = search.replace(/[%_\\]/g, (match) => `\\${match}`);
  return columns.map((column) => `${column}.ilike.%${escaped}%`).join(",");
}
