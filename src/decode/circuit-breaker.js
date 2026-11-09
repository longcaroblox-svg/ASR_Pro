/** Circuit breaker — ignore retryable/transient provider blips. */

import { PERF } from "../core/config.js";
import { CancelledError, CircuitOpenError, ProviderError } from "../core/errors.js";
import { METRICS } from "../core/metrics.js";

export class CircuitBreaker {
  #name;
  #failureThreshold;
  #resetTimeoutS;
  #fails = 0;
  #openedAtS = 0.0;
  #state = "closed";
  #probing = false;
  #hooks = null;

  constructor(name, failureThreshold = null, resetTimeoutS = null, hooks = null) {
    this.#name = name;
    this.#failureThreshold = failureThreshold ?? PERF.CIRCUIT_FAILS;
    this.#resetTimeoutS = resetTimeoutS ?? PERF.CIRCUIT_RESET_S;
    this.#hooks = hooks ?? null;
  }

  get name() {
    return this.#name;
  }

  get state() {
    return this.#state;
  }

  #emit(state) {
    try {
      this.#hooks?.onState?.(state, this.#name);
    } catch {
      /* hooks must never break the breaker */
    }
    try {
      METRICS.incr(`circuit_${state}_${this.#name}`);
    } catch {
      /* metrics best-effort */
    }
  }

  #before(nowS) {
    if (this.#state === "open") {
      if (nowS - this.#openedAtS >= this.#resetTimeoutS) {
        this.#state = "half_open";
        this.#emit("half_open");
      } else {
        throw new CircuitOpenError(`Circuit open: ${this.#name}`);
      }
    }
    // Single-flight half-open probe: only one caller tests recovery.
    if (this.#state === "half_open") {
      if (this.#probing) {
        throw new CircuitOpenError(`Circuit half-open probe in flight: ${this.#name}`);
      }
      this.#probing = true;
    }
  }

  #onSuccess() {
    this.#fails = 0;
    this.#probing = false;
    if (this.#state !== "closed") this.#emit("closed");
    this.#state = "closed";
  }

  // Retryable provider errors (timeouts after internal poll exhausted, 429)
  // should not instantly hard-open the circuit for ORIGINAL jobs.
  // Cancellation is cooperative, never a provider failure — it must not trip
  // the breaker for the next run reusing this instance.
  #onFailure(exc, nowS) {
    // User cancels and nested-breaker rejections are not downstream failures.
    if (exc instanceof CancelledError || exc instanceof CircuitOpenError) {
      if (this.#state === "half_open") this.#probing = false;
      return;
    }
    if (exc instanceof ProviderError && exc.retryable) {
      if (this.#state === "half_open") this.#probing = false;
      return;
    }
    this.#fails += 1;
    if (this.#fails >= this.#failureThreshold || this.#state === "half_open") {
      this.#state = "open";
      this.#openedAtS = nowS;
      this.#probing = false;
      this.#emit("open");
    } else if (this.#state === "half_open") {
      this.#probing = false;
    }
  }

  async call(fn) {
    this.#before(performance.now() / 1000);
    try {
      const result = await fn();
      this.#onSuccess();
      return result;
    } catch (exc) {
      this.#onFailure(exc, performance.now() / 1000);
      throw exc;
    }
  }
}
