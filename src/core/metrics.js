/** Lightweight metrics registry (single-threaded event loop — no locks needed).
 * Overflow-guarded: counters/timers clamp at Number.MAX_SAFE_INTEGER.
 * reset() is test-only — production runs must use a scoped fork() or
 * snapshot-delta so concurrent runs never wipe each other's counters.
 */

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export class MetricsRegistry {
  #counters = new Map();
  #timersMs = new Map();

  incr(name, n = 1) {
    if (!Number.isFinite(n) || n === 0) return;
    const next = (this.#counters.get(name) ?? 0) + n;
    this.#counters.set(name, Number.isFinite(next) ? Math.min(next, MAX_SAFE) : MAX_SAFE);
  }

  addTimeMs(name, ms) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const next = (this.#timersMs.get(name) ?? 0) + ms;
    this.#timersMs.set(name, Number.isFinite(next) ? Math.min(next, MAX_SAFE) : MAX_SAFE);
  }

  /** Times an async fn and records elapsed ms under `name`. */
  async time(name, fn) {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.addTimeMs(name, performance.now() - t0);
    }
  }

  /** Test-only full clear. Production code: prefer fork() / snapshotDelta(). */
  reset() {
    this.#counters.clear();
    this.#timersMs.clear();
  }

  /** Scoped per-run registry seeded from this one (no shared mutation). */
  fork() {
    const child = new MetricsRegistry();
    for (const [k, v] of this.#counters) child.#counters.set(k, v);
    for (const [k, v] of this.#timersMs) child.#timersMs.set(k, v);
    return child;
  }

  snapshot() {
    return {
      counters: Object.fromEntries(this.#counters),
      timers_ms: Object.fromEntries(this.#timersMs),
    };
  }

  /** Per-run delta between a baseline snapshot and the current state. */
  snapshotDelta(baseline) {
    const baseC = baseline?.counters ?? {};
    const baseT = baseline?.timers_ms ?? {};
    const counters = {};
    for (const [k, v] of this.#counters) counters[k] = v - (baseC[k] ?? 0);
    const timers_ms = {};
    for (const [k, v] of this.#timersMs) timers_ms[k] = v - (baseT[k] ?? 0);
    return { counters, timers_ms };
  }
}

export const METRICS = new MetricsRegistry();
