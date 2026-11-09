/** Synchronized LRC Lyrics renderer and atomic writer. */

import { atomicWriteText } from "../util/io-fast.js";

function msToLrc(ms) {
  const safe = Math.max(0, Math.floor(ms));
  const m = Math.floor(safe / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const cs = Math.floor((safe % 1000) / 10);
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`;
}

export function renderLrc(cues) {
  return (
    cues
      .map((c) => {
        const a = c.startMs != null ? c.startMs : c.rawStartMs != null ? c.rawStartMs : Math.round(c.start * 1000);
        return `${msToLrc(a)}${c.text}`;
      })
      .join("\n") + "\n"
  );
}

export { atomicWriteText as atomicWriteLrc };
