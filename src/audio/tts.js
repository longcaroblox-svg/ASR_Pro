/**
 * CapCut Native Cloud Text-to-Speech (TTS) Engine — 100% Reverse-Engineered from CapCut Desktop.
 * Calls ByteDance / CapCut SAMI Cloud TTS API directly with genuine ByteDance voices.
 * Pure Node.js implementation, zero external dependencies, zero Python.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ASRError } from "../core/errors.js";

const BASE_URL = "https://editor-api-sg.capcutapi.com";

// Public key extracted directly from videoeditor.dll (RVA 0x3122b5f)
const TTS_SIGN_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmTd34Lw4b7IuldSXh/zY
CMla+ITdGG5TeWz6ad+OySd4r+IrY45AoqrYUxhQ2dl+7z+i7r/5vEa8rr39BYfB
8AGMQLmZA8HmgpWBsqrn/V6daUALkKnkLb70Fn32CJigIuGXAYqxUdGuI340aC+0
v5Es3puJsHyzf01/AelE4Cdc6bZhQrASJLBh8R3BQToYClmDVSDUQk28o8sl/guA
Z4n303Vj+6Siv1HayPCdV6kpVVnMBAG4+umUbwGmn132N3fgpzLarFF3XyWmS1zh
D/J07iM/rP8GDO9IskHNHd2phrO0G6KzrcFAnTBHjVv+hCBEfzN/no3FNA9AuC36
mwIDAQAB
-----END PUBLIC KEY-----`;

export const CAPCUT_VOICES = {
  // 10 giọng đọc tiếng Việt chuẩn CapCut
  "BV074_streaming": { name: "Cô Gái Hoạt Ngôn", voice_type: "BV074_streaming", resource_id: "7102355709945188865" },
  "BV075_streaming": { name: "Thanh Niên Tự Tin", voice_type: "BV075_streaming", resource_id: "7102355803792740865" },
  "vi_female_huong": { name: "Giọng Nữ Phổ Thông", voice_type: "vi_female_huong", resource_id: "7264854897953083905" },
  "BV421_vivn_streaming": { name: "Nguồn Nhỏ Ngọt Ngào", voice_type: "BV421_vivn_streaming", resource_id: "7252594014782755330" },
  "BV560_streaming": { name: "Anh Dũng", voice_type: "BV560_streaming", resource_id: "7483736167565758992" },
  "BV562_streaming": { name: "Chí Mai", voice_type: "BV562_streaming", resource_id: "7483736254694035984" },
  "BV075_streaming_vibrato_dsp": { name: "Việt Rung", voice_type: "BV075_streaming_vibrato_dsp", resource_id: "7569450639810465040" },
  "BV075_streaming_demon_dsp": { name: "Quỷ Việt", voice_type: "BV075_streaming_demon_dsp", resource_id: "7569442422665661712" },
  "BV074_streaming_dsp": { name: "giọng bé", voice_type: "BV074_streaming_dsp", resource_id: "7550087831092251920" },
  "BV075_streaming_robot_dsp": { name: "Robot VN", voice_type: "BV075_streaming_robot_dsp", resource_id: "7538698409633516816" },

  // Alias thân thiện bằng chữ thường không dấu / có dấu
  "co-gai-hoat-ngon": { name: "Cô Gái Hoạt Ngôn", voice_type: "BV074_streaming", resource_id: "7102355709945188865" },
  "thanh-nien-tu-tin": { name: "Thanh Niên Tự Tin", voice_type: "BV075_streaming", resource_id: "7102355803792740865" },
  "nu-pho-thong": { name: "Giọng Nữ Phổ Thông", voice_type: "vi_female_huong", resource_id: "7264854897953083905" },
  "nho-ngot-ngao": { name: "Nguồn Nhỏ Ngọt Ngào", voice_type: "BV421_vivn_streaming", resource_id: "7252594014782755330" },
  "anh-dung": { name: "Anh Dũng", voice_type: "BV560_streaming", resource_id: "7483736167565758992" },
  "chi-mai": { name: "Chí Mai", voice_type: "BV562_streaming", resource_id: "7483736254694035984" },
  "viet-rung": { name: "Việt Rung", voice_type: "BV075_streaming_vibrato_dsp", resource_id: "7569450639810465040" },
  "quy-viet": { name: "Quỷ Việt", voice_type: "BV075_streaming_demon_dsp", resource_id: "7569442422665661712" },
  "giong-be": { name: "giọng bé", voice_type: "BV074_streaming_dsp", resource_id: "7550087831092251920" },
  "robot-vn": { name: "Robot VN", voice_type: "BV075_streaming_robot_dsp", resource_id: "7538698409633516816" },
};

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeHeaders(endpoint, deviceId, bodyStr) {
  const now = String(Math.floor(Date.now() / 1000));
  const sign = crypto
    .createHash("md5")
    .update(`9e2c|${endpoint.slice(-7)}|3|8.7.0|${now}|${deviceId}|11ac`, "utf8")
    .digest("hex");
  const seed = crypto.randomUUID().replace(/-/g, "");
  return {
    "content-type": "application/json",
    appvr: "8.7.0",
    ch: "capcutpc_google",
    "device-time": now,
    lan: "vi-VN",
    loc: "VN",
    pf: "3",
    "sign-ver": "1",
    tdid: deviceId,
    "x-ss-stub": crypto.createHash("md5").update(bodyStr, "utf8").digest("hex"),
    "x-ss-dp": "359289",
    "x-khronos": now,
    "x-tt-trace-id": `00-${seed}-${seed.slice(0, 16)}-01`,
    "user-agent": "Cronet/TTNetVersion:1d7cc3b1 2025-07-16 QuicVersion:52c2b40d 2025-04-03",
    "store-country-code": "vn",
    "store-country-code-src": "did",
    "is-dispatch-us-ttp": "0",
    "is-app-region-us-ttp": "0",
    "app-sdk-version": "8.7.0",
    appid: "359289",
    sign,
  };
}

/**
 * Generate AI voice speech using CapCut's Native Cloud TTS API.
 * @param {string} text - Text to synthesize
 * @param {string} outputPath - Target MP3 file path
 * @param {{voice?: string, rate?: string, deviceId?: string, onProgress?: Function}} options
 * @returns {Promise<{outputPath: string, sizeBytes: number, voice: string, voiceType: string, speechUrl: string}>}
 */
export async function textToSpeech(
  text,
  outputPath,
  { voice = "BV074_streaming", rate = "1.0", deviceId = "76471456455646328721", onProgress = () => {} } = {},
) {
  const clean = String(text || "").trim();
  if (!clean) {
    throw new ASRError("Văn bản chuyển giọng nói (TTS) rỗng");
  }

  const v =
    CAPCUT_VOICES[voice] ||
    Object.values(CAPCUT_VOICES).find((x) => x.voice_type === voice || x.name === voice) ||
    CAPCUT_VOICES["BV074_streaming"];
  const voiceType = v.voice_type;
  const resourceId = v.resource_id;

  onProgress(10, `CapCut Cloud TTS · Chuẩn bị giọng [${v.name}]…`);

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
    <voice name="${voiceType}" mock_tone_info="" platform="sami" resource_id="${resourceId}" emotion="" emotion_scale="0" style="" role="" moyin_emotion="" is_clone_tone="false" need_subtitle_timestamp="false">
        <prosody rate="${rate}">${escapeXml(clean)}</prosody>
    </voice>
</speak>`;

  const ssmlMd5 = crypto.createHash("md5").update(ssml, "utf8").digest("hex");
  const extraInfo = JSON.stringify({ benefit_info: {} });
  const signInput = `appid:359289&did:${deviceId}&creditDisable:false&ssml:${ssmlMd5}&extraInfo:${extraInfo}`;
  const rsaSign = crypto
    .publicEncrypt({ key: TTS_SIGN_PUBLIC_KEY_PEM, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(signInput, "utf8"))
    .toString("base64");

  const babi = {
    feature_entrance: "editor",
    feature_entrance_detail: "editor-feature-text_to_speech",
    feature_key: "text_to_speech",
    scenario: "video_editor",
  };

  const payload = {
    audio_format: "mp3",
    babi_param: JSON.stringify(babi),
    credit_disable: false,
    extra_info: extraInfo,
    need_merge_voice: false,
    need_subtitle_timestamp: false,
    scene: "text_to_speech",
    ssml,
    sign: rsaSign,
  };

  const bodyObj = {
    bind_id: crypto.randomUUID(),
    can_queue: true,
    enter_from: "text_to_speech",
    tasks: [
      {
        context: crypto.randomUUID(),
        payload: JSON.stringify(payload),
        req_key: "sami_text_to_speech",
        task_version: "v3",
      },
    ],
  };
  const bodyStr = JSON.stringify(bodyObj);

  const query = new URLSearchParams({
    app_name: "CapCut",
    device_type: "MacBookPro17,4",
    os_version: "15.7.4",
    channel: "capcutpc_google",
    version_name: "8.7.0",
    device_brand: "MacBookPro17,4",
    device_id: deviceId,
    iid: deviceId,
    version_code: "8.7.0",
    device_platform: "mac",
    aid: "359289",
    region: "VN",
    babi_param: JSON.stringify(babi),
  }).toString();

  onProgress(30, "CapCut Cloud TTS · Tạo task tổng hợp giọng nói…");
  const createUrl = `${BASE_URL}/lv/v1/common_task/new?${query}`;
  const headers = makeHeaders("/lv/v1/common_task/new", deviceId, bodyStr);

  const res = await fetch(createUrl, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  const data = await res.json();
  if (data.ret !== "0" && data.ret !== 0) {
    throw new ASRError(`CapCut TTS task creation failed: ${JSON.stringify(data)}`);
  }

  const tasks = data?.data?.tasks;
  if (!tasks || tasks.length === 0) {
    throw new ASRError(`CapCut TTS không tạo được task: ${JSON.stringify(data)}`);
  }

  const task = tasks[0];
  const taskId = task.id;
  const token = task.token;

  onProgress(50, `CapCut Cloud TTS · Đang xử lý task [${taskId}]…`);

  // Poll for completion
  const queryUrl = `${BASE_URL}/lv/v1/common_task/query?${query}`;

  for (let attempt = 1; attempt <= 15; attempt++) {
    await new Promise((r) => setTimeout(r, 1200));
    const qBodyStr = JSON.stringify({ tasks: [{ id: taskId, token }] });
    const qHeaders = makeHeaders("/lv/v1/common_task/query", deviceId, qBodyStr);
    const qRes = await fetch(queryUrl, {
      method: "POST",
      headers: qHeaders,
      body: qBodyStr,
    });
    const qData = await qRes.json();
    const polled = qData?.data?.tasks?.[0];

    if (polled?.status === "succeed") {
      onProgress(80, "CapCut Cloud TTS · Tổng hợp thành công, đang tải audio từ TikTok CDN…");
      const payloadObj = JSON.parse(polled.payload);
      const speechUrl = payloadObj?.audio_subtitles?.[0]?.speech_url;
      if (!speechUrl) throw new ASRError("Không tìm thấy speech_url trong kết quả CapCut TTS");

      const audioRes = await fetch(speechUrl);
      const audioBuf = Buffer.from(await audioRes.arrayBuffer());

      const resolvedOut = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
      fs.writeFileSync(resolvedOut, audioBuf);

      onProgress(100, `Hoàn tất giọng đọc CapCut: ${resolvedOut} (${(audioBuf.length / 1024).toFixed(1)} KB)`);

      return {
        outputPath: resolvedOut,
        sizeBytes: audioBuf.length,
        voice: v.name,
        voiceType,
        speechUrl,
      };
    } else if (polled?.status === "failed") {
      throw new ASRError(`CapCut TTS thất bại: ${polled.err_msg || "Unknown error"}`);
    }
  }

  throw new ASRError("CapCut TTS timeout sau 18 giây");
}
