/** NO-TIMEOUT defaults contract — waits forever unless explicitly overridden. */

import { test } from "node:test";
import assert from "node:assert/strict";

// Config reads env at module load — scrub ASR_* first, then import fresh.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("ASR_")) delete process.env[key];
}

const { PERF, httpTimeout } = await import("../src/core/config.js");

test("default timeouts are null", () => {
  assert.equal(PERF.JY_CONNECT_TO, null);
  assert.equal(PERF.JY_POLL_READ_TO, null);
  assert.equal(PERF.JY_LONG_READ_TO, null);
  assert.equal(PERF.JY_UPLOAD_READ_TO, null);
  assert.equal(PERF.JY_POLL_MAX_ATTEMPTS, 0);
});

test("httpTimeout null means wait forever", () => {
  assert.equal(httpTimeout(null, null), null);
  assert.deepEqual(httpTimeout(null, 5.0), [null, 5.0]);
  assert.equal(PERF.jyTimeout("poll"), null);
  assert.equal(PERF.jyTimeout("upload"), null);
});
