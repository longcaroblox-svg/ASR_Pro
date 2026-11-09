# ASR Studio UltraX (NodeJS) 8.4.0

Port hoàn chỉnh từ Python → **NodeJS thuần ESM, ZERO dependency, ZERO ffmpeg** (cần **Node ≥ 22.2** — dùng native `zlib.crc32`).
**Jianying-first**, media dài hàng trăm giờ, anti-stall, live atomic SRT.

## 8.0.0 — KHÔNG FFmpeg, PASSTHROUGH TOÀN PHẦN

Toàn bộ lớp audio được thay bằng **byte surgery thuần NodeJS** trên container gốc:

```
Trước (7.x): media ─ffmpeg→ PCM WAV ─ffmpeg×N→ LAME MP3 chunks   ← decode + re-encode, phút đồng hồ
Sau   (8.x): media ─NodeJS──→ cắt frame-boundary passthrough      ← memcpy tốc độ bộ nhớ, mili giây
```

| Giai đoạn (media 97s) | 7.x (ffmpeg) | 8.x (thuần Node) | Hệ số |
|---|---|---|---|
| AUTO · chuẩn bị audio | 3 328 ms | **250 ms** | **13×** |
| ORIGINAL · trích audio | 2 360 ms | **65 ms** | **36×** |
| 60-phút WAV · tách 8 đoạn | — | **0.10 s** | — |
| RAM khi duyệt track 100 giờ (16.8M AU) | — | **12 MB flat** | — |

Định dạng hỗ trợ passthrough: **MP4/MOV/M4A (AAC · HE-AAC · HE-AACv2), MP3, WAV PCM**.
Codec khác = lỗi rõ ràng ngay lập tức (NO-FALLBACK — không có lớp transcode ẩn).
Server JianYing xác nhận nhận trực tiếp ADTS AAC passthrough (real test, 17–51 utterances/file thật).

## Doctrine — NO-FALLBACK

- **1 model = 1 engine.** Lỗi là lỗi: không bao giờ tự downgrade sang engine yếu hơn.
- Model sai = hard error. HTTP error = error thật, không nhép network-blip.
- Timestamp garbage = hard error, không nuốt thành 0.
- Codec/định dạng không hỗ trợ = hard error ghi tên codec — không decode chui, không re-encode ngầm.
- Upload **stream thẳng từ disk** (zero RAM spike kể cả file 100h). CRC32 fuse lúc cắt — không re-read.
- Muxer bất thường (AU lùi vị trí file) = từ chối cắt, không cắt bừa.

## Cài đặt & Sử dụng

```bash
# Không cần npm install — zero dependency
# Không cần ffmpeg — audio layer thuần NodeJS

# 1. Nhận diện giọng nói (ASR) xuất phụ đề đa định dạng
node bin/asr-ultrax.js input.mp4 -o out.srt --workers 12
node bin/asr-ultrax.js input.mp4 -o out.srt --speed 0.8     # Chuyển chuẩn 0.8x âm thanh thực & request nhận phụ đề trực tiếp
node bin/asr-ultrax.js input.mp4 --format srt,vtt,lrc,txt  # Xuất cùng lúc 4 định dạng phụ đề

# 2. Tách âm thanh siêu tốc (<50ms) từ video MP4/MOV không cần giải mã
node bin/asr-ultrax.js input.mp4 --extract -o audio.aac

# 3. Tổng hợp giọng đọc CapCut AI Cloud TTS (100% ByteDance SAMI API, không tài khoản)
node bin/asr-ultrax.js --tts "Xin chào các bạn!" --tts-voice BV074_streaming -o voice.mp3
node bin/asr-ultrax.js --tts "Chào quý khán giả" --tts-voice thanh-nien-tu-tin -o voice.mp3
```

### 10 Giọng đọc Tiếng Việt CapCut Chính Hãng (Cloud TTS)
1. `BV074_streaming` (`co-gai-hoat-ngon`): Cô Gái Hoạt Ngôn
2. `BV075_streaming` (`thanh-nien-tu-tin`): Thanh Niên Tự Tin
3. `vi_female_huong` (`nu-pho-thong`): Giọng Nữ Phổ Thông
4. `BV421_vivn_streaming` (`nho-ngot-ngao`): Nguồn Nhỏ Ngọt Ngào
5. `BV560_streaming` (`anh-dung`): Anh Dũng
6. `BV562_streaming` (`chi-mai`): Chí Mai
7. `BV075_streaming_vibrato_dsp` (`viet-rung`): Việt Rung
8. `BV075_streaming_demon_dsp` (`quy-viet`): Quỷ Việt
9. `BV074_streaming_dsp` (`giong-be`): Giọng Bé
10. `BV075_streaming_robot_dsp` (`robot-vn`): Robot VN


GUI (Web Anti-Slop — hỗ trợ xem trước Video/Audio HTTP 206 Range + chỉnh tốc độ `0.5x – 1.5x` trực tiếp):
```bash
npm run gui        # mở http://127.0.0.1:8760 (hoặc http://localhost:8760)
```

## Build `dist/` — khởi động cực hạn, link khép kín

```bash
npm install                 # chỉ cài esbuild cho bước build (runtime vẫn zero-dependency)
npm run build               # bundle + verify toàn bộ dist/
npm run gui:dist            # chạy GUI bản dist (compile cache bật sẵn)
npm run cli:dist -- --help  # chạy CLI bản dist
```

Trên Windows có thể double-click `dist/run.bat`; trên macOS/Linux chạy `sh dist/run.sh`
hoặc `node dist/gui.js`. `dist/` không cần `npm install` và không cần `node_modules`.

`dist/` là artifact tự chứa: mỗi entry được bundle thành **một file ESM duy nhất**
(`index.js`, `cli.bundle.mjs`, `gui.bundle.mjs`, `model-probe.bundle.mjs`), chỉ còn
`node:*` là external. Không còn relative import nào phải resolve lúc chạy; launcher bật
V8 compile cache nên các lần khởi động sau nhanh hơn. `npm run build` tự chạy
`scripts/verify-dist.mjs`: kiểm tra toàn bộ file, syntax, link, export parity với `src/`,
CLI `--help`, probe, và tất cả endpoint GUI (`/`, `/api/fs`, `/api/probe-file`,
`/api/resolve-file`, `/api/media` 200 + Range 206, `/api/srt`, `/api/upload`,
`/api/start`, `/api/cancel`, SSE) trước khi báo BUILD OK. Bước verify cũng chạy lại
full pipeline E2E (ORIGINAL + AUTO + NO-FALLBACK + byte fidelity) trực tiếp trên bundle dist.

Probe kiểm tra protocol bằng chính passthrough thật:
```bash
npm run probe -- sample.mp4 --seconds 20
node scripts/probe-gate.mjs sample.mp4 --seconds 25   # gate test chi tiết
```

## Đầu ra SRT chuẩn phát sóng & Tối ưu Tiếng Trung (CJK) — CHÍNH XÁC NGÔN NGỮ TRÊN HẾT

**Ưu tiên tuyệt đối: bắt đúng câu.** 42 ký tự Latin / 28 chữ Hán chỉ là mục tiêu mềm — không bao giờ phá câu để ép độ dài.

| Khả năng | Hành vi |
|----------|---------|
| **Chuẩn Âm Thanh 0.8x & Request Trực Tiếp** | Chuyển đổi chuẩn xác file âm thanh về tốc độ `0.8x` (hoặc `--audio-speed`) bằng bộ lọc `atempo` (giữ nguyên 100% cao độ giọng nói, kéo giãn thời lượng $1.25\times$), request trực tiếp âm thanh 0.8x lên server ASR để nhận dạng rõ từng âm tiết và **nhận ngay phụ đề chuẩn 100% trực tiếp từ server** (không mô phỏng co dãn timestamp ở mức phụ đề) |
| **Cắt Chunk Thông Minh Tại Vùng Không Có Voice** | Tự động quét VAD / khoảng lặng đa ngôn ngữ (Việt, Anh, CJK...), chọn mốc cắt chunk tại điểm không có tiếng nói để triệt tiêu 100% lỗi chém đứt câu/từ khi ghép nối. Thời gian, ID `1, 2, 3...` và SRT hoàn hảo |
| **Tối ưu Tiếng Trung (CJK)** | Nhận diện trọng số thị giác chữ Hán ($2\times$), bảo toàn ngắt câu tự nhiên từ JianYing, tách mệnh đề tại `，、；：` theo đúng word-timestamp, không bao giờ chèn khoảng trắng thừa giữa chữ Hán |
| **Bắt câu lẻ** | Tách đoạn chứa nhiều câu (`"A. B? C!"`, `"甲。乙！丙？"`) thành từng cue riêng, bảo vệ số thập phân (`3.5` không bị cắt) |
| **Gộp câu rời** | Mảnh chưa kết thúc tự gộp với mảnh kế tiếp thành câu hoàn chỉnh — chặn bởi khoảng lặng > 1.5s |
| **Tách câu dài** | Câu vượt ngưỡng mềm được tách **chỉ tại ranh giới mệnh đề + khoảng nghỉ âm học** gần vị trí cân bằng nhất |
| **Timing law** | Min 5/6s · Max 7s · Gap ≥ 84ms · CPS ≤ 20 (10 chữ Hán/s) · Monotonic · Zero overlap |
| **1 dòng/cue** | Không bao giờ xuống dòng trong cue |

`ORIGINAL 1:1` giữ nguyên timestamp/text server (fidelity tuyệt đối — giờ cả AUDIO cũng 1:1 bit-gốc).
Vi phạm cấu trúc → **chặn render**; timing ideal không đạt được → đếm vào `netflix_warnings`.

## Đo tiến trình

- **Trọng số theo thời lượng**: chunk 480s nặng hơn chunk 10s đúng 48× — % phản ánh media đã xử lý thật.
- Bands: `0–26` audio prep · `26–94` ASR (weighted) · `94–100` export.
- **ETA thực** nhúng trong từng message · Monotonic: % không bao giờ giật lùi.

## Kiến trúc

```
Media → inspectMedia (pure-Node demux: MP4 box tree · MP3 frame scan · RIFF)
      → AdaptiveChunker (cắt passthrough tại AAC access unit / MP3 frame / PCM frame,
                         ±8s overlap, 1 lượt đọc duy nhất cho mọi chunk)
      → JianYing (MD5 sign · AWS4 VOD · PUT stream từ disk · CRC32 fuse · poll thích ứng)
      → ZeroCopyParse(+word timestamps) → SentenceEngine (CJK + Latin) → LiveAtomicSRT (0.5x–1.5x)
```

Chi tiết kỹ thuật của lớp audio thuần Node (`src/audio/`):

- `mp4.js` — box walker 32/64-bit, sample table giữ nguyên dạng run-length kèm con trỏ tuần tự $O(1)$ (tra cứu tức thì,
  không cấp phát theo số sample → 100h ≈ kilobytes RAM), esds→ASC parser, ADTS packer
  (AOT 1–4 direct; SBR/PS → LC implicit signaling đúng chuẩn ngành).
- `mp3.js` — sync scan khắt khe, frame gộp run-length kèm con trỏ tuần tự $O(1)$, ID3v2 skip; stream quá nhiều sync hỏng = hard error.
- `wav.js` — RIFF/PCM parse, header 44B viết sẵn kích thước CHÍNH XÁC (không patch sau).
- `cut.js` — cutter single-pass đa đầu-ra: boundary segmentation + contiguous-run bulk transfer bằng `Uint32Array` tái sử dụng (zero GC);
  CRC32 fuse vào write path; span đọc 8MB có lookahead; hole video-interleave không bao giờ copy hai lần.
- `media.js` — router sniff magic bytes; format lạ = lỗi kèm magic hex in ra.

## Modes — JianYing ONLY

| Mode | Hành vi |
|------|---------|
| `Auto` | chunk passthrough + overlap + sentence engine (tối ưu CJK/Việt/Anh) |
| `JianYing` | 1 request, audio gốc nguyên vẹn bit-level, raw ms giữ nguyên (hoặc co giãn chuẩn theo `--speed`) |

## Env tuning

| Biến | Ý nghĩa | Mặc định |
|------|---------|----------|
| `ASR_SILENCE` | Quét silence để cắt thông minh (**chỉ nguồn WAV PCM 16-bit**) | `0` (turbo cut) |
| `ASR_MAX_WORKERS` | Số chunk chạy song song (≤16) | `min(12, cpu×2)` |
| `ASR_SPLIT_WORKERS` | *(legacy, không còn tác dụng — cutter single-pass)* | — |
| `ASR_JY_POLL_READ` | Read timeout giây cho poll | **none = chờ vĩnh viễn** |
| `ASR_JY_POLL_ATTEMPTS` | Giới hạn số lần poll | `0 = forever` |
| `ASR_GUI_PORT` | Port web GUI | `8760` |
| `ASR_GUI_HOST` | Host bind web GUI | `127.0.0.1` |
| `ASR_GUI_NO_OPEN` | `1` = không tự mở trình duyệt (headless/benchmark) | `0` |

## Tests & Benchmarks

```bash
npm test                                   # node --test — 98 contracts xanh
npm run build                              # bundle + verify dist/ (23 checks) 
node scripts/bench-scale.mjs --hours 100   # stress 100h accessor + 60-min real split
node scripts/dump-boxes.mjs file.mp4       # diagnostic MP4 box tree
```

Số liệu real-server (file TikTok 97s, cùng máy, cùng ngày):

```
AUTO     : prep 3328ms → 250ms  · total 9.38s → 5.42s
ORIGINAL : prep 2360ms →   65ms · total 9.53s → 6.59s
```

Thời gian còn lại nằm ở poll server (biến động 3–15s theo tải server) — ngoài tầm kiểm soát client.

## Honesty

Cloud ASR không chính thức **không chứng minh WER 99.99%**. UltraX giữ fidelity tối đa:
text/timestamp 1:1 trong ORIGINAL modes, audio passthrough **bit-exact so với nguồn**
(không qua bước lossy nào nữa), loại bỏ mọi bottleneck client. Chất lượng ASR giữa các lần
chạy có thể dao động nhẹ do phía server — đó là biến động thật, không phải lỗi pipeline.
