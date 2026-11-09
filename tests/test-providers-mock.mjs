/** Provider flow contracts against mock sessions (protocol fidelity, JianYing-only). */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { jianying } = await import("../src/decode/jianying.js");
const { PERF } = await import("../src/core/config.js");

function makeAudioFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-mock-"));
  const filePath = path.join(dir, "audio.mp3");
  fs.writeFileSync(filePath, Buffer.from("abc"));
  return { dir, filePath };
}

function response(payload, headers = {}, status = 200) {
  const body = JSON.stringify(payload);
  return {
    status,
    ok: status < 400,
    headers,
    header(name) {
      const value = headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    },
    text: () => body,
    json: () => JSON.parse(body),
  };
}

class JianYingSession {
  constructor() {
    this.submitBodies = [];
  }
  async request(method, url, opts = {}) {
    return this.#dispatch(method, url, opts);
  }
  async post(url, opts = {}) {
    return this.#dispatch("POST", url, opts);
  }
  async get(url) {
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
  #dispatch(method, url, opts = {}) {
    if (url.endsWith("/upload_sign")) {
      assert.equal(opts.body, JSON.stringify({ biz: "pc-recognition" }));
      return Promise.resolve(
        response({ ret: "0", data: { access_key_id: "a", secret_access_key: "s", session_token: "t" } }),
      );
    }
    if (url.endsWith("/audio_subtitle/submit")) {
      const payload = JSON.parse(opts.body);
      this.submitBodies.push(payload);
      assert.equal(payload.songs_info[0].end_time, 12345);
      assert.equal(payload.caption_type, PERF.JY_CAPTION_TYPE);
      assert.equal(payload.words_per_line, PERF.JY_WORDS_PER_LINE);
      assert.equal(opts.headers.appvr, "10.9.0");
      return Promise.resolve(response({ ret: "0", data: { id: "task" } }));
    }
    if (url.endsWith("/audio_subtitle/query")) {
      return Promise.resolve(
        response({ ret: "0", data: { utterances: [{ text: "Xin chào", start_time: 0, end_time: 1000 }] } }),
      );
    }
    if (url.includes("uploadID=")) return Promise.resolve(response({ success: 0 }));
    return Promise.reject(new Error(`unexpected ${method} ${url}`));
  }
}

const noop = () => {};
const noSleep = async () => 0;

test("jianying payload contract", async () => {
  const { dir, filePath } = makeAudioFile();
  try {
    const session = new JianYingSession();
    const rows = await jianying(filePath, 12345, noop, { session, sleepFn: noSleep });
    assert.deepEqual(rows, [{ startMs: 0, endMs: 1000, text: "Xin chào", words: null }]);
    assert.equal(session.submitBodies.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("jianying extracts server word timeline when present", async () => {
  const { dir, filePath } = makeAudioFile();
  try {
    const session = new JianYingSession();
    // Wrap the public post() to enrich the query response with server words.
    const originalPost = session.post.bind(session);
    session.post = async (url, opts) => {
      if (url.endsWith("/audio_subtitle/query")) {
        return {
          status: 200,
          ok: true,
          headers: {},
          header: () => undefined,
          text: () =>
            JSON.stringify({
              ret: "0",
              data: {
                utterances: [
                  {
                    text: "Xin chào",
                    start_time: 0,
                    end_time: 1000,
                    words: [
                      { text: "Xin", start_time: 0, end_time: 400 },
                      { text: "chào", start_time: 400, end_time: 1000 },
                    ],
                  },
                ],
              },
            }),
          json: () =>
            JSON.parse(
              JSON.stringify({
                ret: "0",
                data: {
                  utterances: [
                    {
                      text: "Xin chào",
                      start_time: 0,
                      end_time: 1000,
                      words: [
                        { text: "Xin", start_time: 0, end_time: 400 },
                        { text: "chào", start_time: 400, end_time: 1000 },
                      ],
                    },
                  ],
                },
              }),
            ),
        };
      }
      return originalPost(url, opts);
    };
    const rows = await jianying(filePath, 12345, noop, { session, sleepFn: noSleep });
    assert.deepEqual(rows[0].words, [
      { startMs: 0, endMs: 400, text: "Xin" },
      { startMs: 400, endMs: 1000, text: "chào" },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
