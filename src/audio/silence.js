/** Silence detection — multi-format FFmpeg scan + pure NodeJS WAV PCM energy scan.
 * Intelligently locates pauses and non-vocal sections across any language and media container
 * (MP4, MKV, MP3, WAV, M4A, etc.) so chunks are cut exclusively in silence, preventing
 * clipped words and stitch fragmentation errors.
 */

import { spawn } from "node:child_process";
import { ASRError } from "../core/errors.js";
import { PERF } from "../core/config.js";
import { getFfmpegPath } from "./speed.js";

/** Detect silence intervals across any audio/video container using FFmpeg silencedetect. */
export async function detectSilenceWithFfmpeg(
  filePath,
  { noiseDb = PERF.SILENCE_NOISE_DB, minDuration = PERF.SILENCE_MIN_D, token = null } = {},
) {
  const ffmpeg = getFfmpegPath();
  if (!ffmpeg || !filePath) return [];

  return new Promise((resolve) => {
    const args = [
      "-nostdin",
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ];

    let child;
    try {
      child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    } catch {
      return resolve([]);
    }

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const onCancel = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    };

    if (token) {
      if (token.cancelled) {
        onCancel();
        return resolve([]);
      }
      token.onCancel?.(onCancel);
    }

    child.on("close", (code) => {
      // silencedetect writes to stderr even with exit code 0
      const midpoints = [];
      const lines = stderr.split(/\r?\n/);
      let currentStart = null;

      for (const line of lines) {
        const startMatch = /silence_start:\s*([0-9.]+)/.exec(line);
        if (startMatch) {
          currentStart = Number(startMatch[1]);
          continue;
        }

        const endMatch = /silence_end:\s*([0-9.]+)/.exec(line);
        if (endMatch && currentStart !== null) {
          const end = Number(endMatch[1]);
          if (end > currentStart && Number.isFinite(end) && Number.isFinite(currentStart)) {
            midpoints.push(Math.round(((currentStart + end) / 2) * 1000) / 1000);
          }
          currentStart = null;
        }
      }

      midpoints.sort((a, b) => a - b);
      resolve(midpoints);
    });

    child.on("error", () => resolve([]));
  });
}

/** Detect silence midpoints via RMS windowing on mono/stereo 16-bit PCM (pure NodeJS). */
export async function detectWavSilenceRMS(meta, { token = null } = {}) {
  if (!meta || typeof meta !== "object") throw new ASRError("silence: meta thiếu");
  const track = meta.track;
  if (!track) throw new ASRError("silence: meta.track thiếu");
  if (track.bits !== 16) {
    throw new ASRError(`ASR_SILENCE chỉ hỗ trợ PCM 16-bit (nhận ${track.bits}-bit).`);
  }
  if (!Number.isInteger(track.channels) || track.channels < 1 || track.channels > 64) {
    throw new ASRError(`silence: channels ${track.channels} ngoài [1,64]`);
  }
  if (!(track.sampleRate > 0 && Number.isFinite(track.sampleRate))) {
    throw new ASRError(`silence: sampleRate ${track.sampleRate} vô lý`);
  }
  if (!Number.isInteger(track.auCount) || track.auCount <= 0) {
    throw new ASRError("silence: auCount vô lý");
  }
  if (typeof track.auLocation !== "function") throw new ASRError("silence: track.auLocation thiếu");

  const fsMod = await import("node:fs");
  const fd = fsMod.openSync(meta.path, "r");
  try {
    const framesPerWin = Math.max(1, Math.round(track.sampleRate * 0.03)); // 30ms windows
    const bytesPerWin = framesPerWin * track.channels * 2;
    const winsPerBig = Math.max(1, Math.floor((1 << 20) / bytesPerWin));
    const bigBytes = winsPerBig * bytesPerWin;
    const buf = Buffer.allocUnsafe(bigBytes);
    const thresholdAmp = Math.pow(10, PERF.SILENCE_NOISE_DB / 20) * 32767;

    let pos = track.auLocation(0).pos;
    const stride = track.blockAlign ?? track.channels * 2;
    const dataEnd = pos + track.auCount * stride;
    let winStartS = 0;
    let silenceStartS = null;
    const midpoints = [];

    const processWindow = (base, len) => {
      const samples = Math.floor(len / 2);
      let sumSq = 0;
      for (let s = 0; s < samples; s++) {
        const off = base + s * 2;
        let v = buf[off] | (buf[off + 1] << 8);
        if (v & 0x8000) v -= 0x10000;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, samples));
      const quiet = rms < thresholdAmp;
      if (quiet && silenceStartS === null) silenceStartS = winStartS;
      if (!quiet && silenceStartS !== null) {
        if (winStartS - silenceStartS >= PERF.SILENCE_MIN_D) {
          midpoints.push((silenceStartS + winStartS) / 2);
        }
        silenceStartS = null;
      }
      winStartS += samples / track.channels / track.sampleRate;
    };

    let windows = 0;
    while (pos < dataEnd) {
      const wantBig = Math.min(bigBytes, dataEnd - pos);
      let off = 0;
      while (off < wantBig) {
        const n = fsMod.readSync(fd, buf, off, wantBig - off, pos + off);
        if (n <= 0) throw new ASRError("WAV đọc hụt khi quét silence");
        off += n;
      }
      let base = 0;
      while (base < wantBig) {
        const len = Math.min(bytesPerWin, wantBig - base);
        processWindow(base, len);
        base += len;
        windows += 1;
        if (token && (windows & 255) === 0) token.check();
      }
      pos += wantBig;
      token?.check();
    }
    if (silenceStartS !== null && winStartS - silenceStartS >= PERF.SILENCE_MIN_D) {
      midpoints.push((silenceStartS + winStartS) / 2);
    }
    return midpoints;
  } finally {
    fsMod.closeSync(fd);
  }
}

/**
 * Universal silence detector: checks FFmpeg for all formats first,
 * with pure Node RMS fallback on WAV PCM.
 */
export async function detectSilenceMidpoints(meta, { token = null } = {}) {
  if (!PERF.SILENCE_DETECT) return [];
  if (!meta || typeof meta !== "object") throw new ASRError("silence: meta thiếu");

  // 1. Multi-format fast FFmpeg scan
  if (meta.path) {
    try {
      const midpoints = await detectSilenceWithFfmpeg(meta.path, {
        noiseDb: PERF.SILENCE_NOISE_DB,
        minDuration: PERF.SILENCE_MIN_D,
        token,
      });
      if (Array.isArray(midpoints) && midpoints.length > 0) {
        return midpoints;
      }
    } catch {
      /* fall through to WAV fallback */
    }
  }

  // 2. Pure-Node RMS fallback on WAV
  if (meta.kind === "wav") {
    return detectWavSilenceRMS(meta, { token });
  }

  return [];
}

/** Chooses cut points: silence-aligned when available, exact target otherwise.
 * This is adaptive planning — never a quality downgrade. */
export function boundaries(duration, silences, chunkS = null, window = null) {
  const chunk = chunkS ?? PERF.CHUNK_CORE_S;
  const win = window ?? PERF.SILENCE_WINDOW;
  if (!(duration > 0 && Number.isFinite(duration))) throw new ASRError("duration must be positive finite");
  if (!(chunk > 0 && Number.isFinite(chunk))) throw new ASRError("chunk must be positive finite");
  if (!(win >= 0 && Number.isFinite(win))) throw new ASRError("window must be finite non-negative");
  if (!Array.isArray(silences)) throw new ASRError("silences phải là mảng số giây");
  for (let k = 0; k < silences.length; k++) {
    const s = silences[k];
    if (!(typeof s === "number" && Number.isFinite(s) && s >= 0 && s <= duration)) {
      throw new ASRError(`silences[${k}]=${s} ngoài [0,${duration}]`);
    }
    if (k > 0 && !(s >= silences[k - 1])) {
      throw new ASRError(`silences không sắp xếp tại [${k - 1},${k}] (${silences[k - 1]} > ${s})`);
    }
  }
  const points = [0.0];
  let target = chunk;
  const MIN_HOP_RATIO = 0.5; // hops shorter than 50% core are fused forward
  const SLIVER_RATIO = 0.2; // silence picks landing within 20% core are skipped
  while (target < duration) {
    const minimum = points[points.length - 1] + chunk * MIN_HOP_RATIO;
    let candidates = silences.filter(
      (s) => s >= minimum && s < duration && Math.abs(s - target) <= win,
    );
    // If no candidate in standard window, adaptively look slightly wider (1.5x) to catch a natural breath pause
    if (candidates.length === 0 && silences.length > 0) {
      candidates = silences.filter(
        (s) => s >= minimum && s < duration && Math.abs(s - target) <= win * 1.5,
      );
    }
    let point;
    if (candidates.length > 0) {
      point = candidates.reduce((best, s) =>
        Math.abs(s - target) < Math.abs(best - target) ? s : best,
      );
    } else {
      point = target;
    }
    if (point <= points[points.length - 1] + chunk * SLIVER_RATIO) {
      point = Math.min(duration, points[points.length - 1] + chunk);
    }
    points.push(point);
    target = point + chunk;
  }
  points.push(duration);

  // Merge a tiny tail: a final core shorter than ~10% of the core (and less
  // than half the silence window) would emit a near-empty chunk that is
  // ~100% overlap with its predecessor.
  if (points.length > 2) {
    const tail = duration - points[points.length - 2];
    const minTail = Math.min(chunk * 0.1, win * 0.5);
    if (tail < minTail) {
      points.splice(points.length - 2, 1);
    }
  }
  return points;
}
