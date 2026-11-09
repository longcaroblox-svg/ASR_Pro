/** Clean transcript text renderer and atomic writer. */

import { atomicWriteText } from "../util/io-fast.js";

export function renderTxt(cues) {
  return cues.map((c) => String(c.text || "").trim()).filter(Boolean).join("\n") + "\n";
}

export { atomicWriteText as atomicWriteTxt };
