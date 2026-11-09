/** Read-timeout during Jianying query must NOT kill the job — poll continues. */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { jianying } = await import("../src/decode/jianying.js");
const { ReadTimeoutError } = await import("../src/decode/http-pool.js");

function response(payload, status = 200) {
  const body = JSON.stringify(payload);
  return {
    status,
    ok: status < 400,
    headers: {},
    header: () => undefined,
    text: () => body,
    json: () => JSON.parse(body),
  };
}

class FlakyQuerySession {
  constructor() {
    this.queryCalls = 0;
  }
  async request(method, url, opts = {}) {
    return this.#dispatch(url, opts);
  }
  async post(url, opts = {}) {
    return this.#dispatch(url, opts);
  }
  async get() {
    return response({
      Result: {
        UploadAddress: {
          StoreInfos: [{ StoreUri: "uri", Auth: "auth", UploadID: "up" }],
          UploadHosts: ["host.example"],
        },
      },
    });
  }
  async put() {
    return response({ success: 0 });
  }
  #dispatch(url, opts = {}) {
    if (url.endsWith("/upload_sign")) {
      return Promise.resolve(
        response({ ret: "0", data: { access_key_id: "a", secret_access_key: "s", session_token: "t" } }),
      );
    }
    if (url.endsWith("/audio_subtitle/submit")) {
      return Promise.resolve(response({ ret: "0", data: { id: "task-1" } }));
    }
    if (url.endsWith("/audio_subtitle/query")) {
      this.queryCalls += 1;
      if (this.queryCalls <= 2) return Promise.reject(new ReadTimeoutError("read timeout=8.0"));
      return Promise.resolve(
        response({ ret: "0", data: { utterances: [{ text: "ok", start_time: 0, end_time: 1000 }] } }),
      );
    }
    if (url.includes("uploadID=")) return Promise.resolve(response({ success: 0 }));
    return Promise.reject(new Error(`unexpected ${url}`));
  }
}

test("jianying survives query read timeout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-poll-"));
  const audioPath = path.join(dir, "a.mp3");
  fs.writeFileSync(audioPath, Buffer.from("abc"));
  try {
    const session = new FlakyQuerySession();
    const rows = await jianying(audioPath, 5000, () => {}, {
      session,
      sleepFn: async () => 0,
    });
    assert.deepEqual(rows, [{ startMs: 0, endMs: 1000, text: "ok", words: null }]);
    assert.ok(session.queryCalls >= 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
