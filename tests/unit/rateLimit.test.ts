import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Each test file gets a fresh module to avoid cross-test pollution of the
// internal `timestamps` Map.  We use dynamic import + vi.resetModules().
let checkRateLimit: typeof import("../../src/rateLimit").checkRateLimit;
let withRateLimit: typeof import("../../src/rateLimit").withRateLimit;
let debounce: typeof import("../../src/rateLimit").debounce;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../src/rateLimit");
  checkRateLimit = mod.checkRateLimit;
  withRateLimit = mod.withRateLimit;
  debounce = mod.debounce;
});

/* ────────────────────────── checkRateLimit ────────────────────────── */

describe("checkRateLimit", () => {
  it("allows calls within limit", () => {
    expect(checkRateLimit("test-key-1", 3, 10_000)).toBe(true);
    expect(checkRateLimit("test-key-1", 3, 10_000)).toBe(true);
    expect(checkRateLimit("test-key-1", 3, 10_000)).toBe(true);
  });

  it("blocks after limit exceeded", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("test-key-2", 3, 10_000);
    }
    expect(checkRateLimit("test-key-2", 3, 10_000)).toBe(false);
    expect(checkRateLimit("test-key-2", 3, 10_000)).toBe(false);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    try {
      checkRateLimit("test-key-3", 2, 1000);
      checkRateLimit("test-key-3", 2, 1000);
      expect(checkRateLimit("test-key-3", 2, 1000)).toBe(false);

      vi.advanceTimersByTime(1001);
      expect(checkRateLimit("test-key-3", 2, 1000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks separate keys independently", () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit("key-a", 3, 10_000);
    }
    expect(checkRateLimit("key-a", 3, 10_000)).toBe(false);
    // Different key should still be allowed
    expect(checkRateLimit("key-b", 3, 10_000)).toBe(true);
  });
});

/* ────────────────────────── withRateLimit ────────────────────────── */

describe("withRateLimit", () => {
  it("passes through function result when allowed", async () => {
    const fn = vi.fn(async (x: number) => x * 2);
    const limited = withRateLimit(fn, "wrl-pass", 5, 10_000);
    const result = await limited(21);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledWith(21);
  });

  it("calls onLimited and rejects when blocked", async () => {
    const fn = vi.fn(async () => "ok");
    const onLimited = vi.fn();
    const limited = withRateLimit(fn, "wrl-block", 1, 10_000, onLimited);

    // First call succeeds
    await limited();
    // Second call should be blocked
    await expect(limited()).rejects.toThrow(/Rate limited/);
    expect(onLimited).toHaveBeenCalledTimes(1);
    // Original function should only be called once
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

/* ────────────────────────── debounce ────────────────────────── */

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("only calls after delay", async () => {
    const fn = vi.fn(() => "result");
    const debounced = debounce(fn, 200);

    const promise = debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(promise).resolves.toBe("result");
  });

  it("resets timer on subsequent calls", async () => {
    const fn = vi.fn(() => "last");
    const debounced = debounce(fn, 100);

    debounced(); // first call
    vi.advanceTimersByTime(50);
    const promise = debounced(); // second call resets timer
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled(); // not yet — timer reset
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(promise).resolves.toBe("last");
  });

  it("cancel prevents execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});
