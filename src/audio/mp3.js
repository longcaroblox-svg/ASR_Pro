/** Pure-Node MP3 Frame Scanner — Xing/Info/VBRI VBR Metadata Frame Stripper + RLE Runs.
 * Automatically detects and skips silent frame-0 Xing/Info/LAME/VBRI header frames
 * so timestamps never drift by ~26ms. */

import fs from "node:fs";
import { ASRError } from "../core/errors.js";

const MPEG1_L3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const L1_BITRATES = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448];
const L2_BITRATES = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];

const SAMPLE_RATES = [
  [44100, 48000, 32000],
  [22050, 24000, 16000],
  [11025, 12000, 8000],
];
const VERSION_TO_SR_ROW = Object.freeze({ 3: 0, 2: 1, 0: 2 });

const _scratchA = { versionBits: 0, layer: 0, bitrateKbps: 0, sampleRate: 0, samplesPerFrame: 0, size: 0, channelMode: 0 };
const _scratchB = { versionBits: 0, layer: 0, bitrateKbps: 0, sampleRate: 0, samplesPerFrame: 0, size: 0, channelMode: 0 };

function parseFrameHeaderInto(b, out) {
  if (b[0] !== 0xff || (b[1] & 0xe0) !== 0xe0) return false;
  const versionBits = (b[1] >> 3) & 0x03;
  const layerBits = (b[1] >> 1) & 0x03;
  if (versionBits === 1 || layerBits === 0) return false;
  const bitrateIdx = (b[2] >> 4) & 0x0f;
  const srIdx = (b[2] >> 2) & 0x03;
  if (bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) return false;
  const padding = (b[2] >> 1) & 0x01;
  const channelMode = (b[3] >> 6) & 0x03;
  const layer = 4 - layerBits;
  let bitrateKbps;
  if (layer === 3) {
    bitrateKbps = (versionBits === 3 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES)[bitrateIdx];
  } else if (layer === 2) {
    bitrateKbps = versionBits === 3 ? L2_BITRATES[bitrateIdx] : MPEG2_L3_BITRATES[bitrateIdx];
  } else {
    bitrateKbps = L1_BITRATES[bitrateIdx];
  }
  const row = VERSION_TO_SR_ROW[versionBits];
  const sampleRate = row === undefined ? 0 : SAMPLE_RATES[row][srIdx];
  if (!sampleRate || !bitrateKbps) return false;
  const samplesPerFrame = layer === 1 ? 384 : layer === 2 ? 1152 : versionBits === 3 ? 1152 : 576;
  const size =
    layer === 1
      ? (Math.floor((12 * bitrateKbps * 1000) / sampleRate) + padding) * 4
      : Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) + padding;
  if (!(size >= 1)) return false;
  out.versionBits = versionBits;
  out.layer = layer;
  out.bitrateKbps = bitrateKbps;
  out.sampleRate = sampleRate;
  out.samplesPerFrame = samplesPerFrame;
  out.size = size;
  out.channelMode = channelMode;
  return true;
}

export function parseFrameHeader(b) {
  return parseFrameHeaderInto(b, _scratchA)
    ? {
        versionBits: _scratchA.versionBits,
        layer: _scratchA.layer,
        bitrateKbps: _scratchA.bitrateKbps,
        sampleRate: _scratchA.sampleRate,
        samplesPerFrame: _scratchA.samplesPerFrame,
        size: _scratchA.size,
      }
    : null;
}

/**
 * Checks if an MP3 frame buffer is a Xing / Info / VBRI metadata header frame.
 * MPEG1 side-info is 32B (stereo) or 17B (mono); MPEG2/2.5 is 17B (stereo) or 9B (mono).
 * VBRI tag is always at offset 4 + 32 = 36.
 */
function isVbrHeaderFrame(frameBuf, versionBits, channelMode) {
  const isMono = channelMode === 3;
  const sideInfoLen = versionBits === 3 ? (isMono ? 17 : 32) : (isMono ? 9 : 17);
  const xingOff = 4 + sideInfoLen;
  if (xingOff + 4 <= frameBuf.length) {
    const tag = frameBuf.toString("latin1", xingOff, xingOff + 4);
    if (tag === "Xing" || tag === "Info") return true;
  }
  if (frameBuf.length >= 40 && frameBuf.toString("latin1", 36, 40) === "VBRI") {
    return true;
  }
  return false;
}

export function inspectMp3(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    let pos = 0;
    const magic = Buffer.alloc(10);
    const magicRead = fs.readSync(fd, magic, 0, 10, 0);
    if (magicRead >= 10 && magic.toString("latin1", 0, 3) === "ID3") {
      for (let k = 6; k <= 9; k++) {
        if (magic[k] & 0x80) throw new ASRError("MP3: ID3 syncsafe size hỏng (bit cao đặt)");
      }
      const size =
        ((magic[6] & 0x7f) << 21) | ((magic[7] & 0x7f) << 14) | ((magic[8] & 0x7f) << 7) | (magic[9] & 0x7f);
      pos = 10 + size + (magic[5] & 0x10 ? 10 : 0);
      if (!(pos >= 10 && pos <= fileSize)) {
        throw new ASRError(`MP3: ID3 tag vượt EOF (tag end ${pos} > file ${fileSize})`);
      }
    }

    const runs = [];
    const WIN = 1 << 20;
    const winBuf = Buffer.allocUnsafe(WIN);
    let winStart = -1;
    let winEnd = -1;
    const loadWin = (p) => {
      const start = Math.max(0, Math.min(p, Math.max(0, fileSize - 1)));
      const end = Math.min(fileSize, start + WIN);
      let off = 0;
      while (off < end - start) {
        const n = fs.readSync(fd, winBuf, off, end - start - off, start + off);
        if (n <= 0) break;
        off += n;
      }
      winStart = start;
      winEnd = start + off;
    };
    const readSpan = (p, len) => {
      if (p < 0 || p + len > fileSize) return null;
      if (p < winStart || p + len > winEnd) {
        loadWin(p);
        if (p < winStart || p + len > winEnd) return null;
      }
      return winBuf.subarray(p - winStart, p - winStart + len);
    };

    let count = 0;
    let runStartPos = pos;
    let runStartFrame = 0;
    let haveCur = false;
    let curSize = 0;
    let curSpf = 0;
    let curRate = 0;
    let resyncs = 0;
    let needBreak = false;
    let checkedFirstAudioFrame = false;

    for (;;) {
      const b = readSpan(pos, 4);
      if (b === null) break;
      const ok = parseFrameHeaderInto(b, _scratchA);
      if (!ok) {
        resyncs += 1;
        if (resyncs > 512) throw new ASRError(`MP3: quá nhiều điểm sync hỏng (${resyncs}) — file lỗi`);
        let probe = pos + 1;
        let found = false;
        while (probe < fileSize - 4 && probe - pos < 4096) {
          const pb = readSpan(probe, 4);
          if (pb !== null && parseFrameHeaderInto(pb, _scratchB)) {
            found = true;
            break;
          }
          probe += 1;
        }
        if (!found) break;
        pos = probe;
        needBreak = true;
        continue;
      }
      const headSize = _scratchA.size;
      const headSpf = _scratchA.samplesPerFrame;
      const headRate = _scratchA.sampleRate;
      if (pos + headSize > fileSize) break;

      if (!checkedFirstAudioFrame) {
        checkedFirstAudioFrame = true;
        const firstFrame = readSpan(pos, headSize);
        if (firstFrame && isVbrHeaderFrame(firstFrame, _scratchA.versionBits, _scratchA.channelMode)) {
          pos += headSize;
          runStartPos = pos;
          needBreak = true;
          continue;
        }
      }

      if (haveCur && !needBreak && curSize === headSize && curSpf === headSpf && curRate === headRate) {
        count += 1;
      } else {
        if (haveCur && count > 0) {
          runs.push({
            start: runStartFrame,
            frames: count - runStartFrame,
            size: curSize,
            samplesPerFrame: curSpf,
            sampleRate: curRate,
            startPos: runStartPos,
          });
        }
        runStartPos = pos;
        runStartFrame = count;
        curSize = headSize;
        curSpf = headSpf;
        curRate = headRate;
        haveCur = true;
        count += 1;
        needBreak = false;
      }
      pos += headSize;
    }
    if (haveCur && count > 0) {
      runs.push({
        start: runStartFrame,
        frames: count - runStartFrame,
        size: curSize,
        samplesPerFrame: curSpf,
        sampleRate: curRate,
        startPos: runStartPos,
      });
    }

    let accFrames = 0;
    let accSec = 0;
    for (const r of runs) {
      r.startAbs = accFrames;
      r.startSec = accSec;
      accFrames += r.frames;
      accSec += (r.frames * r.samplesPerFrame) / r.sampleRate;
    }
    if (accFrames === 0) throw new ASRError("MP3: không tìm thấy frame nào hợp lệ");

    const auCount = accFrames;
    let lastRunIdx = 0;
    const runFor = (i) => {
      const cur = runs[lastRunIdx];
      if (cur && i >= cur.startAbs && i < cur.startAbs + cur.frames) return cur;
      const nxt = runs[lastRunIdx + 1];
      if (nxt && i >= nxt.startAbs && i < nxt.startAbs + nxt.frames) {
        lastRunIdx += 1;
        return nxt;
      }
      let lo = 0;
      let hi = runs.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (i < runs[mid].startAbs) hi = mid - 1;
        else lo = mid + 1;
      }
      lastRunIdx = hi >= 0 ? hi : 0;
      return runs[lastRunIdx];
    };
    const sampleRateRef = runs[0].sampleRate;

    const track = {
      codec: "mp3",
      sampleRate: sampleRateRef,
      auCount,
      durationS: accSec,
      auDtsS: (i) => {
        if (!Number.isInteger(i) || i < 0 || i >= auCount) throw new ASRError(`frame ${i} ngoài phạm vi`);
        const r = runFor(i);
        return r.startSec + ((i - r.startAbs) * r.samplesPerFrame) / r.sampleRate;
      },
      auIndexAtS: (s) => {
        if (!(s > 0)) return 0;
        let lo = 0;
        let hi = runs.length - 1;
        let ans = runs.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const r = runs[mid];
          const spanS = (r.frames * r.samplesPerFrame) / r.sampleRate;
          if (s < r.startSec + spanS) {
            ans = mid;
            hi = mid - 1;
          } else {
            lo = mid + 1;
          }
        }
        const r = runs[ans];
        return Math.min(auCount - 1, r.startAbs + Math.floor(((s - r.startSec) * r.sampleRate) / r.samplesPerFrame));
      },
      auLocation: (i) => {
        if (!Number.isInteger(i) || i < 0 || i >= auCount) throw new ASRError(`frame ${i} ngoài phạm vi`);
        const r = runFor(i);
        return { pos: r.startPos + (i - r.startAbs) * r.size, size: r.size };
      },
      *iterateAus(fromAu = 0, toAuExclusive = auCount) {
        if (!Number.isInteger(fromAu) || !Number.isInteger(toAuExclusive)) {
          throw new ASRError(`MP3 iterateAus [${fromAu},${toAuExclusive}) không phải số nguyên`);
        }
        if (fromAu < 0 || toAuExclusive > auCount || toAuExclusive < fromAu) {
          throw new ASRError(`MP3 iterateAus [${fromAu},${toAuExclusive}) ngoài [0,${auCount}]`);
        }
        for (let i = fromAu; i < toAuExclusive; i++) {
          const loc = track.auLocation(i);
          yield { index: i, ...loc, dtsS: track.auDtsS(i) };
        }
      },
    };
    return { kind: "mp3", durationS: track.durationS, track, resyncs };
  } finally {
    fs.closeSync(fd);
  }
}
