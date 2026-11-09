/** Cooperative cancellation — lean, immediate, no dead weight.
 * Single-shot by default; call reset() to reuse the token for a new run.
 * Use bind(AbortSignal) to bridge DOM/Node abort signals into the token.
 */

import { CancelledError } from "./errors.js";

export class CancelToken {
  #cancelled = false;
  #listeners = new Set();

  cancel() {
    if (this.#cancelled) return;
    this.#cancelled = true;
    const fns = [...this.#listeners];
    this.#listeners.clear();
    for (const fn of fns) {
      try {
        fn();
      } catch {
        /* listener errors must never break cancellation */
      }
    }
  }

  /** Re-arm a cancelled token for the next run (single-use unless reset). */
  reset() {
    this.#cancelled = false;
    this.#listeners.clear();
  }

  /**
   * Register a callback invoked immediately when cancel() is triggered.
   * @param {() => void} fn
   * @returns {() => void} unsubscribe function
   */
  onCancel(fn) {
    if (typeof fn !== "function") return () => {};
    if (this.#cancelled) {
      try {
        fn();
      } catch {
        /* ignore */
      }
      return () => {};
    }
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
    };
  }

  /**
   * Bridge an AbortSignal into this token. Aborts immediately if already aborted.
   * @returns {() => void} unbind function
   */
  bind(signal) {
    if (!signal || typeof signal.addEventListener !== "function") {
      if (signal?.aborted) this.cancel();
      return () => {};
    }
    if (signal.aborted) {
      this.cancel();
      return () => {};
    }
    const onAbort = () => this.cancel();
    signal.addEventListener("abort", onAbort, { once: true });
    return () => {
      try {
        signal.removeEventListener("abort", onAbort);
      } catch {
        /* ignore */
      }
    };
  }

  get cancelled() {
    return this.#cancelled;
  }

  /** Throws immediately when cancelled — call at every loop iteration. */
  check() {
    if (this.#cancelled) throw new CancelledError("Đã hủy theo yêu cầu");
  }
}
