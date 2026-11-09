/** Cancel-aware completion queue — yields [item, resultOrError] as finished.
 * Every submitted job is yielded EXACTLY once, regardless of settlement timing:
 * - settled entries go to a FIFO consumed by the generator (never dropped);
 * - the concurrency gauge is an explicit inFlight counter released on CONSUME,
 *   never a Set size that lags behind microtask cleanup.
 * Error identity is preserved via `"error" in settled` (never `??`), so a
 * success value of `null`/`undefined` is never confused with a failure, and
 * non-Error rejections are wrapped into Error for the `instanceof` consumer. */

export async function* mapAsCompleted(fn, items, { maxWorkers, token = null } = {}) {
  if (!Number.isFinite(maxWorkers) || maxWorkers < 1) {
    throw new TypeError(`maxWorkers phải là số hữu hạn >= 1, nhận: ${maxWorkers}`);
  }
  const list = [...items];
  if (list.length === 0) return;
  const workers = Math.max(1, Math.min(Math.trunc(maxWorkers), list.length));

  const settledQ = [];
  let wake = () => {};
  let next = 0;
  let inFlight = 0;
  let abandoned = false;

  const launch = () => {
    if (abandoned) return;
    if (next >= list.length || inFlight >= workers) return;
    const item = list[next++];
    inFlight += 1;
    Promise.resolve()
      .then(() => fn(item))
      .then(
        (result) => {
          if (abandoned) return;
          settledQ.push({ item, result });
          wake();
        },
        (error) => {
          if (abandoned) return;
          const err = error instanceof Error ? error : new Error(String(error ?? "unknown error"));
          settledQ.push({ item, error: err });
          wake();
        },
      );
  };

  for (let i = 0; i < workers; i++) launch();

  // Cancel-aware idle: subscribe to CancelToken.onCancel for 0ms wakeup when
  // available, while keeping a 50ms fallback timer for custom token mocks.
  const idleWithCancel = () =>
    new Promise((resolve, reject) => {
      let timer = null;
      let unsub = () => {};
      const cleanup = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          unsub();
        } catch {
          /* ignore */
        }
        wake = () => {};
      };
      const done = () => {
        cleanup();
        resolve();
      };
      wake = done;
      if (token && typeof token.onCancel === "function") {
        unsub = token.onCancel(() => {
          cleanup();
          try {
            token.check();
            resolve();
          } catch (exc) {
            reject(exc);
          }
        });
      }
      timer = setTimeout(() => {
        cleanup();
        try {
          token?.check();
        } catch (exc) {
          reject(exc);
          return;
        }
        resolve();
      }, 50);
    });

  try {
    while (settledQ.length > 0 || inFlight > 0) {
      while (settledQ.length === 0 && inFlight > 0) {
        await idleWithCancel();
        token?.check();
      }
      token?.check();
      const settled = settledQ.shift();
      if (!settled) continue;
      inFlight -= 1;
      launch();
      yield [settled.item, "error" in settled ? settled.error : settled.result];
    }
  } finally {
    // Consumer abandon (break/throw/return, e.g. orchestrator aborting on the
    // first chunk error): stop launching, drop buffered settlements so late
    // in-flight completions cannot orphan entries in a queue nobody drains.
    abandoned = true;
    settledQ.length = 0;
    wake = () => {};
  }
}
