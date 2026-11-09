/** Jianying decoder — no artificial HTTP/poll kill-switch. Wait until server done.
 * Uploads stream straight from disk (zero whole-file RAM spike, even 10h ORIGINAL). */

import crypto from "node:crypto";
import fs from "node:fs";
import { PERF } from "../core/config.js";
import { ProviderError } from "../core/errors.js";
import { METRICS } from "../core/metrics.js";
import {
  buildApplyUploadAuthHeaders,
  buildApplyUploadQuery,
} from "./aws4.js";
import { fullJitterSleep } from "./backoff.js";
import { crc32FileHex } from "./crc32-fast.js";
import { NetworkError, getSession } from "./http-pool.js";
import { jyHeaders, tdid } from "./jy-sign.js";
import { parseJianyingUtterances } from "./result-parser.js";

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function ensureJson(response, label) {
  if (response.status >= 400) {
    const text = response.text();
    throw new ProviderError(`HTTP ${response.status}: ${text.slice(0, 500)}`, {
      provider: "JianYing",
      phase: label,
      detail: text.slice(0, 500),
      retryable: RETRYABLE_STATUSES.has(response.status),
    });
  }
  let payload;
  try {
    payload = response.json();
  } catch (cause) {
    // 200-HTML (WAF/login wall) masquerading as success: cap retries by marking
    // non-retryable so callers fail fast instead of polling forever.
    let snippet = "";
    try {
      snippet = String(response.text()).slice(0, 120);
    } catch {
      /* keep snippet empty */
    }
    const looksHtml = /^\s*<(?:!doctype|html)/i.test(snippet);
    throw new ProviderError("phản hồi không phải JSON (" + label + "): " + snippet, {
      provider: "JianYing",
      phase: label,
      detail: snippet.slice(0, 500),
      retryable: !looksHtml,
      cause,
    });
  }
  return payload;
}

async function postJson(
  session,
  url,
  { headers, timeout, label, jsonBody = null, data = null, token = null },
) {
  const body = jsonBody !== null ? JSON.stringify(jsonBody) : data;
  const reqOpts = token ? { headers, timeout, body, token } : { headers, timeout, body };
  const response = await session.request("POST", url, reqOpts);
  return ensureJson(response, label);
}

/**
 * Full Jianying flow. Polls until utterances exist (or process killed/cancelled upstream).
 * @param {string} path audio file to upload (streamed straight from disk)
 * @param {{appVersion?:string, session?:object, sleepFn?:Function, token?:object,
 *          crcHex?:string}} opts
 *   crcHex: precomputed CRC32 of the file (fused at cut time) — skips re-read.
 * @returns {Promise<Array<{startMs:number,endMs:number,text:string}>>}
 */
export async function jianying(
  path,
  durationMs,
  progress,
  { appVersion = null, session = null, sleepFn = fullJitterSleep, token = null, crcHex = null, audioSize = null } = {},
) {
  const filePath = String(path);
  // Size known by the cutter (chunk.bytes) — skip the redundant statSync.
  // Falls back to stat only for direct callers (probe/tests) that omit it.
  const size = Number.isInteger(audioSize) && audioSize > 0 ? audioSize : fs.statSync(filePath).size;
  const audioSizeRes = size;
  const crc = crcHex ?? crc32FileHex(filePath);
  // 1MB pipe: 16× fewer event-loop turns vs 64KB default; 8 workers × 1MB fits 3GB RAM.
  const openAudio = () => fs.createReadStream(filePath, { highWaterMark: PERF.UPLOAD_HWM_BYTES });
  const sess = session ?? getSession();
  const device = tdid();
  const version = appVersion ?? PERF.JY_APPVR;
  const base = PERF.JY_BASE;
  const toLong = PERF.jyTimeout("long");
  const toPoll = PERF.jyTimeout("poll");
  const toUpload = PERF.jyTimeout("upload");
  const checkpoint = () => token?.check();

  let sign;
  await METRICS.time("jy_upload_sign_ms", async () => {
    progress(20, "JianYing · xin credential…");
    const endpoint = "/lv/v1/upload_sign";
    for (;;) {
      checkpoint();
      try {
        sign = await postJson(sess, base + endpoint, {
          headers: jyHeaders(endpoint, device, version),
          timeout: toLong,
          label: "upload_sign",
          data: JSON.stringify({ biz: "pc-recognition" }),
          token,
        });
        return;
      } catch (exc) {
        if (exc instanceof ProviderError && exc.retryable) {
          progress(20, "JianYing · credential server bận, thử lại…");
          await sleepFn(1, { processing: false });
          continue;
        }
        if (!(exc instanceof NetworkError)) throw exc;
        progress(20, `JianYing · credential mạng lag, thử lại… (${exc.name})`);
        await sleepFn(1, { processing: false });
      }
    }
  });

  if (String(sign.ret) !== "0") {
    throw new ProviderError(`upload_sign: ${JSON.stringify(sign)}`, {
      provider: "JianYing",
      phase: "upload_sign",
      detail: sign,
      retryable: true,
    });
  }
  const signData = sign.data ?? {};
  const access = signData.access_key_id;
  const secret = signData.secret_access_key;
  const sessionToken = signData.session_token;
  if (!access || !secret || !sessionToken) {
    throw new ProviderError("thiếu upload credential", {
      provider: "JianYing",
      phase: "upload_sign",
    });
  }

  let auth;
  await METRICS.time("jy_apply_upload_ms", async () => {
    const query = buildApplyUploadQuery(audioSizeRes);
    const authHeaders = buildApplyUploadAuthHeaders(String(access), String(secret), String(sessionToken), query);
    const authUrl = "https://vod.bytedanceapi.com/?" + query;
    for (;;) {
      checkpoint();
      try {
        auth = ensureJson(
          await sess.get(authUrl, token ? { headers: authHeaders, timeout: toLong, token } : { headers: authHeaders, timeout: toLong }),
          "upload_auth",
        );
        return;
      } catch (exc) {
        if (exc instanceof ProviderError && exc.retryable) {
          progress(30, "JianYing · auth server bận, thử lại…");
          await sleepFn(1, { processing: false });
          continue;
        }
        if (!(exc instanceof NetworkError)) throw exc;
        progress(30, "JianYing · auth mạng lag, thử lại…");
        await sleepFn(1, { processing: false });
      }
    }
  });

  const address = auth?.Result?.UploadAddress ?? {};
  const store = (address.StoreInfos ?? [{}])[0] ?? {};
  const uri = store.StoreUri;
  const uploadAuth = store.Auth;
  const uploadId = store.UploadID;
  const host = (address.UploadHosts ?? [""])[0];
  if (!uri || !uploadAuth || !uploadId || !host) {
    throw new ProviderError("upload auth thiếu dữ liệu", {
      provider: "JianYing",
      phase: "upload_auth",
    });
  }

  await METRICS.time("jy_put_ms", async () => {
    progress(40, "JianYing · upload audio…");
    const root = "https://" + String(host) + "/" + String(uri);
    const uploadHeaders = {
      "User-Agent": PERF.JY_UPLOAD_UA,
      Authorization: String(uploadAuth),
      "Content-CRC32": crc,
    };
    let uploaded;
    for (;;) {
      checkpoint();
      try {
        uploaded = ensureJson(
          await sess.put(`${root}?partNumber=1&uploadID=${uploadId}`, {
            headers: uploadHeaders,
            body: openAudio, // stream from disk — fresh Readable per attempt
            contentLength: audioSizeRes,
            timeout: toUpload,
            ...(token ? { token } : {}),
          }),
          "upload_put",
        );
        break;
      } catch (exc) {
        if (exc instanceof ProviderError && exc.retryable) {
          progress(40, "JianYing · upload server bận, thử lại…");
          await sleepFn(1, { processing: false });
          continue;
        }
        if (!(exc instanceof NetworkError)) throw exc;
        progress(40, "JianYing · upload lag, thử lại…");
        await sleepFn(1, { processing: false });
      }
    }
    if (uploaded.success !== 0) {
      throw new ProviderError(`upload: ${JSON.stringify(uploaded)}`, {
        provider: "JianYing",
        phase: "upload_put",
        detail: uploaded,
        retryable: true,
      });
    }
    // Multipart merge commit — a real protocol step with retry (network + retryable 5xx).
    // Merge body is protocol-locked: `1:<crc32-hex>`; validate before sending.
    if (!/^[0-9a-fA-F]{8}$/.test(String(crc).trim())) {
      throw new ProviderError("merge crc không hợp lệ: " + JSON.stringify(crc)?.slice(0, 60), {
        provider: "JianYing",
        phase: "upload_merge",
        detail: String(crc).slice(0, 60),
        retryable: false,
      });
    }
    const mergeBody = "1:" + String(crc).trim().toLowerCase();
    let mergeHtmlHits = 0;
    checkpoint();
    for (;;) {
      checkpoint();
      try {
        const mergeResponse = await sess.post(`${root}?uploadID=${uploadId}`, {
          headers: uploadHeaders,
          body: mergeBody,
          timeout: toLong,
          ...(token ? { token } : {}),
        });
        if (mergeResponse.status >= 400) {
          const text = mergeResponse.text();
          const retryable = RETRYABLE_STATUSES.has(mergeResponse.status);
          if (retryable) {
            progress(40, "JianYing · merge server bận, thử lại…");
            await sleepFn(1, { processing: false });
            continue;
          }
          throw new ProviderError(`HTTP ${mergeResponse.status}: ${text.slice(0, 500)}`, {
            provider: "JianYing",
            phase: "upload_merge",
            detail: text.slice(0, 500),
            retryable: false,
          });
        }
        // 200-HTML impostor: a WAF wall with status 200 is not a merge commit.
        // Cap retries at 3, then fail fast instead of looping forever.
        const mergeText = mergeResponse.text();
        if (/^\s*<(?:!doctype|html)/i.test(mergeText.slice(0, 120))) {
          mergeHtmlHits += 1;
          if (mergeHtmlHits >= 3) {
            throw new ProviderError("merge trả về HTML (WAF?), dừng sau 3 lần thử", {
              provider: "JianYing",
              phase: "upload_merge",
              detail: mergeText.slice(0, 200),
              retryable: false,
            });
          }
          progress(40, "JianYing · merge HTML lạ, thử lại…");
          await sleepFn(1, { processing: false });
          continue;
        }
        break;
      } catch (exc) {
        if (exc instanceof ProviderError) throw exc;
        if (!(exc instanceof NetworkError)) throw exc;
        progress(40, "JianYing · merge lag, thử lại…");
        await sleepFn(1, { processing: false });
      }
    }
  });

  let submitted;
  await METRICS.time("jy_submit_ms", async () => {
    progress(58, "JianYing · tạo task…");
    const endpoint = "/lv/v1/audio_subtitle/submit";
    const payload = {
      adjust_endtime: PERF.JY_ADJUST_ENDTIME,
      audio: uri,
      caption_type: PERF.JY_CAPTION_TYPE,
      client_request_id: crypto.randomUUID(), // refreshed per attempt below
      max_lines: 1,
      songs_info: [{ end_time: Math.max(1000, Math.trunc(durationMs)), id: "", start_time: 0 }],
      words_per_line: PERF.JY_WORDS_PER_LINE,
    };
    for (;;) {
      checkpoint();
      payload.client_request_id = crypto.randomUUID();
      try {
        submitted = await postJson(sess, base + endpoint, {
          headers: jyHeaders(endpoint, device, version),
          timeout: toLong,
          label: "submit",
          jsonBody: payload,
          token,
        });
        return;
      } catch (exc) {
        if (exc instanceof ProviderError && exc.retryable) {
          progress(58, "JianYing · submit server bận, thử lại…");
          await sleepFn(1, { processing: false });
          continue;
        }
        if (!(exc instanceof NetworkError)) throw exc;
        progress(58, "JianYing · submit lag, thử lại…");
        await sleepFn(1, { processing: false });
      }
    }
  });

  if (String(submitted.ret) !== "0") {
    throw new ProviderError(`submit: ${JSON.stringify(submitted)}`, {
      provider: "JianYing",
      phase: "submit",
      detail: submitted,
      retryable: true,
    });
  }
  const taskId = String(submitted?.data?.id ?? "").trim();
  if (!taskId) {
    throw new ProviderError("submit thiếu task id", {
      provider: "JianYing",
      phase: "submit",
    });
  }

  // Poll forever (or until JY_POLL_MAX_ATTEMPTS if explicitly set > 0).
  const endpoint = "/lv/v1/audio_subtitle/query";
  const limit = PERF.JY_POLL_MAX_ATTEMPTS;
  let transientHits = 0;
  // Fast-start pacing: short clips finish server-side within seconds — probe
  // the first attempts quickly, then hand over to jittered backoff.
  const paceSleep = async (attempt, opts) => {
    if (attempt <= 3) return sleepFn(attempt, { ...opts, baseS: 0.12, capS: 0.25 });
    return sleepFn(attempt, opts);
  };
  const rows = await METRICS.time("jy_poll_ms", async () => {
    for (let attempt = 0; limit <= 0 || attempt < limit; attempt++) {
      checkpoint();
      let result;
      try {
        const response = await sess.post(base + endpoint, {
          body: JSON.stringify({ id: taskId, pack_options: { need_attribute: true } }),
          headers: jyHeaders(endpoint, device, version),
          timeout: toPoll, // default null = no timeout
          ...(token ? { token } : {}),
        });
        result = ensureJson(response, "query");
      } catch (exc) {
        if (exc instanceof ProviderError && exc.retryable) {
          transientHits += 1;
          if (attempt % 3 === 0) {
            progress(Math.min(91, 60 + ((attempt % 200) / 10) | 0), "JianYing · server bận, poll tiếp…");
          }
          await paceSleep(attempt, { processing: false });
          continue;
        }
        if (exc instanceof NetworkError) {
          // Even with timeout=null, connection drops can still happen.
          transientHits += 1;
          METRICS.incr("jy_poll_network_blips");
          if (attempt % 3 === 0) {
            progress(
              Math.min(91, 60 + ((attempt % 200) / 10) | 0),
              `JianYing · mạng gián đoạn, poll tiếp… (#${transientHits})`,
            );
          }
          await paceSleep(attempt, { processing: true });
          continue;
        }
        throw exc;
      }

      if (String(result.ret) !== "0") {
        METRICS.incr("jy_poll_ret_nonzero");
        await paceSleep(attempt, { processing: false });
        continue;
      }

      const payloadData = result.data;
      if (payloadData !== null && payloadData !== undefined) {
        let parsed;
        try {
          parsed = parseJianyingUtterances(payloadData);
        } catch (exc) {
          throw new ProviderError(String(exc?.message ?? exc), {
            provider: "JianYing",
            phase: "query",
            detail: String(exc?.message ?? exc).slice(0, 500),
            cause: exc,
          });
        }
        METRICS.incr("jy_success");
        progress(92, `JianYing · ${parsed.length} utterances`);
        return parsed;
      }

      if (attempt % 4 === 0) {
        progress(Math.min(91, 60 + ((attempt % 200) / 10) | 0), "JianYing · chờ ASR (không timeout)…");
      }
      await paceSleep(attempt, { processing: true });
    }
    return null;
  });

  if (rows !== null) return rows;

  METRICS.incr("jy_timeout");
  throw new ProviderError(`query dừng sau ${limit} lần poll (task=${taskId})`, {
    provider: "JianYing",
    phase: "query",
    retryable: true,
  });
}
