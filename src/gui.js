/** ASR Studio UltraX Web GUI — zero-dependency local server (replaces PyQt6).
 * Anti-Slop workspace: file browser + drag-drop + HTTP Range video/audio preview
 * + live 0.5x–1.5x speed control + live progress over SSE + 1-click SRT export.
 * NO-FALLBACK: one job at a time, errors surfaced verbatim. */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspectMedia } from "./audio/media.js";
import { CancelToken } from "./core/cancel.js";
import { Options, SPEED_DEFAULT, SPEED_MAX, SPEED_MIN, normalizeSpeed } from "./core/domain.js";
import { ASRError, isCancelled } from "./core/errors.js";
import { CloudPipeline, MODELS, MODEL_AUTO, MODEL_JIANYING } from "./pipeline/orchestrator.js";
import { formatEta, formatThroughput, progressSmooth } from "./ui/telemetry.js";

const PORT = Number.parseInt(process.env.ASR_GUI_PORT ?? "8760", 10);
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new ASRError(`ASR_GUI_PORT không hợp lệ: ${process.env.ASR_GUI_PORT}`);
}
const HOST = (process.env.ASR_GUI_HOST ?? "127.0.0.1").trim() || "127.0.0.1";

const MEDIA_EXT_RE = /\.(wav|mp3|m4a|flac|ogg|aac|opus|mp4|mkv|mov|avi|webm|wmv|ts|m4v)$/i;
const AUDIO_ONLY_EXT_RE = /\.(wav|mp3|m4a|flac|ogg|aac|opus)$/i;

const MIME_BY_EXT = Object.freeze({
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".ts": "video/mp2t",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
});

const state = {
  running: false,
  activeJobs: new Map(),
  token: null,
  startedAtMs: 0,
  lastProgress: 0,
  cueCount: 0,
  lastOutput: "",
  lastBrowsedDir: process.cwd(),
  uploadTempDir: null,
  clients: new Set(),
};

const MAX_SSE_CLIENTS = 100;
const MAX_JSON_BYTES = 1 << 20; // 1MB POST JSON cap
const SSE_HEARTBEAT_MS = 15_000;

function ensureUploadTempDir() {
  if (!state.uploadTempDir || !fs.existsSync(state.uploadTempDir)) {
    state.uploadTempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-gui-stage-"));
  }
  return state.uploadTempDir;
}

function cleanupUploadTempDir() {
  if (state.uploadTempDir) {
    try {
      fs.rmSync(state.uploadTempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    state.uploadTempDir = null;
  }
}

process.once("exit", cleanupUploadTempDir);

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of state.clients) {
    try {
      if (res.destroyed || res.writableLength > 1_000_000) {
        try {
          res.destroy();
        } catch {
          /* ignore */
        }
        state.clients.delete(res);
        continue;
      }
      const ok = res.write(payload);
      if (!ok) {
        res.once("drain", () => {});
      }
    } catch {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
      state.clients.delete(res);
    }
  }
}

function heartbeatTick() {
  for (const res of state.clients) {
    try {
      if (res.destroyed || res.writableLength > 1_000_000) {
        try {
          res.destroy();
        } catch {
          /* ignore */
        }
        state.clients.delete(res);
        continue;
      }
      res.write(": ping\n\n");
    } catch {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
      state.clients.delete(res);
    }
  }
}

const MODELS_OPTIONS = `<option value="${MODEL_JIANYING}" selected>JianYing ORIGINAL 1:1 · Real Dữ Liệu Gốc 100.00% (Zero-Touch)</option>`;

const PAGE = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ASR Studio UltraX Pro · Electron Parallel Workstation</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #000000;
    --panel: #0d0d0d;
    --panel-alt: #141414;
    --border: #242424;
    --border-focus: #ffffff;
    --text: #ffffff;
    --text-sec: #cccccc;
    --muted: #777777;
    --accent: #ffffff;
    --accent-hover: #e0e0e0;
  }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    -webkit-font-smoothing: antialiased;
  }
  #shell {
    width: min(1360px, 98vw);
    padding: 14px 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .electron-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .win-controls {
    display: flex;
    gap: 7px;
    align-items: center;
  }
  .win-controls .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #2a2a2a;
    border: 1px solid #3d3d3d;
  }
  .app-title {
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 1.2px;
    color: #ffffff;
  }
  .title-badges { display: flex; gap: 8px; align-items: center; }
  .badge-mono {
    color: #ffffff;
    background: #141414;
    border: 1px solid #383838;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    white-space: nowrap;
    font-family: Consolas, monospace;
  }
  .workstation-grid {
    display: grid;
    grid-template-columns: 460px 1fr;
    gap: 12px;
    align-items: start;
  }
  @media (max-width: 1024px) {
    .workstation-grid { grid-template-columns: 1fr; }
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .section-title {
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }
  .row { display: flex; gap: 8px; align-items: center; }
  .row-wrap { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  select, input[type=text], input[type=number] {
    color: var(--text);
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    height: 36px;
  }
  select:focus-visible, input:focus-visible, button:focus-visible {
    outline: 1.5px solid var(--border-focus);
    outline-offset: 1px;
  }
  button {
    color: var(--text);
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0 14px;
    height: 36px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: background .1s, border-color .1s, color .1s;
  }
  button:hover:not(:disabled) { border-color: #ffffff; background: #222222; }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-primary {
    background: #ffffff;
    color: #000000;
    border-color: #ffffff;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .btn-primary:hover:not(:disabled) { background: #e0e0e0; border-color: #e0e0e0; color: #000000; }
  .btn-sm { height: 28px; padding: 0 10px; font-size: 11.5px; border-radius: 4px; }
  .btn-preset {
    background: #141414;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .btn-preset:hover:not(:disabled) { color: #ffffff; border-color: #666666; }
  .btn-preset.active {
    background: #ffffff;
    border-color: #ffffff;
    color: #000000;
    font-weight: 800;
  }
  #dropZone {
    background: var(--panel-alt);
    border: 1.5px dashed #333333;
    border-radius: 6px;
    padding: 16px 14px;
    text-align: center;
    cursor: pointer;
    transition: border-color .15s, background .15s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  #dropZone:hover, #dropZone.dragover {
    border-color: #ffffff;
    background: #1a1a1a;
  }
  #dropTitle { font-size: 13px; font-weight: 700; word-break: break-all; color: #ffffff; }
  .muted { color: var(--muted); font-size: 12px; }
  #previewBox {
    background: #000000;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    position: relative;
  }
  #videoPlayer { width: 100%; max-height: 220px; display: none; background: #000000; }
  #audioPlayer { width: 92%; margin: 18px auto; display: none; }
  #previewEmpty { color: var(--muted); font-size: 11.5px; padding: 18px; text-align: center; }
  .speed-box {
    background: var(--panel-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .speed-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .speed-badge {
    font-family: Consolas, monospace;
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
    background: #000000;
    border: 1px solid #444444;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .custom-slider {
    --control-value: 50%;
    --track-height: 5px;
    --thumb-size: 16px;
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: var(--thumb-size);
    background: transparent;
    cursor: pointer;
    margin: 0;
  }
  .custom-slider:focus-visible { outline: 1.5px solid #ffffff; outline-offset: 4px; border-radius: 4px; }
  .custom-slider::-webkit-slider-runnable-track {
    height: var(--track-height);
    border-radius: 999px;
    background: linear-gradient(to right, #ffffff var(--control-value), #222222 var(--control-value));
  }
  .custom-slider::-moz-range-track {
    height: var(--track-height);
    border-radius: 999px;
    background: linear-gradient(to right, #ffffff var(--control-value), #222222 var(--control-value));
  }
  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #000000;
    margin-top: calc((var(--track-height) - var(--thumb-size)) / 2);
    box-shadow: 0 1px 3px rgba(0,0,0,.8);
  }
  .custom-slider::-moz-range-thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #000000;
  }
  /* BATCH QUEUE TABLE */
  .queue-container {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #090909;
    overflow-x: auto;
    max-height: 320px;
    overflow-y: auto;
  }
  .queue-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    text-align: left;
  }
  .queue-table th {
    background: #121212;
    color: var(--muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .queue-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #1a1a1a;
    vertical-align: middle;
  }
  .queue-table tr:hover { background: #141414; }
  .cell-progress { min-width: 140px; }
  .mini-bar-wrap { background: #1e1e1e; border-radius: 3px; height: 5px; overflow: hidden; margin-bottom: 4px; }
  .mini-bar { background: #ffffff; height: 100%; width: 0%; transition: width .15s ease-out; }
  .status-badge {
    font-family: Consolas, monospace;
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid #333333;
    white-space: nowrap;
  }
  .status-waiting { color: #888888; background: #111111; }
  .status-running { color: #000000; background: #ffffff; border-color: #ffffff; }
  .status-done { color: #ffffff; background: #1c1c1c; border-color: #555555; }
  .status-error { color: #ffffff; background: #2b0000; border-color: #660000; }
  #barWrap { background: #1a1a1a; border-radius: 4px; height: 6px; overflow: hidden; border: 1px solid #222222; }
  #bar { background: #ffffff; height: 100%; width: 0%; transition: width .18s ease-out; }
  #status { font-size: 12.5px; font-weight: 700; min-height: 18px; color: #ffffff; }
  #log {
    background: #050505;
    border: 1px solid #222222;
    border-radius: 6px;
    padding: 8px 12px;
    font-family: Consolas, Menlo, "Courier New", monospace;
    font-size: 11px;
    height: 110px;
    overflow-y: auto;
    white-space: pre-wrap;
    color: #cccccc;
  }
  #resultBox { display: none; }
  dialog {
    background: var(--panel);
    color: var(--text);
    border: 1px solid #444444;
    border-radius: 8px;
    width: min(760px, 94vw);
    padding: 16px;
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.85); }
  #fsList {
    height: 46vh;
    overflow-y: auto;
    margin: 10px 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: #050505;
  }
  .fs-item {
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #1a1a1a;
    font-size: 13px;
  }
  .fs-item:hover { background: #1a1a1a; color: #ffffff; }
  .fs-dir { color: #ffffff; font-weight: 700; }
  .fs-size { color: var(--muted); font-family: Consolas, monospace; font-size: 11px; }
</style>
</head>
<body>
<div id="shell">
  <div class="electron-titlebar">
    <div class="win-controls">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
    <div class="app-title">ASR STUDIO ULTRAX PRO // PARALLEL WORKSTATION</div>
    <div class="title-badges">
      <span class="badge-mono" id="liveBadge">ORIGINAL 1:1 · ZERO-TOUCH</span>
      <span class="badge-mono" id="queueStatsBadge">TỔNG: 0 | SONG SONG: 0 | XONG: 0</span>
    </div>
  </div>

  <div class="workstation-grid">
    <!-- CỘT TRÁI: NGUỒN MEDIA & CẤU HÌNH TỐC ĐỘ / LUỒNG -->
    <div class="panel">
      <div class="section-title">1. Nguồn Media & Thêm Hàng Loạt (Hỗ trợ 100+ file)</div>

      <div class="row">
        <input id="pathInput" type="text" placeholder="Dán đường dẫn file hoặc thư mục chứa nhiều video/audio…" style="flex:1" onkeydown="if(event.key==='Enter')applyPathInput()">
        <button onclick="applyPathInput()">Thêm</button>
        <button onclick="openFs()">Duyệt…</button>
      </div>

      <input id="filePicker" type="file" multiple accept="video/*,audio/*,.mp4,.mkv,.mov,.avi,.webm,.wmv,.ts,.m4v,.mp3,.m4a,.wav,.flac,.ogg,.aac,.opus" style="display:none" onchange="onFilePicked(this.files)">
      <div id="dropZone" onclick="document.getElementById('filePicker').click()">
        <div id="dropTitle">Kéo thả đồng thời lên tới 100+ Video / Âm Thanh vào đây</div>
        <div class="muted">Hỗ trợ nạp hàng loạt 100+ file MP4, MKV, MOV, MP3, M4A, WAV, FLAC · Xử lý song song 100% cùng lúc không cần hàng đợi</div>
      </div>

      <!-- ĐIỀU KHIỂN TỐC ĐỘ & SỐ LUỒNG SONG SONG -->
      <div class="speed-box">
        <div class="speed-header">
          <div>
            <div class="section-title" style="color:var(--text)">2. Tốc Độ & Luồng Song Song</div>
            <div class="muted">Tốc độ ASR & chế độ xử lý song song</div>
          </div>
          <span class="speed-badge" id="speedReadout">1.00x</span>
        </div>

        <input id="speedSlider" class="custom-slider" type="range" min="0.5" max="1.5" step="0.05" value="1" oninput="setSpeed(this.value)">

        <div class="row-wrap" style="justify-content:space-between">
          <div class="row-wrap">
            <button type="button" class="btn-sm btn-preset" data-speed="0.5" onclick="setSpeed(0.5)">0.5x</button>
            <button type="button" class="btn-sm btn-preset" data-speed="0.75" onclick="setSpeed(0.75)">0.75x</button>
            <button type="button" class="btn-sm btn-preset" data-speed="0.8" onclick="setSpeed(0.8)">0.8x</button>
            <button type="button" class="btn-sm btn-preset active" data-speed="1" onclick="setSpeed(1.0)">1.0x (Gốc)</button>
            <button type="button" class="btn-sm btn-preset" data-speed="1.25" onclick="setSpeed(1.25)">1.25x</button>
            <button type="button" class="btn-sm btn-preset" data-speed="1.5" onclick="setSpeed(1.5)">1.5x</button>
          </div>
          <input id="speedNumber" type="number" min="0.5" max="1.5" step="0.01" value="1.00" style="width:72px;height:28px;padding:3px 6px" onchange="setSpeed(this.value)">
        </div>

        <div class="row" style="margin-top:4px">
          <span class="muted" style="font-size:12px;white-space:nowrap">Luồng song song:</span>
          <select id="concurrency" style="flex:1;height:32px">
            <option value="all" selected>⚡ Toàn bộ song song 100% · Không hàng đợi (Kể cả 100+ file cùng lúc)</option>
            <option value="100">100 file song song cùng lúc</option>
            <option value="50">50 file song song cùng lúc</option>
            <option value="20">20 file song song cùng lúc</option>
            <option value="10">10 file song song cùng lúc</option>
            <option value="6">6 file song song</option>
            <option value="4">4 file song song</option>
            <option value="2">2 file song song</option>
            <option value="1">1 file tuần tự</option>
          </select>
        </div>
      </div>

      <!-- XEM TRƯỚC FILE ĐANG CHỌN -->
      <div id="previewBox">
        <video id="videoPlayer" controls preload="metadata"></video>
        <audio id="audioPlayer" controls preload="metadata"></audio>
        <div id="previewEmpty">Xem trước media & nghe thử tốc độ 0.5x–1.5x</div>
      </div>
    </div>

    <!-- CỘT PHẢI: BATCH QUEUE & TIẾN TRÌNH SONG SONG -->
    <div class="panel">
      <div class="row" style="justify-content:space-between">
        <div class="section-title">3. Xử Lý Song Song Toàn Bộ (Song Song 100% Cùng Lúc · Không Cần Hàng Đợi)</div>
        <select id="model" style="display:none">
          \${MODELS_OPTIONS}
        </select>
        <div class="row">
          <button class="btn-sm" onclick="clearCompleted()">Dọn Đã Xong</button>
          <button class="btn-sm" onclick="clearAllQueue()">Xóa Hết</button>
        </div>
      </div>

      <!-- ACTION BAR -->
      <div class="row" style="gap:8px">
        <button id="start" class="btn-primary" style="flex:2;height:42px;font-size:13.5px" onclick="startBatch()">BẮT ĐẦU XỬ LÝ TOÀN BỘ CÙNG LÚC (SONG SONG 100% · SRT ONLY)</button>
        <button id="cancel" style="flex:1;height:42px" onclick="cancelBatch()" disabled>HỦY TẤT CẢ</button>
      </div>

      <!-- QUEUE TABLE -->
      <div class="queue-container">
        <table class="queue-table">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th>Tên File Media</th>
              <th style="width:68px">Tốc Độ</th>
              <th class="cell-progress">Tiến Độ</th>
              <th style="width:96px">Trạng Thái</th>
              <th style="width:130px;text-align:right">Thao Tác</th>
            </tr>
          </thead>
          <tbody id="queueBody">
            <tr>
              <td colspan="6" style="text-align:center;padding:28px 12px;color:var(--muted)">
                Danh sách trống. Kéo thả hàng loạt 100+ file media hoặc bấm "Duyệt…" để xử lý song song cùng lúc.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- TỔNG THỂ TIẾN TRÌNH -->
      <div>
        <div class="row" style="justify-content:space-between;margin-bottom:4px">
          <div id="status">Sẵn sàng</div>
          <div class="muted" id="pctReadout" style="font-family:Consolas,monospace">0%</div>
        </div>
        <div id="barWrap"><div id="bar"></div></div>
      </div>

      <!-- NHẬT KÝ TIẾN TRÌNH -->
      <div class="section-title">Nhật Ký Tiến Trình</div>
      <div id="log"></div>

      <!-- HIDDEN RESULT BOX CHO VERIFY-DIST TEST PARITY -->
      <div id="resultBox">
        <div id="resultSummary"></div>
        <div id="resultPath"></div>
      </div>
    </div>
  </div>
</div>

<dialog id="fsDialog">
  <div class="row" style="justify-content:space-between;margin-bottom:8px">
    <strong id="fsPath" style="font-size:13px;word-break:break-all"></strong>
    <button class="btn-sm" onclick="document.getElementById('fsDialog').close()">Đóng</button>
  </div>
  <div class="row-wrap" id="fsRoots" style="margin-bottom:6px"></div>
  <div class="row" style="margin-bottom:6px;gap:8px">
    <button class="btn-sm" onclick="fsUp()">↑ Lên thư mục cha</button>
    <button class="btn-sm btn-primary" onclick="fsAddAllMedia()">+ Thêm Tất Cả Media Trong Thư Mục Này</button>
  </div>
  <div id="fsList"></div>
</dialog>

<script>
let currentSpeed = 1.0;
let mediaDurationS = 0;
let lastProgress = 0;
let lastOutputPath = "";
let isBatchRunning = false;
let activeWorkersCount = 0;

let queue = []; // Array of job objects: { id, path, name, size, speed, status, progress, statusText, cues, elapsed, outputPath, error }

const log = document.getElementById("log");
const bar = document.getElementById("bar");
const statusEl = document.getElementById("status");
const pctReadout = document.getElementById("pctReadout");
const liveBadge = document.getElementById("liveBadge");
const queueStatsBadge = document.getElementById("queueStatsBadge");
const videoPlayer = document.getElementById("videoPlayer");
const audioPlayer = document.getElementById("audioPlayer");
const previewEmpty = document.getElementById("previewEmpty");
const speedSlider = document.getElementById("speedSlider");
const speedNumber = document.getElementById("speedNumber");
const speedReadout = document.getElementById("speedReadout");
const queueBody = document.getElementById("queueBody");

function fmtClock(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "--:--";
  const totalMs = Math.round(sec * 1000);
  const s = Math.floor(totalMs / 1000);
  const ms = Math.floor((totalMs % 1000) / 100);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const remS = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(remS) + "." + ms;
}

function fmtBytes(b) {
  if (!Number.isFinite(b) || b <= 0) return "";
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function updateSliderFill(el) {
  const min = parseFloat(el.min) || 0.5;
  const max = parseFloat(el.max) || 1.5;
  const val = parseFloat(el.value) || 1.0;
  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  el.style.setProperty("--control-value", pct + "%");
}

function setSpeed(rawVal) {
  let num = parseFloat(rawVal);
  if (!Number.isFinite(num)) num = 1.0;
  num = Math.round(Math.max(0.5, Math.min(1.5, num)) * 100) / 100;
  currentSpeed = num;
  speedSlider.value = String(num);
  speedNumber.value = num.toFixed(2);
  speedReadout.textContent = num.toFixed(2) + "x";
  updateSliderFill(speedSlider);

  document.querySelectorAll(".btn-preset").forEach((btn) => {
    const bVal = parseFloat(btn.getAttribute("data-speed"));
    btn.classList.toggle("active", Math.abs(bVal - num) < 0.005);
  });

  for (const mediaEl of [videoPlayer, audioPlayer]) {
    try {
      mediaEl.preservesPitch = true;
      mediaEl.playbackRate = num;
    } catch {}
  }
}

for (const mediaEl of [videoPlayer, audioPlayer]) {
  mediaEl.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(mediaEl.duration) && mediaEl.duration > 0) {
      mediaDurationS = mediaEl.duration;
    }
    try {
      mediaEl.preservesPitch = true;
      mediaEl.playbackRate = currentSpeed;
    } catch {}
  });
}

function previewFile(fullPath) {
  const isAudio = /\\.(wav|mp3|m4a|flac|ogg|aac|opus)$/i.test(fullPath);
  const srcUrl = "/api/media?path=" + encodeURIComponent(fullPath) + "&t=" + Date.now();
  previewEmpty.style.display = "none";
  if (isAudio) {
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.style.display = "none";
    audioPlayer.style.display = "block";
    audioPlayer.src = srcUrl;
  } else {
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    audioPlayer.style.display = "none";
    videoPlayer.style.display = "block";
    videoPlayer.src = srcUrl;
  }
  try {
    (isAudio ? audioPlayer : videoPlayer).playbackRate = currentSpeed;
  } catch {}
}

function addQueueItem(fullPath, displayName, size = 0) {
  if (!fullPath) return;
  if (queue.some((j) => j.path === fullPath)) return;
  const name = displayName || fullPath.split(/[\\\\/]/).pop();
  const id = "job-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
  queue.push({
    id,
    path: fullPath,
    name,
    size,
    speed: currentSpeed,
    status: "IDLE",
    progress: 0,
    statusText: "Đang chờ",
    cues: 0,
    elapsed: 0,
    outputPath: "",
    error: "",
  });
  renderQueue();
  updateStats();
  if (queue.length === 1) previewFile(fullPath);
}

function removeQueueItem(id) {
  const idx = queue.findIndex((j) => j.id === id);
  if (idx !== -1) {
    if (queue[idx].status === "RUNNING") {
      api("/api/cancel", { jobId: id }).catch(() => {});
    }
    queue.splice(idx, 1);
    renderQueue();
    updateStats();
  }
}

function clearCompleted() {
  queue = queue.filter((j) => j.status !== "DONE");
  renderQueue();
  updateStats();
}

function clearAllQueue() {
  if (isBatchRunning) cancelBatch();
  queue = [];
  renderQueue();
  updateStats();
}

function updateStats() {
  const total = queue.length;
  const running = queue.filter((j) => j.status === "RUNNING").length;
  const done = queue.filter((j) => j.status === "DONE").length;
  queueStatsBadge.textContent = "TỔNG: " + total + " | SONG SONG: " + running + " | XONG: " + done;
  if (total > 0) {
    const totalProgress = queue.reduce((acc, j) => acc + (j.progress || 0), 0) / total;
    bar.style.width = Math.round(totalProgress) + "%";
    pctReadout.textContent = Math.round(totalProgress) + "%";
  } else {
    bar.style.width = "0%";
    pctReadout.textContent = "0%";
  }
}

let renderScheduled = false;
function scheduleRenderQueue() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderQueue();
    updateStats();
  });
}

function renderQueue() {
  if (queue.length === 0) {
    queueBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px 12px;color:var(--muted)">Danh sách trống. Kéo thả hàng loạt 100+ file media hoặc bấm "Duyệt…" để xử lý song song cùng lúc.</td></tr>';
    return;
  }
  let html = "";
  queue.forEach((j, i) => {
    let statusClass = "status-waiting";
    let statusLabel = "CHỜ";
    if (j.status === "RUNNING") { statusClass = "status-running"; statusLabel = "ĐANG CHẠY"; }
    else if (j.status === "DONE") { statusClass = "status-done"; statusLabel = "HOÀN TẤT"; }
    else if (j.status === "ERROR") { statusClass = "status-error"; statusLabel = "LỖI"; }

    let actionBtns = "";
    if (j.status === "DONE" && j.outputPath) {
      actionBtns = '<button class="btn-sm btn-primary" onclick="downloadJobSrt(\\\'' + encodeURIComponent(j.outputPath) + '\\\')">Tải .SRT</button> ' +
                   '<button class="btn-sm" onclick="copyJobSrt(\\\'' + encodeURIComponent(j.outputPath) + '\\\')">Copy</button>';
    } else if (j.status === "RUNNING") {
      actionBtns = '<button class="btn-sm" onclick="cancelIndividualJob(\\\'' + j.id + '\\\')">Hủy</button>';
    } else {
      actionBtns = '<button class="btn-sm" onclick="removeQueueItem(\\\'' + j.id + '\\\')">Xóa</button>';
    }

    html += '<tr onclick="previewFile(\\\'' + encodeURI(j.path) + '\\\')">' +
      '<td style="color:var(--muted);font-family:Consolas,monospace">' + (i + 1) + '</td>' +
      '<td><div style="font-weight:700;word-break:break-all">' + escapeHtml(j.name) + '</div>' +
          '<div class="muted" style="font-size:11px">' + fmtBytes(j.size) + '</div></td>' +
      '<td style="font-family:Consolas,monospace">' + j.speed.toFixed(2) + 'x</td>' +
      '<td class="cell-progress">' +
        '<div class="mini-bar-wrap"><div class="mini-bar" style="width:' + (j.progress || 0) + '%"></div></div>' +
        '<div class="muted" style="font-size:11px">' + escapeHtml(j.statusText || "") + ' (' + (j.progress || 0) + '%)</div>' +
      '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
      '<td style="text-align:right">' + actionBtns + '</td>' +
    '</tr>';
  });
  queueBody.innerHTML = html;
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function onFilePicked(files) {
  if (!files || !files.length) return;
  const fileList = Array.from(files);
  appendLog("Đang nạp " + fileList.length + " file media vào hệ thống song song…");
  await Promise.all(fileList.map(async (file) => {
    try {
      const resolved = await api(
        "/api/resolve-file?name=" + encodeURIComponent(file.name) + "&size=" + encodeURIComponent(file.size),
      );
      if (resolved.found) {
        addQueueItem(resolved.path, file.name, file.size);
      } else {
        appendLog("Đang nạp bộ nhớ đệm: " + file.name + "…");
        const upRes = await fetch("/api/upload?name=" + encodeURIComponent(file.name), {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error || upRes.statusText);
        addQueueItem(upData.path, file.name, file.size);
      }
    } catch (err) {
      appendLog("Lỗi nạp " + file.name + ": " + err.message);
    }
  }));
  scheduleRenderQueue();
  if (isBatchRunning) {
    pumpBatchWorkers();
  }
}

async function applyPathInput() {
  const val = document.getElementById("pathInput").value.trim().replace(/^["']|["']$/g, "");
  if (!val) return;
  try {
    const info = await api("/api/probe-file?path=" + encodeURIComponent(val));
    if (info.isDir) {
      if (info.files && info.files.length) {
        for (const f of info.files) {
          addQueueItem(f.path, f.name, f.size || 0);
        }
        appendLog("Đã nạp " + info.files.length + " file media từ thư mục: " + info.path);
      } else {
        alert("Thư mục không chứa file media hỗ trợ.");
      }
    } else {
      addQueueItem(info.path, info.name, info.size || 0);
    }
    document.getElementById("pathInput").value = "";
  } catch (err) {
    alert(err.message);
  }
}

const dropZone = document.getElementById("dropZone");
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer?.files?.length) {
    onFilePicked(e.dataTransfer.files);
  }
});

function appendLog(msg) {
  const line = document.createElement("div");
  line.textContent = msg;
  log.appendChild(line);
  while (log.childElementCount > 500) {
    log.removeChild(log.firstChild);
  }
  log.scrollTop = log.scrollHeight;
}

const es = new EventSource("/events");
es.addEventListener("progress", (e) => {
  const d = JSON.parse(e.data);
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.progress = d.value;
      job.status = "RUNNING";
      job.statusText = d.message;
      scheduleRenderQueue();
    }
  } else {
    lastProgress = Math.max(lastProgress, d.value);
    bar.style.width = lastProgress + "%";
    pctReadout.textContent = lastProgress + "%";
    statusEl.textContent = d.message;
  }
  appendLog("[" + String(d.value).padStart(3, "0") + "%] " + (d.jobId ? "(" + d.jobId + ") " : "") + d.message);
});

es.addEventListener("done", (e) => {
  const d = JSON.parse(e.data);
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.status = "DONE";
      job.progress = 100;
      job.cues = d.cues;
      job.elapsed = d.elapsed;
      job.outputPath = d.output;
      job.statusText = "Hoàn tất (" + d.cues + " câu trong " + d.elapsed.toFixed(1) + "s)";
      appendLog("[100%] Xuất .SRT: " + d.output);
      activeWorkersCount--;
      scheduleRenderQueue();
      pumpBatchWorkers();
    }
  } else {
    bar.style.width = "100%";
    pctReadout.textContent = "100%";
    statusEl.textContent = "Hoàn tất · " + d.cues + " câu · " + d.elapsed.toFixed(1) + "s";
    lastOutputPath = d.output;
    document.getElementById("resultSummary").textContent = "✓ Hoàn tất: " + d.cues + " câu";
    document.getElementById("resultPath").textContent = d.output;
  }
});

es.addEventListener("failed", (e) => {
  const d = JSON.parse(e.data);
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.status = "ERROR";
      job.statusText = "Lỗi";
      job.error = d.error;
      appendLog("[LỖI " + d.jobId + "] " + d.error);
      activeWorkersCount--;
      scheduleRenderQueue();
      pumpBatchWorkers();
    }
  } else {
    statusEl.textContent = "Lỗi xử lý";
    appendLog(d.error);
  }
});

es.addEventListener("cancelled", (e) => {
  const d = JSON.parse(e.data || "{}");
  if (d.jobId) {
    const job = queue.find((j) => j.id === d.jobId);
    if (job) {
      job.status = "IDLE";
      job.statusText = "Đã hủy";
      activeWorkersCount--;
      scheduleRenderQueue();
      pumpBatchWorkers();
    }
  } else {
    statusEl.textContent = "Đã dừng tiến trình";
  }
});

async function api(pathName, body) {
  const res = await fetch(
    pathName,
    body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined,
  );
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
  return res.json();
}

function getConcurrency() {
  const el = document.getElementById("concurrency");
  if (!el || el.value === "all") return 999999;
  return parseInt(el.value, 10) || 999999;
}

function startBatch() {
  if (queue.length === 0) {
    const manualPath = document.getElementById("pathInput").value.trim().replace(/^["']|["']$/g, "");
    if (manualPath) {
      applyPathInput().then(() => startBatch());
      return;
    }
    alert("Hãy thêm ít nhất một file media.");
    return;
  }
  isBatchRunning = true;
  document.getElementById("start").disabled = true;
  document.getElementById("cancel").disabled = false;
  statusEl.textContent = "Đang xử lý song song toàn bộ file cùng lúc…";
  liveBadge.textContent = "100% SONG SONG CÙNG LÚC";

  pumpBatchWorkers();
}

async function pumpBatchWorkers() {
  if (!isBatchRunning) return;
  const concurrency = getConcurrency();

  const idleJobs = queue.filter((j) => j.status === "IDLE");
  if (idleJobs.length === 0) {
    if (activeWorkersCount === 0) {
      isBatchRunning = false;
      document.getElementById("start").disabled = false;
      document.getElementById("cancel").disabled = true;
      statusEl.textContent = "Toàn bộ file đã hoàn tất 100%!";
      liveBadge.textContent = "ORIGINAL 1:1 · ZERO-TOUCH";
      appendLog("[HOÀN TẤT] Toàn bộ " + queue.length + " file đã xử lý xong!");
    }
    return;
  }

  const toStart = idleJobs.slice(0, Math.max(0, concurrency - activeWorkersCount));
  if (toStart.length === 0) return;

  for (const nextJob of toStart) {
    nextJob.status = "RUNNING";
    nextJob.statusText = "Đang bắt đầu song song…";
    nextJob.progress = 0;
    activeWorkersCount++;

    (async (job) => {
      try {
        await api("/api/start", {
          jobId: job.id,
          input: job.path,
          speed: job.speed || currentSpeed,
        });
      } catch (err) {
        job.status = "ERROR";
        job.statusText = "Lỗi khởi tạo: " + err.message;
        job.error = err.message;
        appendLog("[LỖI " + job.id + "] " + err.message);
        activeWorkersCount--;
        scheduleRenderQueue();
        pumpBatchWorkers();
      }
    })(nextJob);
  }

  scheduleRenderQueue();
}

async function cancelIndividualJob(jobId) {
  try { await api("/api/cancel", { jobId }); } catch {}
}

async function cancelBatch() {
  isBatchRunning = false;
  try { await api("/api/cancel", {}); } catch {}
  document.getElementById("start").disabled = false;
  document.getElementById("cancel").disabled = true;
  statusEl.textContent = "Đã hủy tất cả tác vụ";
  liveBadge.textContent = "ORIGINAL 1:1 · ZERO-TOUCH";
  queue.forEach((j) => { if (j.status === "RUNNING") j.status = "IDLE"; });
  activeWorkersCount = 0;
  scheduleRenderQueue();
}

function downloadJobSrt(outPath) {
  window.location.href = "/api/srt?path=" + outPath + "&download=1";
}

async function copyJobSrt(outPath) {
  try {
    const res = await fetch("/api/srt?path=" + outPath);
    if (!res.ok) throw new Error("Không đọc được file SRT");
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    statusEl.textContent = "Đã copy nội dung .SRT vào Clipboard!";
  } catch (err) {
    alert(err.message);
  }
}

// Compatibility functions for test runner
function start() { startBatch(); }
function cancelJob() { cancelBatch(); }
function downloadSrt() {
  const done = queue.find((j) => j.status === "DONE" && j.outputPath);
  if (done) downloadJobSrt(encodeURIComponent(done.outputPath));
  else if (lastOutputPath) downloadJobSrt(encodeURIComponent(lastOutputPath));
}
function copySrt() {
  const done = queue.find((j) => j.status === "DONE" && j.outputPath);
  if (done) copyJobSrt(encodeURIComponent(done.outputPath));
  else if (lastOutputPath) copyJobSrt(encodeURIComponent(lastOutputPath));
}

let currentFsParent = "";
let currentFsMediaEntries = [];
async function openFs() {
  await loadFs("");
  document.getElementById("fsDialog").showModal();
}

async function loadFs(p) {
  const data = await api("/api/fs?path=" + encodeURIComponent(p));
  document.getElementById("fsPath").textContent = data.path;
  currentFsParent = data.parent || data.path;
  currentFsMediaEntries = (data.entries || []).filter((e) => !e.dir);

  const rootsEl = document.getElementById("fsRoots");
  rootsEl.innerHTML = "";
  if (Array.isArray(data.roots)) {
    for (const r of data.roots) {
      const b = document.createElement("button");
      b.className = "btn-sm";
      b.textContent = r.label;
      b.onclick = () => loadFs(r.path);
      rootsEl.appendChild(b);
    }
  }

  const list = document.getElementById("fsList");
  list.innerHTML = "";
  for (const entry of data.entries) {
    const div = document.createElement("div");
    div.className = "fs-item" + (entry.dir ? " fs-dir" : "");
    const left = document.createElement("span");
    left.textContent = (entry.dir ? "[Thư mục] " : "[Media] ") + entry.name;
    const right = document.createElement("span");
    right.className = "fs-size";
    right.textContent = entry.dir ? "" : fmtBytes(entry.size);
    div.appendChild(left);
    div.appendChild(right);
    div.onclick = async () => {
      if (entry.dir) await loadFs(entry.path);
      else {
        document.getElementById("fsDialog").close();
        addQueueItem(entry.path, entry.name, entry.size);
      }
    };
    list.appendChild(div);
  }
}

async function fsUp() {
  if (currentFsParent) await loadFs(currentFsParent);
}

function fsAddAllMedia() {
  if (!currentFsMediaEntries || !currentFsMediaEntries.length) {
    alert("Không tìm thấy file media nào trong thư mục này.");
    return;
  }
  for (const entry of currentFsMediaEntries) {
    addQueueItem(entry.path, entry.name, entry.size);
  }
  document.getElementById("fsDialog").close();
  appendLog("Đã nạp " + currentFsMediaEntries.length + " file media từ thư mục vào hệ thống.");
}

setSpeed(1.0);
</script>
</body>
</html>`;

function isLoopbackHost(hostname) {
  const h = String(hostname ?? "").toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]" || h === HOST.toLowerCase();
}

/** Localhost hard gate: blocks DNS-rebinding (Host) and cross-site POSTs (Origin),
 * while allowing 127.0.0.1, localhost, [::1], and configured ASR_GUI_HOST. */
function sameOriginGuard(req) {
  const rawHost = String(req.headers.host ?? "").trim();
  if (!rawHost) return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${rawHost}`);
  } catch {
    return false;
  }
  if (!isLoopbackHost(hostUrl.hostname) || hostUrl.port !== String(PORT)) {
    return false;
  }
  const origin = req.headers.origin;
  if (origin === undefined || origin === null) return true; // non-browser clients
  try {
    const o = new URL(origin);
    return isLoopbackHost(o.hostname) && o.port === String(PORT);
  } catch {
    return false;
  }
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function discoverRoots() {
  const roots = [{ label: "Thư mục dự án", path: process.cwd() }];
  const home = os.homedir();
  if (home && fs.existsSync(home)) {
    roots.push({ label: "Home", path: home });
    for (const sub of ["Downloads", "Videos", "Desktop"]) {
      const p = path.join(home, sub);
      if (fs.existsSync(p)) roots.push({ label: sub, path: p });
    }
  }
  if (process.platform === "win32") {
    for (const letter of ["C", "D", "E", "F", "G"]) {
      const drive = `${letter}:\\`;
      if (fs.existsSync(drive)) {
        roots.push({ label: `Ổ ${letter}:`, path: drive });
      }
    }
  } else {
    roots.push({ label: "/", path: "/" });
  }
  return roots;
}

function listDir(dirPath) {
  const fallback = state.lastBrowsedDir && fs.existsSync(state.lastBrowsedDir)
    ? state.lastBrowsedDir
    : process.cwd();
  let target = fallback;
  try {
    if (typeof dirPath === "string" && dirPath.trim()) {
      const candidate = path.resolve(dirPath.trim());
      try {
        const st = fs.statSync(candidate);
        target = st.isDirectory() ? candidate : path.dirname(candidate);
      } catch {
        target = fs.existsSync(candidate) ? candidate : fallback;
      }
    }
    state.lastBrowsedDir = target;
    const parent = path.dirname(target);
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => e.isDirectory() || MEDIA_EXT_RE.test(e.name))
      .map((e) => {
        const full = path.join(target, e.name);
        let size = 0;
        if (!e.isDirectory()) {
          try {
            size = fs.statSync(full).size;
          } catch {
            size = 0;
          }
        }
        return {
          name: e.name,
          dir: e.isDirectory(),
          path: full,
          size,
        };
      })
      .sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
      .slice(0, 500);
    return { path: target, parent, roots: discoverRoots(), entries };
  } catch (exc) {
    return {
      path: target,
      parent: path.dirname(target),
      roots: discoverRoots(),
      entries: [],
      error: exc?.message ?? String(exc),
    };
  }
}

function probeMediaDurationS(filePath) {
  try {
    const meta = inspectMedia(filePath);
    return Number.isFinite(meta?.durationS) && meta.durationS > 0 ? meta.durationS : 0;
  } catch {
    return 0;
  }
}

function resolveLocalFileByNameSize(name, size) {
  const safeBase = path.basename(String(name ?? "").trim());
  if (!safeBase || !Number.isFinite(size) || size <= 0) return { found: false };
  const home = os.homedir();
  const dirs = [
    state.lastBrowsedDir,
    process.cwd(),
    home ? path.join(home, "Downloads") : "",
    home ? path.join(home, "Videos") : "",
    home ? path.join(home, "Desktop") : "",
    home ? path.join(home, "Music") : "",
    home || "",
  ].filter(Boolean);

  const seen = new Set();
  for (const d of dirs) {
    const candidate = path.resolve(d, safeBase);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const st = fs.statSync(candidate);
      if (st.isFile() && st.size === size) {
        return {
          found: true,
          path: candidate,
          durationS: probeMediaDurationS(candidate),
        };
      }
    } catch {
      /* ignore */
    }
  }
  return { found: false };
}

function serveMediaRange(req, res, filePath) {
  const raw = String(filePath ?? "").trim();
  if (!raw) {
    json(res, 400, { error: "Thiếu đường dẫn media" });
    return;
  }
  const resolved = path.resolve(raw);
  if (!MEDIA_EXT_RE.test(resolved)) {
    json(res, 403, { error: "Định dạng file không nằm trong danh sách media cho phép" });
    return;
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    json(res, 404, { error: "Không tìm thấy file media" });
    return;
  }
  if (!st.isFile()) {
    json(res, 404, { error: "Không phải file hợp lệ" });
    return;
  }
  const total = st.size;
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? (AUDIO_ONLY_EXT_RE.test(ext) ? "audio/mpeg" : "video/mp4");
  const range = req.headers.range;

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(String(range).trim());
    if (!m) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    let start = m[1] ? Number.parseInt(m[1], 10) : 0;
    let end = m[2] ? Number.parseInt(m[2], 10) : total - 1;
    if (!m[1] && m[2]) {
      const suffix = Number.parseInt(m[2], 10);
      start = Math.max(0, total - suffix);
      end = total - 1;
    }
    if (start >= total || end >= total || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    const chunkLen = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkLen,
      "Content-Type": mime,
      "Cache-Control": "no-store",
    });
    const stream = fs.createReadStream(resolved, { start, end });
    stream.on("error", () => {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
    });
    req.on("close", () => {
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
    });
    stream.pipe(res);
    return;
  }

  res.writeHead(200, {
    "Accept-Ranges": "bytes",
    "Content-Length": total,
    "Content-Type": mime,
    "Cache-Control": "no-store",
  });
  const stream = fs.createReadStream(resolved);
  stream.on("error", () => {
    try {
      res.destroy();
    } catch {
      /* ignore */
    }
  });
  req.on("close", () => {
    try {
      stream.destroy();
    } catch {
      /* ignore */
    }
  });
  stream.pipe(res);
}

async function startJob(body) {
  if (state.running) throw new ASRError("Một job đang chạy — hủy hoặc chờ hoàn tất");
  const input = String(body?.input ?? "").trim();
  if (!input) throw new ASRError("Thiếu đường dẫn input");
  let inputStat = null;
  try {
    inputStat = fs.statSync(input);
  } catch {
    throw new ASRError(`Không tìm thấy file: ${input}`);
  }
  if (!inputStat.isFile()) throw new ASRError(`Không tìm thấy file: ${input}`);
  const ext = path.extname(input);
  const customOut = typeof body?.output === "string" ? body.output.trim() : "";
  const output = customOut || (ext ? input.slice(0, -ext.length) + ".srt" : input + ".srt");
  const resolvedInput = path.resolve(input);
  const resolvedOutput = path.resolve(output);
  if (!resolvedOutput || resolvedOutput === resolvedInput) {
    throw new ASRError(`Đường dẫn output không hợp lệ: ${output}`);
  }
  try {
    const parentStat = fs.statSync(path.dirname(resolvedOutput));
    if (!parentStat.isDirectory()) throw new ASRError(`Thư mục output không hợp lệ: ${path.dirname(resolvedOutput)}`);
  } catch (exc) {
    if (exc instanceof ASRError) throw exc;
    throw new ASRError(`Thư mục output không tồn tại: ${path.dirname(resolvedOutput)}`);
  }
  const model = body?.model === MODEL_AUTO ? MODEL_AUTO : MODEL_JIANYING;
  const workers = Number.isInteger(body?.workers) && body.workers > 0 ? Math.min(body.workers, 16) : null;
  let speed = SPEED_DEFAULT;
  if (body?.speed !== undefined && body?.speed !== null) {
    try {
      speed = normalizeSpeed(Number(body.speed));
    } catch {
      throw new ASRError(`Tốc độ (speed) phải nằm trong khoảng [${SPEED_MIN}, ${SPEED_MAX}]`);
    }
  }

  const jobId = String(body?.jobId || ("job-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7)));
  const jobToken = new CancelToken();
  const jobRecord = {
    id: jobId,
    input: resolvedInput,
    output: resolvedOutput,
    token: jobToken,
    startedAtMs: performance.now(),
    lastProgress: 0,
    cueCount: 0,
  };
  state.activeJobs.set(jobId, jobRecord);
  state.running = true;
  state.token = jobToken;

  void (async () => {
    try {
      const result = await new CloudPipeline(jobToken, (value, message) => {
        jobRecord.lastProgress = progressSmooth(jobRecord.lastProgress, value);
        state.lastProgress = jobRecord.lastProgress;
        broadcast("progress", { jobId, value: jobRecord.lastProgress, message });
      }).run(
        Options({
          inputPath: resolvedInput,
          outputPath: resolvedOutput,
          model,
          language: null,
          jianyingAppVersion: "10.9.0",
          maxWorkers: workers,
          speed,
          physicalSpeed: false,
          formats: ["srt"],
          srtOnly: true,
          noJunk: true,
        }),
      );
      jobRecord.cueCount = result.segments.length;
      state.lastOutput = result.outputPath;
      broadcast("done", {
        jobId,
        cues: result.segments.length,
        elapsed: result.elapsed,
        output: result.outputPath,
        speed: result.speed,
        eta: formatEta(result.elapsed, 1),
        throughput: formatThroughput(result.segments.length, result.elapsed),
      });
    } catch (exc) {
      if (isCancelled(exc)) broadcast("cancelled", { jobId });
      else broadcast("failed", { jobId, error: exc instanceof ASRError ? exc.describe() : (exc?.stack ?? String(exc)) });
    } finally {
      state.activeJobs.delete(jobId);
      state.running = state.activeJobs.size > 0;
      if (!state.running) state.token = null;
    }
  })();

  return { ok: true, jobId, speed, output: resolvedOutput };
}

export function startGui({ openBrowser = true } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    try {
      if (!sameOriginGuard(req)) {
        json(res, 403, { error: "forbidden" });
        return;
      }
      if (url.pathname === "/events") {
        if (state.clients.size >= MAX_SSE_CLIENTS) {
          json(res, 503, { error: "Quá nhiều client SSE — thử lại sau" });
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        res.on("error", () => state.clients.delete(res));
        state.clients.add(res);
        req.on("close", () => state.clients.delete(res));
        return;
      }
      if (url.pathname === "/api/start" && req.method === "POST") {
        const contentType = String(req.headers["content-type"] ?? "");
        if (!contentType.includes("application/json")) {
          json(res, 415, { error: "Content-Type phải là application/json" });
          return;
        }
        const declared = Number.parseInt(String(req.headers["content-length"] ?? ""), 10);
        if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
          json(res, 413, { error: "POST body quá lớn (giới hạn 1MB)" });
          try {
            req.resume();
          } catch {
            /* ignore */
          }
          return;
        }
        const chunks = [];
        let received = 0;
        let tooLarge = false;
        for await (const c of req) {
          received += c.length;
          if (received > MAX_JSON_BYTES) {
            tooLarge = true;
            break;
          }
          chunks.push(c);
        }
        if (tooLarge) {
          json(res, 413, { error: "POST body quá lớn (giới hạn 1MB)" });
          return;
        }
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {
          json(res, 400, { error: "JSON không hợp lệ" });
          return;
        }
        const startedInfo = await startJob(body);
        json(res, 200, startedInfo);
        return;
      }
      if (url.pathname === "/api/cancel" && req.method === "POST") {
        let cancelJobId = null;
        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          if (chunks.length) {
            const b = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
            cancelJobId = b.jobId;
          }
        } catch {}
        if (cancelJobId && state.activeJobs.has(cancelJobId)) {
          state.activeJobs.get(cancelJobId)?.token?.cancel();
        } else {
          for (const j of state.activeJobs.values()) {
            j.token?.cancel();
          }
          state.token?.cancel();
        }
        json(res, 200, { ok: true });
        return;
      }
      if (url.pathname === "/api/fs") {
        json(res, 200, listDir(url.searchParams.get("path") ?? ""));
        return;
      }
      if (url.pathname === "/api/probe-file") {
        const raw = String(url.searchParams.get("path") ?? "").trim();
        if (!raw) {
          json(res, 400, { error: "Thiếu đường dẫn file" });
          return;
        }
        const resolved = path.resolve(raw);
        let st;
        try {
          st = fs.statSync(resolved);
        } catch {
          json(res, 404, { error: `Không tìm thấy file: ${raw}` });
          return;
        }
        if (st.isDirectory()) {
          const files = fs
            .readdirSync(resolved, { withFileTypes: true })
            .filter((e) => !e.isDirectory() && MEDIA_EXT_RE.test(e.name))
            .map((e) => {
              const full = path.join(resolved, e.name);
              let size = 0;
              try {
                size = fs.statSync(full).size;
              } catch {}
              return {
                path: full,
                name: e.name,
                size,
                durationS: probeMediaDurationS(full),
              };
            });
          state.lastBrowsedDir = resolved;
          json(res, 200, {
            isDir: true,
            path: resolved,
            files,
            durationS: 0,
          });
          return;
        }
        if (!st.isFile()) {
          json(res, 400, { error: `Đường dẫn không phải là file: ${raw}` });
          return;
        }
        state.lastBrowsedDir = path.dirname(resolved);
        json(res, 200, {
          isDir: false,
          path: resolved,
          name: path.basename(resolved),
          size: st.size,
          durationS: probeMediaDurationS(resolved),
        });
        return;
      }
      if (url.pathname === "/api/resolve-file") {
        const name = url.searchParams.get("name") ?? "";
        const size = Number.parseInt(url.searchParams.get("size") ?? "0", 10);
        json(res, 200, resolveLocalFileByNameSize(name, size));
        return;
      }
      if (url.pathname === "/api/upload" && req.method === "POST") {
        const rawName = path.basename(String(url.searchParams.get("name") ?? "media.mp4").trim());
        const safeName = rawName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "media.mp4";
        if (!MEDIA_EXT_RE.test(safeName)) {
          json(res, 400, { error: `Định dạng file không hỗ trợ: ${safeName}` });
          req.resume();
          return;
        }
        const stageDir = ensureUploadTempDir();
        const destPath = path.join(stageDir, safeName);
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(destPath);
          req.pipe(out);
          out.on("finish", resolve);
          out.on("error", reject);
          req.on("error", reject);
        });
        json(res, 200, {
          ok: true,
          path: destPath,
          name: safeName,
          durationS: probeMediaDurationS(destPath),
        });
        return;
      }
      if (url.pathname === "/api/media" && req.method === "GET") {
        serveMediaRange(req, res, url.searchParams.get("path") ?? "");
        return;
      }
      if (url.pathname === "/api/srt" && req.method === "GET") {
        const raw = String(url.searchParams.get("path") ?? state.lastOutput ?? "").trim();
        if (!raw) {
          json(res, 404, { error: "Chưa có file SRT" });
          return;
        }
        const resolved = path.resolve(raw);
        if (!resolved.toLowerCase().endsWith(".srt") || !fs.existsSync(resolved)) {
          json(res, 404, { error: "Không tìm thấy file SRT" });
          return;
        }
        const isDownload = url.searchParams.get("download") === "1";
        const fileName = path.basename(resolved);
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          ...(isDownload
            ? { "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` }
            : {}),
        });
        fs.createReadStream(resolved).pipe(res);
        return;
      }
      if (url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(PAGE.replace("${MODELS_OPTIONS}", MODELS_OPTIONS));
        return;
      }
      json(res, 404, { error: "not found" });
    } catch (exc) {
      json(res, 400, { error: exc instanceof ASRError ? exc.describe() : String(exc?.message ?? exc) });
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", (err) => {
      reject(new ASRError(
        err?.code === "EADDRINUSE"
          ? `Port ${PORT} đang bị chiếm — đặt ASR_GUI_PORT=<port khác>`
          : `GUI server lỗi: ${err?.message ?? err}`,
      ));
    });
    const heartbeat = setInterval(heartbeatTick, SSE_HEARTBEAT_MS);
    try {
      heartbeat.unref?.();
    } catch {
      /* ignore */
    }
    server.on("close", () => clearInterval(heartbeat));
    server.listen(PORT, HOST, () => {
      const address = `http://${HOST}:${PORT}`;
      process.stdout.write(`ASR Studio UltraX GUI · ${address}\n`);
      if (openBrowser) {
        try {
          let launched = false;
          if (process.platform === "win32") {
            const browserExes = [
              "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
              "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
              path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
              "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
              "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
            ];
            for (const bExe of browserExes) {
              if (bExe && fs.existsSync(bExe)) {
                const child = spawn(bExe, [`--app=${address}`], { detached: true, stdio: "ignore" });
                child.on("error", () => {});
                child.unref?.();
                launched = true;
                break;
              }
            }
            if (!launched) {
              const child = spawn("cmd", ["/c", "start", "", address], { detached: true, stdio: "ignore" });
              child.on("error", () => {});
              child.unref?.();
            }
          } else if (process.platform === "darwin") {
            const child = spawn("open", [address], { detached: true, stdio: "ignore" });
            child.on("error", () => {});
            child.unref?.();
          } else {
            const child = spawn("xdg-open", [address], { detached: true, stdio: "ignore" });
            child.on("error", () => {});
            child.unref?.();
          }
        } catch {
          /* headless environment — never crash if browser launcher is absent */
        }
      }
      resolve(server);
    });
  });
}

export async function main() {
  await startGui({ openBrowser: process.env.ASR_GUI_NO_OPEN !== "1" });
  setInterval(() => {}, 1 << 30);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
