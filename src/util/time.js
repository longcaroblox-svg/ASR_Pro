/** Time helpers — monotonic clock + sleep. */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Monotonic seconds (like Python time.monotonic()). */
export function monotonicS() {
  return performance.now() / 1000;
}
