/** Integration: disk-streaming uploads through the real HTTP stack (local server). */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const { Session } = await import("../src/decode/http-pool.js");
const { crc32FileHex, crc32Hex } = await import("../src/decode/crc32-fast.js");

test("stream body factory uploads exact bytes with Content-Length", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-stream-"));
  const filePath = path.join(dir, "audio.bin");
  const payload = Buffer.from(Array.from({ length: 300_000 }, (_, i) => i & 0xff));
  fs.writeFileSync(filePath, payload);

  const received = [];
  let reportedLength = null;
  const server = http.createServer((req, res) => {
    reportedLength = req.headers["content-length"];
    req.on("data", (c) => received.push(c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: 0 }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const size = fs.statSync(filePath).size;
    assert.equal(size, payload.length);
    const session = new Session(2);
    const response = await session.put(`http://127.0.0.1:${port}/upload`, {
      body: () => fs.createReadStream(filePath),
      contentLength: size,
    });
    assert.equal(response.status, 200);
    assert.equal(Number(reportedLength), payload.length);
    const body = Buffer.concat(received);
    assert.equal(body.length, payload.length);
    // Byte-exact round trip + CRC parity between buffered and streamed hashing.
    assert.equal(crc32Hex(body), crc32FileHex(filePath));
    session.close();
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("stream retry opens a fresh readable per attempt", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-retry-"));
  const filePath = path.join(dir, "audio.bin");
  fs.writeFileSync(filePath, Buffer.from("hello-stream"));

  let attempts = 0;
  let firstPort = null;
  const server = http.createServer((req, res) => {
    attempts += 1;
    if (attempts === 1) {
      // Kill the connection before responding → connect-phase style failure.
      req.destroy();
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      firstPort = Buffer.concat(chunks).toString("utf8");
      res.writeHead(200);
      res.end("{}");
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const size = fs.statSync(filePath).size;
    const session = new Session(1);
    const response = await session.put(`http://127.0.0.1:${port}/upload`, {
      body: () => fs.createReadStream(filePath),
      contentLength: size,
    });
    assert.equal(response.status, 200);
    assert.equal(attempts, 2);
    assert.equal(firstPort, "hello-stream"); // second attempt re-sent full body
    session.close();
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
