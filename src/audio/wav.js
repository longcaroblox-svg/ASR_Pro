/** Pure-Node WAV parser — RIFF/PCM passthrough cutting.
 * Units = frames (blockAlign granules); positions are contiguous by format,
 * so lookups are O(1) arithmetic. NO-FALLBACK: non-PCM codecs are hard errors. */

import fs from "node:fs";
import { ASRError } from "../core/errors.js";

/** Canonical 44-byte PCM WAV header with exact final sizes (no patching pass). */
export function wavHeader(dataBytes, channels, sampleRate, bits) {
  if (!Number.isSafeInteger(dataBytes) || dataBytes < 0)
    throw new ASRError("WAV header: dataBytes không hợp lệ");
  if (!Number.isInteger(channels) || channels < 1 || channels > 64)
    throw new ASRError(`WAV header: channels ${channels} ngoài [1,64]`);
  if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 768000)
    throw new ASRError(`WAV header: sampleRate ${sampleRate} ngoài [1000,768000]`);
  if (![8, 16, 24, 32].includes(bits)) throw new ASRError(`WAV header: bits ${bits} không hỗ trợ (cần 8/16/24/32)`);
  if ((channels * bits) % 8 !== 0) throw new ASRError("WAV header: channels*bits không chia hết cho 8");
  const blockAlign = Math.floor((channels * bits) / 8);
  if (!(blockAlign >= 1 && blockAlign <= 65535))
    throw new ASRError(`WAV header: blockAlign ${blockAlign} ngoài [1,65535]`);
  const byteRate = sampleRate * blockAlign;
  if (!Number.isSafeInteger(byteRate) || byteRate < 1 || byteRate > 0xffffffff)
    throw new ASRError(`WAV header: byteRate ${byteRate} vượt uint32`);
  if (36 + dataBytes > 0xffffffff)
    throw new ASRError("WAV >4GB cần RF64 — NO-FALLBACK, dùng MP4/M4A thay thế");
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "latin1");
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8, "latin1");
  h.write("fmt ", 12, "latin1");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36, "latin1");
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export function inspectWav(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    const head = Buffer.alloc(12);
    if (fs.readSync(fd, head, 0, 12, 0) !== 12) throw new ASRError("WAV ngắn hơn RIFF header");
    if (head.toString("latin1", 0, 4) !== "RIFF" || head.toString("latin1", 8, 12) !== "WAVE") {
      throw new ASRError("WAV: RIFF/WAVE magic sai");
    }
    let fmt = null;
    let data = null;
    let pos = 12;
    const hb = Buffer.allocUnsafe(8);
    while (pos + 8 <= fileSize) {
      const hbRead = fs.readSync(fd, hb, 0, 8, pos);
      if (hbRead !== 8) throw new ASRError(`WAV đọc hụt header chunk tại ${pos} (được ${hbRead}/8B)`);
      const id = hb.toString("latin1", 0, 4);
      let size = hb.readUInt32LE(4);
      if (id === "data" && size === 0) size = fileSize - pos - 8; // streaming-written wav
      if (pos + 8 + size > fileSize && id !== "data") break; // tolerate trailing junk
      if (id === "fmt ") {
        if (size < 16) throw new ASRError(`WAV: fmt chunk ${size}B quá ngắn (cần ≥16)`);
        const b = Buffer.alloc(Math.min(size, 40));
        const fmtRead = fs.readSync(fd, b, 0, b.length, pos + 8);
        if (fmtRead !== b.length) throw new ASRError(`WAV đọc hụt fmt tại ${pos} (được ${fmtRead}/${b.length}B)`);
        const audioFormat = b.readUInt16LE(0);
        const channels = b.readUInt16LE(2);
        const sampleRate = b.readUInt32LE(4);
        const blockAlign = b.readUInt16LE(12);
        const bits = b.readUInt16LE(14);
        const byteRate = b.readUInt32LE(8);
        let effectiveFormat = audioFormat;
        if (audioFormat === 0xfffe && b.length >= 26) effectiveFormat = b.readUInt16LE(24); // extensible SubFormat
        if (effectiveFormat !== 1) {
          throw new ASRError(`WAV: format ${effectiveFormat} không phải PCM thuần — không hỗ trợ`);
        }
        if (!Number.isInteger(channels) || channels < 1 || channels > 64)
          throw new ASRError(`WAV: channels ${channels} ngoài [1,64]`);
        if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 768000)
          throw new ASRError(`WAV: sampleRate ${sampleRate} ngoài [1000,768000]`);
        if (!blockAlign || blockAlign > 65535) throw new ASRError(`WAV: blockAlign ${blockAlign} vô lý`);
        if (![8, 16, 24, 32].includes(bits)) throw new ASRError(`WAV: bits ${bits} không hỗ trợ (cần 8/16/24/32)`);
        if (blockAlign !== (channels * bits) / 8)
          throw new ASRError(`WAV: blockAlign ${blockAlign} ≠ channels*bits/8 (${(channels * bits) / 8})`);
        if (byteRate !== sampleRate * blockAlign)
          throw new ASRError(`WAV: byteRate ${byteRate} ≠ sampleRate*blockAlign`);
        fmt = { channels, sampleRate, blockAlign, bits };
      } else if (id === "data") {
        data = { pos: pos + 8, size: Math.min(size, fileSize - pos - 8) };
      }
      pos += 8 + size + (size % 2); // chunks are word-aligned
    }
    if (!fmt || !data) throw new ASRError("WAV: thiếu fmt hoặc data chunk");
    if (data.size <= 0) throw new ASRError("WAV: data rỗng — không có frame nào");
    if (fmt.blockAlign % fmt.channels !== 0) throw new ASRError("WAV: blockAlign không khớp channels");

    const unitCount = Math.floor(data.size / fmt.blockAlign);
    const sampleRate = fmt.sampleRate;

    const track = {
      codec: "pcm",
      channels: fmt.channels,
      bits: fmt.bits,
      blockAlign: fmt.blockAlign,
      sampleRate,
      auCount: unitCount,
      contiguous: true, // PCM frames are laid out back-to-back by definition
      durationS: unitCount / sampleRate,
      auDtsS: (i) => {
        if (!Number.isInteger(i) || i < 0 || i >= unitCount) throw new ASRError(`frame ${i} ngoài phạm vi`);
        return i / sampleRate;
      },
      auIndexAtS: (s) => {
        if (!(s > 0)) return 0;
        return Math.max(0, Math.min(unitCount - 1, Math.floor(s * sampleRate)));
      },
      auLocation: (i) => {
        if (!Number.isInteger(i) || i < 0 || i >= unitCount) throw new ASRError(`frame ${i} ngoài phạm vi`);
        return { pos: data.pos + i * fmt.blockAlign, size: fmt.blockAlign };
      },
      *iterateAus(fromAu = 0, toAuExclusive = unitCount) {
        if (!Number.isInteger(fromAu) || !Number.isInteger(toAuExclusive)) {
          throw new ASRError(`WAV iterateAus [${fromAu},${toAuExclusive}) không phải số nguyên`);
        }
        if (fromAu < 0 || toAuExclusive > unitCount || toAuExclusive < fromAu) {
          throw new ASRError(`WAV iterateAus [${fromAu},${toAuExclusive}) ngoài [0,${unitCount}]`);
        }
        for (let i = fromAu; i < toAuExclusive; i++) {
          yield { index: i, pos: data.pos + i * fmt.blockAlign, size: fmt.blockAlign, dtsS: i / sampleRate };
        }
      },
    };
    return { kind: "wav", durationS: track.durationS, track };
  } finally {
    fs.closeSync(fd);
  }
}
