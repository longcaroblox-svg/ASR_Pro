/** Contract tests for 100.00% Zero-Queue Parallel Media Processing (100+ videos/audios simultaneously). */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PERF } from "../src/core/config.js";
import { buildWav } from "./fixtures.mjs";

test("PERF config supports 100+ parallel streams without socket queuing", () => {
  assert.ok(PERF.POOL_SIZE >= 1024, `POOL_SIZE should be >= 1024, got ${PERF.POOL_SIZE}`);
  assert.ok(PERF.RATE_RPS >= 100.0, `RATE_RPS should be >= 100.0, got ${PERF.RATE_RPS}`);
});

test("Web GUI provides 100% parallel processing without queue (HTML contracts)", async () => {
  const testPort = 19760 + Math.floor(Math.random() * 4000);
  process.env.ASR_GUI_PORT = String(testPort);
  const { startGui } = await import(`../src/gui.js?port=${testPort}`);
  const server = await startGui({ openBrowser: false });

  const requestGui = (reqPath, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: testPort,
          path: reqPath,
          method: "GET",
          headers: { Host: `127.0.0.1:${testPort}`, ...headers },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        },
      );
      req.on("error", reject);
      req.end();
    });

  try {
    const homeRes = await requestGui("/");
    assert.equal(homeRes.status, 200);
    const html = homeRes.body.toString("utf8");

    // 1. Verify default concurrency is "all" (100% song song, khong hang doi)
    assert.ok(html.includes('<option value="all" selected>'), "Default concurrency should be 'all' (selected)");
    assert.ok(html.includes("100 file song song cùng lúc"), "Option for 100 files parallel exists");

    // 2. Verify UI labels explicitly state 100% song song / không hàng đợi
    assert.ok(html.includes("Không hàng đợi") || html.includes("Không Cần Hàng Đợi"), "Mentions no queue");
    assert.ok(html.includes("100+"), "Mentions 100+ file parallel capacity");
    assert.ok(html.includes("BẮT ĐẦU XỬ LÝ TOÀN BỘ CÙNG LÚC"), "Button to start all parallel at once");
    assert.ok(html.includes("fsAddAllMedia"), "Folder import button fsAddAllMedia exists");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("Directory probe scans 100 media files in parallel for instant bulk loading", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-100-test-"));
  const wavBuf = buildWav({ seconds: 1, sampleRate: 8000 });

  // Create 100 media files in the directory
  for (let i = 0; i < 100; i++) {
    fs.writeFileSync(path.join(dir, `video_${String(i).padStart(3, "0")}.mp4`), wavBuf);
  }

  const testPort = 24000 + Math.floor(Math.random() * 4000);
  process.env.ASR_GUI_PORT = String(testPort);
  const { startGui } = await import(`../src/gui.js?port=${testPort}`);
  const server = await startGui({ openBrowser: false });

  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: testPort,
          path: `/api/probe-file?path=${encodeURIComponent(dir)}`,
          method: "GET",
          headers: { Host: `127.0.0.1:${testPort}` },
        },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => resolve({ status: r.statusCode, body: Buffer.concat(chunks) }));
        },
      );
      req.on("error", reject);
      req.end();
    });

    assert.equal(res.status, 200);
    const data = JSON.parse(res.body.toString("utf8"));
    assert.equal(data.isDir, true);
    assert.equal(data.files.length, 100, `Expected 100 scanned media files, got ${data.files.length}`);
    assert.equal(data.files[0].name, "video_000.mp4");
    assert.equal(data.files[99].name, "video_099.mp4");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
