/** Run metadata writer. */

import { atomicWrite } from "./srt.js";

const METADATA_DEFAULTS = Object.freeze({
  product: "ASRStudio UltraX (NodeJS)",
  version: "unknown",
  input: null,
  output: null,
  model: null,
  language: "auto",
  chunks: 0,
  cues: 0,
  elapsed_seconds: 0,
  metrics: null,
});

export function buildRunMetadata(fields = {}) {
  return { ...METADATA_DEFAULTS, ...fields };
}

export function writeMetadata(filePath, data) {
  atomicWrite(filePath, JSON.stringify(data, null, 2));
}
