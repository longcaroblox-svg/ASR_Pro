/** RAW server utterance export — JianYing server fidelity 1:1.
 * Accepts internal rows {startMs,endMs,text} (as produced by the result
 * parser) and projects them back to the SERVER field names
 * {start_time,end_time,text}: integers in, integers out. Nothing rounded or
 * reordered — the JSON sidecar is field-for-field the server payload. */

import { atomicWrite } from "./srt.js";

export function writeRawUtterances(filePath, provider = "server", rows = []) {
  const raw = {
    provider,
    utterances: rows.map((row) => ({
      start_time: row.startMs,
      end_time: row.endMs,
      text: row.text,
    })),
  };
  atomicWrite(filePath, JSON.stringify(raw, null, 2));
}
