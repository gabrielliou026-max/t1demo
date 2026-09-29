#!/usr/bin/env bash
# Full pipeline: narration → timeline → music/mix → check shots → MP4.
# With GEMINI_API_KEY set, narration is generated with Gemini TTS; without it,
# the video is built as a music-only version with estimated subtitle timing.
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { pip install -q imageio-ffmpeg numpy scipy; ln -sf "$(python3 -c 'import imageio_ffmpeg as i;print(i.get_ffmpeg_exe())')" /usr/local/bin/ffmpeg; }
python3 -c 'import numpy, scipy' 2>/dev/null || pip install -q numpy scipy
[ -f build/fonts/fonts.css ] || python3 tools/fonts.py
if [ -n "${GEMINI_API_KEY:-}" ]; then python3 tools/tts_gemini.py; else echo "GEMINI_API_KEY not set → music-only build"; fi
python3 tools/timeline.py
python3 tools/audio.py
node tools/shots.mjs && python3 tools/sheets.py
node tools/render.mjs 4
python3 tools/export_script.py
