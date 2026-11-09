/** Token-bucket rate governor. */

import { PERF } from "../core/config.js";
import { sleep } from "../util/time.js";

export class TokenBucket {
  #rate;
  #capacity;
  #tokens;
  #updatedMs;

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
    this.#tokens = this.#capacity;
    this.#updatedMs = performance.now();
  }

  /** Reserves cost tokens (default 1); resolves false when the timeout elapses first. */
  async acquire(timeoutS = 30.0, cost = 1) {
    if (!Number.isFinite(cost) || !(cost > 0)) {
      throw new TypeError("TokenBucket acquire cost must be > 0, got " + JSON.stringify(cost));
    }
    if (cost > this.#capacity) {
      throw new RangeError("TokenBucket cost " + cost + " exceeds capacity " + this.#capacity);
    }
    const deadlineMs = timeoutS === null ? null : performance.now() + timeoutS * 1000;
    for (;;) {
      const nowMs = performance.now();
      const elapsedS = (nowMs - this.#updatedMs) / 1000;
      this.#updatedMs = nowMs;
      this.#tokens = Math.min(this.#capacity, this.#tokens + elapsedS * this.#rate);
      if (this.#tokens >= cost) {
        this.#tokens -= cost;
        return true;
      }
      const needS = (cost - this.#tokens) / this.#rate;
      if (deadlineMs !== null && performance.now() + needS * 1000 > deadlineMs) {
        return false;
      }
      await sleep(Math.min(50, Math.max(1, needS * 1000)));
    }
  }
}
