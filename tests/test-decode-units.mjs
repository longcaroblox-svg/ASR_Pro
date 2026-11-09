/** Decode unit contracts: crc32, tdid/sign, aws4, parsers, breaker, deadline. */

import { test } from "node:test";
import assert from "node:assert/strict";

const { crc32Hex } = await import("../src/decode/crc32-fast.js");
const { tdid, jyHeaders } = await import("../src/decode/jy-sign.js");
const { aws4VodSignature, buildApplyUploadQuery } = await import("../src/decode/aws4.js");
const { parseJianyingUtterances } = await import("../src/decode/result-parser.js");
const { CircuitBreaker } = await import("../src/decode/circuit-breaker.js");
const { Deadline } = await import("../src/decode/backoff.js");
const { CircuitOpenError } = await import("../src/core/errors.js");

test("crc32 known vector", () => {
  // zlib.crc32(b"abc") == 0x352441c2
  assert.equal(crc32Hex(Buffer.from("abc")), "352441c2");
  assert.equal(crc32Hex(Buffer.alloc(0)), "00000000");
});

test("tdid and headers", () => {
  const device = tdid();
  assert.ok(device.startsWith("39"));
  const h = jyHeaders("/lv/v1/upload_sign", device, "10.9.0");
  assert.equal(h.appvr, "10.9.0");
  assert.equal(h.sign.length, 32);
});

test("aws4 stable shape", () => {
  const q = buildApplyUploadQuery(12);
  assert.ok(q.includes("ApplyUploadInner"));
  const sig = aws4VodSignature("secret", q, {
    "x-amz-date": "20260101T000000Z",
    "x-amz-security-token": "tok",
  });
  assert.equal(sig.length, 64);
});

test("parsers", () => {
  const rows = parseJianyingUtterances({ utterances: [{ start_time: 1, end_time: 2, text: "b" }] });
  assert.deepEqual(rows, [{ startMs: 1, endMs: 2, text: "b", words: null }]);
});

test("circuit opens after threshold", async () => {
  const br = new CircuitBreaker("t", 2, 60);
  const boom = () => {
    throw new Error("x");
  };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(() => br.call(boom), Error);
  }
  await assert.rejects(() => br.call(async () => 1), CircuitOpenError);
});

test("deadline expires", async () => {
  const d = new Deadline(0.01);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(d.expired());
});
