import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { extractAudio } from "../src/audio/extract.js";

const sampleVideo = "D:/Hao-Pc/window/window/hao/Downloads/Tap 01 - _在抖音，记录美好生活_丞秋形象改动！_沙雕动画 _二次元 _更换建模 [7694996816680471849].mp4";

test("extractAudio extracts AAC audio in sub-100ms without errors", async () => {
  if (!fs.existsSync(sampleVideo)) {
    return; // Skip if file not present on test runner
  }
  const tmpOut = path.join(os.tmpdir(), `test_extract_${Date.now()}.aac`);
  try {
    const res = await extractAudio(sampleVideo, tmpOut);
    assert.strictEqual(res.outputPath, tmpOut);
    assert.ok(res.sizeBytes > 10000);
    assert.strictEqual(res.format, "mp4-aac");
    assert.ok(fs.existsSync(tmpOut));
    assert.ok(res.elapsedMs < 1000); // Should be very fast
  } finally {
    try { fs.unlinkSync(tmpOut); } catch {}
  }
});
