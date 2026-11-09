/** WebVTT renderer and atomic writer. */

import { atomicWriteText } from "../util/io-fast.js";

function msToVtt(ms) {
  const safe = Math.max(0, Math.floor(ms));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const rem = safe % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(rem).padStart(3, "0")}`;
}

export function renderVtt(cues) {
  const header = "WEBVTT\n\n";
  const body = cues
    .map((c, i) => {
      const a = c.startMs != null ? c.startMs : c.rawStartMs != null ? c.rawStartMs : Math.round(c.start * 1000);
      const b = c.endMs != null ? c.endMs : c.rawEndMs != null ? c.rawEndMs : Math.round(c.end * 1000);
      return `${i + 1}\n${msToVtt(a)} --> ${msToVtt(b)}\n${c.text}`;
    })
    .join("\n\n");
  return header + body + "\n";
}

export { atomicWriteText as atomicWriteVtt };
