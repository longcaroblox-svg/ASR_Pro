/** Universal Pure-Node Media Format Router — MP4/fMP4/MOV/M4A, WAV PCM/Float32, MP3, and ADTS AAC. */

import fs from "node:fs";
import { ASRError } from "../core/errors.js";
import { inspectMp4 } from "./mp4.js";
import { inspectMp3 } from "./mp3.js";
import { inspectWav } from "./wav.js";
import { inspectAac } from "./aac.js";

const MP4_TOP_TYPES = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide", "pnot", "uuid"]);
const FRAG_HINT_TYPES = new Set(["styp", "moof", "sidx", "emsg", "prft"]);

export function inspectMedia(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
  } catch (exc) {
    throw new ASRError(`Không mở được file: ${filePath} (${exc?.code ?? exc?.message ?? exc})`, {
      cause: exc,
    });
  }
  let head;
  let bytesRead = 0;
  try {
    head = Buffer.alloc(16);
    bytesRead = fs.readSync(fd, head, 0, 16, 0);
    if (bytesRead <= 0) throw new ASRError(`File rỗng: ${filePath}`);
  } finally {
    fs.closeSync(fd);
  }

  if (bytesRead >= 4 && head.toString("latin1", 0, 4) === "RF64") {
    throw new ASRError("RF64 (>4GB WAV) chưa hỗ trợ — dùng MP4/M4A chứa AAC — NO-FALLBACK");
  }
  const fourAt4 = bytesRead >= 8 ? head.toString("latin1", 4, 8) : "";
  if (FRAG_HINT_TYPES.has(fourAt4)) {
    throw new ASRError(
      `MP4 phân mảnh (top-level '${fourAt4}') — thiếu moov, cần file MP4/MOV/M4A progressive — NO-FALLBACK`,
    );
  }
  let meta;
  if (MP4_TOP_TYPES.has(fourAt4)) {
    const boxSize = bytesRead >= 4 ? head.readUInt32BE(0) : 0;
    if (!(boxSize === 0 || boxSize === 1 || boxSize >= 8)) {
      const hexLen = Math.max(0, Math.min(8, bytesRead));
      throw new ASRError(
        `Định dạng không nhận diện được (magic ${head.subarray(0, hexLen).toString("hex") || "rỗng"}). ` +
          `Hỗ trợ: MP4/MOV/M4A (AAC/MP3), MP3, AAC, WAV — NO-FALLBACK`,
      );
    }
    try {
      meta = inspectMp4(filePath);
    } catch (exc) {
      if (exc instanceof ASRError) throw exc;
      throw new ASRError(`MP4 hỏng: ${exc?.message ?? exc}`, { cause: exc });
    }
  } else if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WAVE") {
    try {
      meta = inspectWav(filePath);
    } catch (exc) {
      if (exc instanceof ASRError) throw exc;
      throw new ASRError(`WAV hỏng: ${exc?.message ?? exc}`, { cause: exc });
    }
  } else if (
    head.toString("latin1", 0, 3) === "ID3" ||
    (bytesRead >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
  ) {
    const isAdts =
      bytesRead >= 2 && head[0] === 0xff && (head[1] & 0xf6) === 0xf0 && (head[1] & 0x06) === 0x00;
    if (isAdts && head.toString("latin1", 0, 3) !== "ID3") {
      try {
        meta = inspectAac(filePath);
      } catch (exc) {
        if (exc instanceof ASRError) throw exc;
        throw new ASRError(`AAC hỏng: ${exc?.message ?? exc}`, { cause: exc });
      }
    } else {
      try {
        meta = inspectMp3(filePath);
      } catch (exc) {
        if (exc instanceof ASRError) throw exc;
        throw new ASRError(`MP3 hỏng: ${exc?.message ?? exc}`, { cause: exc });
      }
    }
  } else {
    const hexLen = Math.max(0, Math.min(8, bytesRead));
    throw new ASRError(
      `Định dạng không nhận diện được (magic ${head.subarray(0, hexLen).toString("hex") || "rỗng"}). ` +
        `Hỗ trợ: MP4/MOV/M4A (AAC/MP3), MP3, AAC, WAV — NO-FALLBACK`,
    );
  }
  let fileSize;
  try {
    fileSize = fs.statSync(filePath).size;
  } catch (exc) {
    throw new ASRError(`Không stat được file: ${filePath} (${exc?.code ?? exc?.message ?? exc})`, {
      cause: exc,
    });
  }
  return { ...meta, path: filePath, fileSize };
}
