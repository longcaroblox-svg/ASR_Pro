/** Pure-Node Raw ADTS (.aac) Frame Scanner — closes the --extract <-> ASR loop.
 * Parses MPEG-4 / MPEG-2 ADTS frames (7-byte or 9-byte with CRC16), collapses
 * identical-size runs, and exposes the standard O(1)/O(log R) unit accessor surface. */

import fs from "node:fs";
import { ASRError } from "../core/errors.js";
import { AAC_FREQ_TABLE } from "./mp4.js";

const _adtsScratch = {
  profile: 0,
  freqIdx: 0,
  sampleRate: 0,
  chanCfg: 0,
  frameLength: 0,
  headerLen: 7,
  samplesPerFrame: 1024,
};

export function parseAdtsHeaderInto(b, out) {
  if (b.length < 7) return false;
  if (b[0] !== 0xff || (b[1] & 0xf6) !== 0xf0) return false;
  const protectionAbsent = b[1] & 0x01;
  const profile = (b[2] >> 6) & 0x03;
  const freqIdx = (b[2] >> 2) & 0x0f;
  if (freqIdx >= AAC_FREQ_TABLE.length) return false;
  const chanCfg = ((b[2] & 0x01) << 2) | ((b[3] >> 6) & 0x03);
  if (chanCfg === 0 || chanCfg > 7) return false;
  const frameLength = ((b[3] & 0x03) << 11) | (b[4] << 3) | ((b[5] >> 5) & 0x07);
  const headerLen = protectionAbsent ? 7 : 9;
  if (frameLength < headerLen || frameLength > 0x1fff) return false;
  const numBlocks = (b[6] & 0x03) + 1;
  out.profile = profile;
  out.freqIdx = freqIdx;
  out.sampleRate = AAC_FREQ_TABLE[freqIdx];
  out.chanCfg = chanCfg;
  out.frameLength = frameLength;
  out.headerLen = headerLen;
  out.samplesPerFrame = numBlocks * 1024;
  return true;
}

export function inspectAac(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const fileSize = fs.fstatSync(fd).size;
    let pos = 0;
    const magic = Buffer.alloc(10);
    const magicRead = fs.readSync(fd, magic, 0, 10, 0);
    if (magicRead >= 10 && magic.toString("latin1", 0, 3) === "ID3") {
      for (let k = 6; k <= 9; k++) {
        if (magic[k] & 0x80) throw new ASRError("AAC: ID3 syncsafe size hỏng");
      }
      const size =
        ((magic[6] & 0x7f) << 21) | ((magic[7] & 0x7f) << 14) | ((magic[8] & 0x7f) << 7) | (magic[9] & 0x7f);
      pos = 10 + size + (magic[5] & 0x10 ? 10 : 0);
      if (!(pos >= 10 && pos <= fileSize)) {
        throw new ASRError(`AAC: ID3 tag vượt EOF (${pos} > ${fileSize})`);
      }
    }

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
    const readAt = (p) => {
      if (p < 0 || p + 7 > fileSize) return null;
      if (p < winStart || p + 7 > winEnd) {
        loadWin(p);
        if (p < winStart || p + 7 > winEnd) return null;
      }
      return winBuf.subarray(p - winStart, p - winStart + 7);
    };

    const runs = [];
    let count = 0;
    let runStartPos = pos;
    let runStartFrame = 0;
    let haveCur = false;
    let curSize = 0;
    let curSpf = 0;
    let curRate = 0;
    let freqIdxRef = 4;
    let chanCfgRef = 2;
    let aotRef = 2;

    for (;;) {
      const b = readAt(pos);
      if (b === null) break;
      if (!parseAdtsHeaderInto(b, _adtsScratch)) {
        throw new ASRError(`AAC ADTS: sync word hỏng tại offset ${pos} — NO-FALLBACK`);
      }
      const headSize = _adtsScratch.frameLength;
      const headSpf = _adtsScratch.samplesPerFrame;
      const headRate = _adtsScratch.sampleRate;
      if (pos + headSize > fileSize) break;
      if (!haveCur) {
        freqIdxRef = _adtsScratch.freqIdx;
        chanCfgRef = _adtsScratch.chanCfg;
        aotRef = _adtsScratch.profile + 1;
      }
      if (haveCur && curSize === headSize && curSpf === headSpf && curRate === headRate) {
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
    if (accFrames === 0) throw new ASRError("AAC ADTS: không tìm thấy frame hợp lệ");

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

    const track = {
      codec: "aac",
      audioObjectType: aotRef,
      freqIdx: freqIdxRef,
      chanCfg: chanCfgRef,
      sampleRate: runs[0].sampleRate,
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
          throw new ASRError(`AAC iterateAus [${fromAu},${toAuExclusive}) không phải số nguyên`);
        }
        if (fromAu < 0 || toAuExclusive > auCount || toAuExclusive < fromAu) {
          throw new ASRError(`AAC iterateAus [${fromAu},${toAuExclusive}) ngoài [0,${auCount}]`);
        }
        for (let i = fromAu; i < toAuExclusive; i++) {
          const loc = track.auLocation(i);
          yield { index: i, ...loc, dtsS: track.auDtsS(i) };
        }
      },
    };
    return { kind: "aac", durationS: track.durationS, track };
  } finally {
    fs.closeSync(fd);
  }
}
