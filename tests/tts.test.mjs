import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { textToSpeech, CAPCUT_VOICES } from "../src/audio/tts.js";

test("CAPCUT_VOICES contains 10 authentic Vietnamese CapCut voices", () => {
  const expectedVoices = [
    "BV074_streaming",
    "BV075_streaming",
    "vi_female_huong",
    "BV421_vivn_streaming",
    "BV560_streaming",
    "BV562_streaming",
    "BV075_streaming_vibrato_dsp",
    "BV075_streaming_demon_dsp",
    "BV074_streaming_dsp",
    "BV075_streaming_robot_dsp",
  ];

  for (const voiceId of expectedVoices) {
    assert.ok(CAPCUT_VOICES[voiceId], `Missing voice: ${voiceId}`);
    assert.ok(CAPCUT_VOICES[voiceId].resource_id, `Missing resource_id for: ${voiceId}`);
    assert.ok(CAPCUT_VOICES[voiceId].name, `Missing name for: ${voiceId}`);
  }

  // Check alias mappings
  assert.strictEqual(CAPCUT_VOICES["co-gai-hoat-ngon"].voice_type, "BV074_streaming");
  assert.strictEqual(CAPCUT_VOICES["thanh-nien-tu-tin"].voice_type, "BV075_streaming");
  assert.strictEqual(CAPCUT_VOICES["nu-pho-thong"].voice_type, "vi_female_huong");
});

test("textToSpeech synthesizes speech with CapCut Cloud API", async () => {
  const tmpOut = path.join(os.tmpdir(), `test_tts_${Date.now()}.mp3`);
  try {
    const res = await textToSpeech(
      "Xin chào bạn, đây là thử nghiệm giọng đọc CapCut chính hãng 100%",
      tmpOut,
      { voice: "BV074_streaming", rate: "1.0" }
    );
    assert.strictEqual(res.outputPath, tmpOut);
    assert.ok(fs.existsSync(tmpOut));
    assert.ok(res.sizeBytes > 1000);
    assert.strictEqual(res.voice, "Cô Gái Hoạt Ngôn");
    assert.strictEqual(res.voiceType, "BV074_streaming");
  } finally {
    try { fs.unlinkSync(tmpOut); } catch {}
  }
});
