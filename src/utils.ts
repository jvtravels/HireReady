/* ─── Core Utilities ─── */

/* ─── Intl Formatters (locale-aware number, currency, date) ─── */

let _currencyFormatter: Intl.NumberFormat | null = null;
let _numberFormatter: Intl.NumberFormat | null = null;
let _dateTimeFormatter: Intl.DateTimeFormat | null = null;

/** Format a number as INR currency. Defaults to "en-IN" for proper lakh/crore grouping. */
export function formatINR(amount: number, opts: { minimumFractionDigits?: number; locale?: string } = {}): string {
  const locale = opts.locale || "en-IN";
  if (!_currencyFormatter || _currencyFormatter.resolvedOptions().locale !== locale) {
    _currencyFormatter = new Intl.NumberFormat(locale, {
      style: "currency", currency: "INR",
      minimumFractionDigits: opts.minimumFractionDigits ?? 0,
      maximumFractionDigits: 2,
    });
  }
  return _currencyFormatter.format(amount);
}

/** Format a plain number with locale-aware grouping (12,345 or 12.345 depending on locale). */
export function formatNumber(n: number, locale = "en-IN"): string {
  if (!_numberFormatter || _numberFormatter.resolvedOptions().locale !== locale) {
    _numberFormatter = new Intl.NumberFormat(locale);
  }
  return _numberFormatter.format(n);
}

/** Format a date/time in a locale-aware way. Accepts Date, ISO string, or epoch ms. */
export function formatDateTime(value: Date | string | number, opts: Intl.DateTimeFormatOptions & { locale?: string } = {}): string {
  const locale = opts.locale || "en-IN";
  const date = value instanceof Date ? value : new Date(value);
  const key = JSON.stringify(opts) + locale;
  if (!_dateTimeFormatter || (_dateTimeFormatter as unknown as { _cacheKey?: string })._cacheKey !== key) {
    _dateTimeFormatter = new Intl.DateTimeFormat(locale, {
      dateStyle: opts.dateStyle || "medium",
      timeStyle: opts.timeStyle,
      timeZone: opts.timeZone,
    });
    (_dateTimeFormatter as unknown as { _cacheKey?: string })._cacheKey = key;
  }
  return _dateTimeFormatter.format(date);
}

/** Format a relative time like "2 hours ago" or "in 3 days". */
export function formatRelativeTime(value: Date | string | number, locale = "en-IN"): string {
  const date = value instanceof Date ? value : new Date(value);
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000000], ["month", 2628000000], ["week", 604800000],
    ["day", 86400000], ["hour", 3600000], ["minute", 60000], ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(0, "second");
}


/**
 * Generate a v4 UUID, with fallback for insecure contexts (HTTP, older browsers).
 * Uses crypto.randomUUID() when available, otherwise manually constructs a compliant UUID.
 */
export function safeUUID(): string {
  try { return crypto.randomUUID(); } catch { /* insecure context */ }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Safely parse JSON without throwing. Returns null on failure.
 * Prevents crashes from corrupted localStorage, malformed API responses, etc.
 */
export function safeJsonParse<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * Extract a human-readable message from any caught error value.
 * Handles Error objects, strings, and unknown thrown values.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "An unexpected error occurred";
}

/**
 * Safe localStorage wrapper with automatic JSON serialization and error handling.
 * All operations are wrapped in try-catch to handle quota exceeded, private browsing, etc.
 */
export const safeStorage = {
  get<T = unknown>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  },
  getString(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: unknown): boolean {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  setString(key: string, value: string): boolean {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { /* expected: localStorage may be unavailable */ }
  },
  /** Set with TTL — stores a wrapper with expiry timestamp */
  setWithTTL(key: string, value: unknown, ttlMs: number): boolean {
    try {
      localStorage.setItem(key, JSON.stringify({ __v: 1, data: value, exp: Date.now() + ttlMs }));
      return true;
    } catch { return false; }
  },
  /** Get with TTL — returns null if expired */
  getWithTTL<T = unknown>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.__v === 1 && typeof parsed.exp === "number") {
        if (Date.now() > parsed.exp) { localStorage.removeItem(key); return null; }
        return parsed.data as T;
      }
      return parsed as T; // Legacy data without TTL wrapper
    } catch { return null; }
  },
};

/**
 * Environment-aware logger. Suppresses debug/info in production.
 * Always allows warn/error for critical issue visibility.
 */
const IS_DEV = typeof window !== "undefined" && (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
);

export const logger = {
  // eslint-disable-next-line no-console -- logger utility wraps console for environment-aware logging
  debug: IS_DEV ? console.debug.bind(console) : () => {},
  // eslint-disable-next-line no-console -- logger utility wraps console for environment-aware logging
  info: IS_DEV ? console.info.bind(console) : () => {},
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

/**
 * Clamp a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Format a duration in seconds to a human-readable string.
 * e.g., 125 → "2m 5s", 3661 → "1h 1m"
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
