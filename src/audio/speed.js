/** Physical audio speed conversion and FFmpeg discovery.
 * Real time-stretch: preserves pitch while physically altering speed (e.g. 0.8x),
 * so ASR requests receive actual slowed audio and generate direct matching subtitles.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ASRError } from "../core/errors.js";
import { normalizeSpeed } from "../core/domain.js";

let _cachedFfmpeg = undefined;

/** Discover FFmpeg executable path across platform environments. */
export function getFfmpegPath() {
  if (_cachedFfmpeg !== undefined) return _cachedFfmpeg;
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return (_cachedFfmpeg = process.env.FFMPEG_PATH);
  }

  // 1. Check system PATH
  try {
    const res = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", windowsHide: true });
    if (res.status === 0) {
      return (_cachedFfmpeg = "ffmpeg");
    }
  } catch {
    /* ignore and check known paths */
  }

  // 2. Check well-known Windows locations
  const candidates = [
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
    path.join(os.homedir(), "ffmpeg", "bin", "ffmpeg.exe"),
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
    "D:\\ffmpeg\\bin\\ffmpeg.exe",
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return (_cachedFfmpeg = candidate);
      }
    } catch {
      /* ignore access errors */
    }
  }

  return (_cachedFfmpeg = null);
}

export function isFfmpegAvailable() {
  return getFfmpegPath() !== null;
}

/**
 * Build atempo filter chain for any speed in [0.5, 1.5].
 * FFmpeg's atempo filter natively supports 0.5 to 2.0 per instance.
 */
function buildAtempoFilter(speed) {
  if (speed >= 0.5 && speed <= 2.0) {
    return `atempo=${speed.toFixed(4)}`;
  }
  // For speeds outside [0.5, 2.0], chain multiple filters if needed
  const filters = [];
  let remaining = speed;
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}

/**
 * Physically convert audio from inputPath to outputPath at exact speed factor.
 * Uses high-quality tempo filter with 100% pitch preservation.
 */
export async function convertAudioSpeed(inputPath, outputPath, speed = 0.8, { token = null, sampleRate = 16000 } = {}) {
  const normSpeed = normalizeSpeed(speed);
  if (Math.abs(normSpeed - 1.0) < 1e-6) {
    if (inputPath !== outputPath) {
      fs.copyFileSync(inputPath, outputPath);
    }
    return outputPath;
  }

  const ffmpeg = getFfmpegPath();
  if (!ffmpeg) {
    throw new ASRError(
      `Không tìm thấy FFmpeg để chuyển đổi âm thanh chuẩn ${normSpeed}x. Vui lòng cài đặt FFmpeg hoặc cấu hình biến FFMPEG_PATH.`,
    );
  }

  const atempoFilter = buildAtempoFilter(normSpeed);
  const ext = path.extname(outputPath).toLowerCase();
  const isWav = ext === ".wav";
  const isAac = ext === ".aac" || ext === ".m4a";

  const audioCodecArgs = isWav
    ? ["-c:a", "pcm_s16le"]
    : isAac
      ? ["-c:a", "aac", "-b:a", "128k"]
      : ["-c:a", "libmp3lame", "-q:a", "2"];

  const args = [
    "-nostdin",
    "-y",
    "-i", inputPath,
    "-vn",
    "-filter:a", atempoFilter,
    ...audioCodecArgs,
    "-ar", String(sampleRate),
    "-ac", "1",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (err) {
      return reject(new ASRError(`Không thể khởi chạy FFmpeg: ${err.message}`, { cause: err }));
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
        return reject(new ASRError("Chuyển đổi âm thanh bị hủy bởi người dùng"));
      }
      token.onCancel?.(onCancel);
    }

    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve(outputPath);
      } else {
        if (token?.cancelled) {
          reject(new ASRError("Chuyển đổi âm thanh bị hủy bởi người dùng"));
        } else {
          reject(
            new ASRError(
              `Chuyển đổi âm thanh ${normSpeed}x thất bại (mã ${code}): ${stderr.slice(-300) || "không rõ nguyên nhân"}`,
            ),
          );
        }
      }
    });

    child.on("error", (err) => {
      reject(new ASRError(`Lỗi tiến trình FFmpeg: ${err.message}`, { cause: err }));
    });
  });
}
