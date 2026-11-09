/**
 * Fast pure-Node audio stream extractor (demuxer).
 * Extracts raw audio streams (AAC ADTS, MP3, WAV) from video containers (MP4/MOV)
 * without re-encoding, zero external dependencies, in sub-50ms.
 */

import fs from "node:fs";
import path from "node:path";
import { inspectMedia } from "./media.js";
import { cutUnits } from "./cut.js";
import { CancelToken } from "../core/cancel.js";
import { ASRError } from "../core/errors.js";

/**
 * Extract audio track from container video.
 * @param {string} videoPath
 * @param {string|null} outputPath
 * @param {{token?: CancelToken, onProgress?: Function}} options
 * @returns {Promise<{outputPath: string, durationS: number, sizeBytes: number, format: string, elapsedMs: number}>}
 */
export async function extractAudio(videoPath, outputPath = null, { token = new CancelToken(), onProgress = () => {} } = {}) {
  const resolvedInput = path.resolve(videoPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new ASRError(`File video không tồn tại: ${resolvedInput}`);
  }

  onProgress(10, "Đang kiểm tra định dạng container…");
  const meta = inspectMedia(resolvedInput);

  if (!outputPath) {
    const ext = meta.kind === "mp4-aac" ? ".aac" : meta.kind === "mp4-mp3" ? ".mp3" : ".wav";
    const dir = path.dirname(resolvedInput);
    const base = path.basename(resolvedInput, path.extname(resolvedInput));
    outputPath = path.join(dir, `${base}${ext}`);
  }
  const resolvedOutput = path.resolve(outputPath);

  const track = meta.track;
  if (!track || track.auCount <= 0) {
    throw new ASRError(`Không tìm thấy luồng âm thanh hợp lệ trong file: ${resolvedInput}`);
  }

  const wrap = meta.kind === "mp4-aac" ? "adts" : "raw";
  onProgress(30, `Đang trích xuất ${track.auCount} frame âm thanh (wrap: ${wrap})…`);

  const t0 = performance.now();
  const ranges = [{
    fromAu: 0,
    toAuExcl: track.auCount,
    wrap,
    outPath: resolvedOutput,
  }];

  await cutUnits(meta, ranges, { token });
  const elapsedMs = performance.now() - t0;
  const sizeBytes = fs.statSync(resolvedOutput).size;

  onProgress(100, `Trích xuất hoàn tất (${elapsedMs.toFixed(1)}ms, ${(sizeBytes / 1024).toFixed(1)} KB)`);

  return {
    outputPath: resolvedOutput,
    durationS: meta.durationS,
    sizeBytes,
    format: meta.kind,
    elapsedMs,
  };
}
