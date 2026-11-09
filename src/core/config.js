/** UltraX performance constants — no artificial kill-switch timeouts. */

import os from "node:os";

function cpuParallelism() {
  try {
    if (typeof os.availableParallelism === "function") {
      const n = os.availableParallelism();
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
  } catch {
    /* fall through to cpus() */
  }
  return os.cpus()?.length || 4;
}

function defaultMaxWorkers() {
  const cpu = cpuParallelism();
  return Math.max(4, Math.min(12, cpu * 2));
}

const FLOAT_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const INT_RE = /^[+-]?\d+$/;

/** Warn-once helper: invalid env falls back but never silently. */
const warnedEnvs = new Set();
function warnInvalidEnv(name, raw, fallbackDesc) {
  if (warnedEnvs.has(name)) return;
  warnedEnvs.add(name);
  try {
    console.warn(`[config] env ${name}=${JSON.stringify(raw)} invalid — using ${fallbackDesc}`);
  } catch {
    /* warn must never throw */
  }
}

function envBytes(name, defaultUnits, minUnits, maxUnits, shift, unitLabel) {
  const raw = process.env[name];
  if (raw === undefined) return defaultUnits << shift;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < minUnits || n > maxUnits) {
    warnInvalidEnv(name, raw, `${defaultUnits}${unitLabel} (range ${minUnits}–${maxUnits}${unitLabel})`);
    return defaultUnits << shift;
  }
  return n << shift;
}

function envIntMB(name, defaultMB, minMB, maxMB) {
  return envBytes(name, defaultMB, minMB, maxMB, 20, "MB");
}

function envString(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = String(raw).trim();
  if (!value) {
    warnInvalidEnv(name, raw, `default ${JSON.stringify(defaultValue)}`);
    return defaultValue;
  }
  return value;
}

/** Parse positive-float env with fallback + warn; null/undefined raw => default. */
function envPositiveFloat(name, defaultValue, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = String(raw).trim().toLowerCase();
  if (!FLOAT_RE.test(value)) {
    warnInvalidEnv(name, raw, String(defaultValue));
    return defaultValue;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    warnInvalidEnv(name, raw, String(defaultValue));
    return defaultValue;
  }
  return n;
}

/** Parse positive-int env with fallback + warn. */
function envPositiveInt(name, defaultValue, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = String(raw).trim().toLowerCase();
  if (!INT_RE.test(value)) {
    warnInvalidEnv(name, raw, String(defaultValue));
    return defaultValue;
  }
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    warnInvalidEnv(name, raw, String(defaultValue));
    return defaultValue;
  }
  return n;
}

function envBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.trim().toLowerCase();
  if (value === "") return false;
  return !["0", "false", "no", "off"].includes(value);
}

/** Parse float env; empty/none/0/off => null (wait forever). Warns once on garbage. */
function envFloat(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.trim().toLowerCase();
  if (["", "none", "null", "off", "0", "inf", "infinite", "forever"].includes(value)) {
    return null;
  }
  if (!FLOAT_RE.test(value)) {
    warnInvalidEnv(name, raw, defaultValue === null ? "null (wait forever)" : String(defaultValue));
    return defaultValue;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    warnInvalidEnv(name, raw, defaultValue === null ? "null (wait forever)" : String(defaultValue));
    return defaultValue;
  }
  return n <= 0 ? null : n;
}

/** Parse int env; none/off/inf => 0 (0 = unlimited attempts). Negative clamps to 0. */
function envInt(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const value = raw.trim().toLowerCase();
  if (["", "none", "null", "off", "inf", "infinite", "forever"].includes(value)) {
    return 0;
  }
  if (!INT_RE.test(value)) {
    warnInvalidEnv(name, raw, String(defaultValue));
    return defaultValue;
  }
  const n = Number.parseInt(value, 10);
  if (n < 0) return 0;
  return n;
}

/**
 * Build timeout tuple for the HTTP session.
 * - [null, null] / both unset => null (no timeout at all)
 * - otherwise [connectMs, readMs]; either side may be null = wait forever on that phase
 */
export function httpTimeout(connect, read) {
  if (connect === undefined || connect === null) {
    if (read === undefined || read === null) return null;
    return [null, read];
  }
  return [connect, read ?? null];
}

export const PERF = Object.freeze({
  CHUNK_CORE_S: 480.0,
  OVERLAP_S: 8.0,
  SILENCE_WINDOW: 55.0,
  SILENCE_NOISE_DB: -38.0,
  SILENCE_MIN_D: 0.4,
  SILENCE_DETECT: envBool("ASR_SILENCE", true),

  // Hardware-tunable I/O windows (defaults fit 4GB RAM; raise on 16GB+ NVMe).
  // ASR_SPAN_MB: cutter read-ahead (default 8, range 1–64).
  // ASR_OUTBUF_KB: per-output write buffer (default 256, range 64–4096).
  SPAN_BYTES: envIntMB("ASR_SPAN_MB", 8, 1, 64),
  OUT_BUF_BYTES: envBytes("ASR_OUTBUF_KB", 256, 64, 4096, 10, "KB"),

  // Server upload streaming: 1MB pipe chunks (default; 64KB default wastes event-loop turns).
  UPLOAD_HWM_BYTES: 1 << 20,

  POOL_SIZE: 32,

  // Default: NO read/connect kill-switch. Waits forever.
  // Override only if you really want one, e.g. ASR_JY_POLL_READ=120
  JY_CONNECT_TO: envFloat("ASR_JY_CONNECT", null),
  JY_POLL_READ_TO: envFloat("ASR_JY_POLL_READ", null),
  JY_LONG_READ_TO: envFloat("ASR_JY_LONG_READ", null),
  JY_UPLOAD_READ_TO: envFloat("ASR_JY_UPLOAD_READ", null),

  JY_POLL_MIN_S: envPositiveFloat("ASR_JY_POLL_MIN_S", 0.35, { min: 0.01, max: 60 }),
  JY_POLL_MAX_S: envPositiveFloat("ASR_JY_POLL_MAX_S", 1.5, { min: 0.01, max: 60 }),
  // 0 = poll forever until server returns data or user cancels
  JY_POLL_MAX_ATTEMPTS: envInt("ASR_JY_POLL_ATTEMPTS", 0),

  JY_APPVR: envString("ASR_JY_APPVR", "10.9.0"),
  JY_CAPTION_TYPE: envPositiveInt("ASR_JY_CAPTION_TYPE", 2, { min: 1, max: 10 }),
  JY_WORDS_PER_LINE: envPositiveInt("ASR_JY_WORDS_PER_LINE", 16, { min: 1, max: 100 }),
  JY_ADJUST_ENDTIME: envPositiveInt("ASR_JY_ADJUST_ENDTIME", 200, { min: 0, max: 10000 }),
  JY_BASE: envString("ASR_JY_BASE", "https://lv-pc-api-sinfonlinec.ulikecam.com"),
  JY_SIGN_UA: envString(
    "ASR_JY_SIGN_UA",
    "Cronet/TTNetVersion:d4572e53 2024-06-12 QuicVersion:4bf243e0 2023-04-17",
  ),
  JY_UPLOAD_UA: envString(
    "ASR_JY_UPLOAD_UA",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Thea/1.0.1",
  ),

  AUDIO_CHANNELS: 1,
  AUDIO_SAMPLE_RATE: 16000,
  AUDIO_BITRATE: "64k",

  CIRCUIT_FAILS: 8,
  CIRCUIT_RESET_S: 45.0,
  RATE_RPS: 8.0,

  jyTimeout(kind = "poll") {
    if (kind === "upload") return httpTimeout(this.JY_CONNECT_TO, this.JY_UPLOAD_READ_TO);
    if (kind === "long") return httpTimeout(this.JY_CONNECT_TO, this.JY_LONG_READ_TO);
    // poll / default
    return httpTimeout(this.JY_CONNECT_TO, this.JY_POLL_READ_TO);
  },

  maxWorkers(override = null) {
    if (override !== null && override !== undefined) {
      const n = Math.trunc(Number(override));
      if (Number.isFinite(n) && n > 0) return Math.min(n, 16);
      warnInvalidEnv("maxWorkers(override)", override, "auto");
    }
    const env = process.env.ASR_MAX_WORKERS;
    if (env !== undefined) {
      const n = Number.parseInt(String(env).trim(), 10);
      if (Number.isFinite(n) && n > 0) return Math.min(n, 16);
      warnInvalidEnv("ASR_MAX_WORKERS", env, "auto");
    }
    return defaultMaxWorkers();
  },
});
