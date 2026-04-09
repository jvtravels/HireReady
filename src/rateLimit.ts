/* ─── Client-side rate limiting utilities ─── */

const timestamps = new Map<string, number[]>();

/**
 * Check if an action should be rate-limited.
 * Returns true if the action is allowed, false if it should be blocked.
 */
export function checkRateLimit(key: string, maxCalls: number, windowMs: number): boolean {
  const now = Date.now();
  const calls = timestamps.get(key) || [];
  const recent = calls.filter(t => now - t < windowMs);
  if (recent.length >= maxCalls) return false;
  recent.push(now);
  timestamps.set(key, recent);
  return true;
}

/**
 * Wraps an async function with client-side rate limiting.
 * If the rate limit is exceeded, returns the fallback value.
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  key: string,
  maxCalls: number,
  windowMs: number,
  onLimited?: () => void,
): T {
  return ((...args: any[]) => {
    if (!checkRateLimit(key, maxCalls, windowMs)) {
      onLimited?.();
      return Promise.reject(new Error(`Rate limited: ${key}. Please wait before trying again.`));
    }
    return fn(...args);
  }) as T;
}

/**
 * Debounce utility — returns the last call's result after a delay.
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delayMs: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    return new Promise((resolve) => {
      timer = setTimeout(() => {
        timer = null;
        resolve(fn(...args));
      }, delayMs);
    });
  }) as T & { cancel: () => void };
  debounced.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return debounced;
}
