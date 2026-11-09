/** Generic Cell Rate Algorithm (GCRA) Virtual-Time Scheduler (TokenBucket compatible).
 * Replaces polling sleep loops with O(1) exact Theoretical Arrival Time (TAT) reservation,
 * eliminating thundering-herd wakeups across concurrent workers. */

import { PERF } from "../core/config.js";
import { sleep } from "../util/time.js";

export class TokenBucket {
  #rate;
  #capacity;
  #emissionIntervalMs;
  #tatMs;

  constructor(rateRps = null, capacity = null) {
    const rate = rateRps ?? PERF.RATE_RPS;
    if (!Number.isFinite(rate) || !(rate > 0)) {
      throw new TypeError("TokenBucket rate must be > 0, got " + JSON.stringify(rateRps));
    }
    const cap = capacity ?? Math.max(1.0, rate);
    if (!Number.isFinite(cap) || !(cap > 0)) {
      throw new TypeError("TokenBucket capacity must be > 0, got " + JSON.stringify(capacity));
    }
    this.#rate = rate;
    this.#capacity = cap;
    this.#emissionIntervalMs = 1000 / rate;
    this.#tatMs = performance.now() - this.#capacity * this.#emissionIntervalMs;
  }

  get rate() {
    return this.#rate;
  }

  get capacity() {
    return this.#capacity;
  }

  reset() {
    this.#tatMs = performance.now() - this.#capacity * this.#emissionIntervalMs;
  }

  async acquire(timeoutS = 30.0, cost = 1) {
    if (!Number.isFinite(cost) || !(cost > 0)) {
      throw new TypeError("TokenBucket acquire cost must be > 0, got " + JSON.stringify(cost));
    }
    if (cost > this.#capacity) {
      throw new RangeError("TokenBucket cost " + cost + " exceeds capacity " + this.#capacity);
    }
    const nowMs = performance.now();
    const burstToleranceMs = this.#capacity * this.#emissionIntervalMs;
    const incrementMs = cost * this.#emissionIntervalMs;
    const minTat = nowMs - burstToleranceMs;
    const baseTat = Math.max(this.#tatMs, minTat);
    const nextTat = baseTat + incrementMs;
    const waitMs = nextTat - nowMs;

    if (waitMs <= 0) {
      this.#tatMs = nextTat;
      return true;
    }
    if (timeoutS !== null && waitMs > timeoutS * 1000) {
      return false;
    }
    this.#tatMs = nextTat;
    await sleep(waitMs);
    return true;
  }
}
