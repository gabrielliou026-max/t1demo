# 電話信令 CAS / CCS 動畫

給網路工程師的中英雙語解說動畫，約 5 分半、10 個章節：T1/E1 訊框、位元竊取、E1 CAS 與 R2、ISDN PRI 與 Q.931，以及 Cisco IOS 的 CAS／PRI 設定與驗證。

- `out/CAS-CCS-signaling-1080p.mp4`：1920×1080、30 fps 的 H.264 影片，中英字幕燒錄在畫面上
- `web/`：互動網頁（`index.html`、`engine.js`、`data.js`、`audio.mp3`），可播放、切換字幕、點章節跳轉，並有角色介紹卡片
- `SCRIPT.md`：完整的中英對照旁白腳本，附時間碼
- `script/script.json`：腳本原始檔（修改內容都從這裡改）

畫面風格是「Q 版紙藝／黏土 Low-Poly」：所有角色與示範都用 Three.js 原生幾何體（Box、Cylinder、Sphere、Cone、Capsule、Torus、Icosahedron、Plane）組裝，搭配 flat shading 與柔和粉彩色。指令畫面、檢查清單、比較表等文字內容則印在 3D 紙卡、夾板與黏土螢幕上。字幕、章節名稱、進度條和小標籤是疊在畫面上的 2D 層。

所有畫面、角色和背景音樂都由程式生成，沒有使用外部素材。網頁和影片用的是同一個 `web/engine.js`，而且每一格只由時間決定，所以兩邊的畫面完全一致。Three.js r149（MIT 授權）放在 `web/vendor/`，隨網頁一起發布。

## 旁白語音（Gemini TTS）

目前的版本是**配樂版**：還沒有旁白語音，字幕時間是依照預估語速排出來的。要產生正式的台灣口音女聲旁白：

1. 在雲端環境設定裡新增環境變數 `GEMINI_API_KEY`（不要把金鑰寫進 repo）。
2. 開一個新的 session，執行：

```bash
./build.sh
```

`tools/tts_gemini.py` 會逐句呼叫 Gemini TTS（預設模型 `gemini-2.5-flash-preview-tts`、女聲 `Sulafat`，並以「台灣口音、溫暖說故事語氣」作為風格提示），然後修掉每句前後的靜音。之後的時間軸、字幕切換點、背景音樂閃避（ducking）和 MP4 都會依照實際語音長度重新產生。可以用 `GEMINI_TTS_MODEL`、`GEMINI_TTS_VOICE` 換成其他模型或聲音。

## 管線

| 步驟 | 檔案 | 產出 |
|---|---|---|
| 腳本 | `script/script.json` | 章節、句子（中文、英文，另有 `tts` 欄位可指定念法） |
| 語音 | `tools/tts_gemini.py` | `build/tts/NNN.wav` |
| 時間軸 | `tools/timeline.py` | `web/data.js`（每句的開始與結束時間；有 TTS 就用實際長度） |
| 音樂與混音 | `tools/audio.py` | 原創配樂；旁白出現時音樂降低約 11 dB；輸出 `web/audio.mp3`、`build/mix.m4a` |
| 截圖檢查 | `tools/shots.mjs`、`tools/sheets.py` | 每句一張畫面，並拼成 2×2 總覽圖 |
| 影片 | `tools/render.mjs` | 用 headless Chromium（SwiftShader WebGL）逐格渲染，再以 ffmpeg 編成 H.264/AAC |

鏡頭會自動取景：每個場景宣告內容的 3D 範圍，引擎再算出剛好放進畫面安全區的鏡頭位置，避開上方標題列和下方字幕。

字幕會在兩句之間的停頓切換，時間對齊每句語音的開始時間。

## 內容說明

指令是 Cisco IOS 語音閘道的常見範例（`ds0-group`、`pri-group`、`isdn switch-type`、`show isdn status`、`debug vpm signal`、`debug isdn q931`）。實際語法和可用的 switch-type 依平台與 IOS 版本而定，上線前請和電信業者或對端核對參數。
