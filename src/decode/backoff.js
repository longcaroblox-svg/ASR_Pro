/** Full-jitter backoff — anti-stall without busy-wait. */

import { PERF } from "../core/config.js";
import { sleep, monotonicS } from "../util/time.js";

/**
 * Sleeps a full-jitter exponential delay and returns the delay in seconds.
 * attempt: number of failed attempts so far (caps exponent at 12).
 */
export async function fullJitterSleep(
  attempt,
  { baseS = null, capS = null, processing = true, rng = Math.random, deadline = null } = {},
) {
  const rawBase =
    baseS !== null && baseS !== undefined
      ? baseS
      : processing
        ? PERF.JY_POLL_MIN_S
        : PERF.JY_POLL_MAX_S * 0.7;
  const cap = capS !== null && capS !== undefined ? capS : PERF.JY_POLL_MAX_S;
  // Clamp: base > cap would make (exp - base) negative and invert the jitter range.
  const base = Math.min(rawBase, cap);
  const rand = typeof rng === "function" ? rng : Math.random;
  const exp = Math.min(cap, base * 1.35 ** Math.min(attempt, 12));
  const r = Math.min(1, Math.max(0, rand()));
  let delay = base + r * (exp - base);
  // Deadline wiring: fail fast when expired, else never sleep past the budget.
  if (deadline !== null && deadline !== undefined) {
    try {
      if (typeof deadline.expired === "function" && deadline.expired()) {
        throw new Error("deadline exceeded");
      }
      if (typeof deadline.remaining === "number" && Number.isFinite(deadline.remaining)) {
        delay = Math.min(delay, Math.max(0, deadline.remaining));
      }
    } catch (exc) {
      if (exc instanceof Error && exc.message === "deadline exceeded") throw exc;
      /* malformed deadline object — ignore and sleep normally */
    }
  }
  await sleep(delay * 1000);
  return delay;
}

export class Deadline {
  #timeoutS;
  #startS;

  constructor(timeoutS) {
    this.#timeoutS = timeoutS;
    this.#startS = monotonicS();
  }

  get remaining() {
    return this.#timeoutS - (monotonicS() - this.#startS);
  }

  expired() {
    return this.remaining <= 0;
  }
}
