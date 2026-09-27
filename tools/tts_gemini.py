#!/usr/bin/env python3
"""Generate narration with Gemini TTS, one WAV per sentence, into build/tts/.

Each chapter is synthesized in a single request (one sentence per line) so the
voice stays consistent within the chapter; separately generated sentences drift
in timbre. The chapter audio is then cut back into sentences at the longest
pauses, and each sentence is checked against its expected length.

Needs GEMINI_API_KEY in the environment. Optional overrides:
  GEMINI_TTS_MODEL  (default: gemini-2.5-flash-preview-tts)
  GEMINI_TTS_VOICE  (default: Sulafat — a warm female prebuilt voice)

Results are cached per chapter by (model, voice, prompt) so re-runs only fetch changed chapters.
Leading/trailing silence is trimmed so subtitle cues line up with the speech.
"""
import base64, hashlib, json, os, re, sys, time, urllib.request, urllib.error, wave, struct

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "script", "script.json")
OUT_DIR = os.path.join(ROOT, "build", "tts")
CACHE = os.path.join(ROOT, "build", "tts_cache")

MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
VOICE = os.environ.get("GEMINI_TTS_VOICE", "Sulafat")
RATE = 24000  # Gemini TTS returns 16-bit mono PCM at 24 kHz

STYLE = ("請用台灣口音的年輕女性聲音朗讀下面這段旁白，語氣溫暖、清楚，像在說故事給工程師聽，"
         "語速自然適中，英文技術名詞照英文發音。每一行是一句，句與句之間停頓約一秒。只唸旁白內容：\n")
QUIET = 350        # 16-bit peak below which a 10 ms window counts as silence
MIN_PAUSE = 0.4    # a sentence break must be at least this long (seconds)
BLIP = 3           # loud 10 ms windows tolerated inside a pause
TRIES = 4          # chapter regenerations when the audio can't be split cleanly


def request(text):
    key = os.environ["GEMINI_API_KEY"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    body = {
        "contents": [{"parts": [{"text": STYLE + text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}},
        },
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.load(r)
            part = data["candidates"][0]["content"]["parts"][0]["inlineData"]
            return base64.b64decode(part["data"])
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            if e.code in (429, 500, 503) and attempt < 5:
                wait = 2 ** attempt * 5
                print(f"    HTTP {e.code}, retry in {wait}s", flush=True)
                time.sleep(wait)
                continue
            sys.exit(f"Gemini TTS failed: HTTP {e.code}: {msg}")
        except (KeyError, IndexError):
            # e.g. finishReason OTHER with no audio; the caller retries the chapter
            print("    no audio in response", flush=True)
            return None


def trim(pcm, thresh=350, pad=0.06):
    n = len(pcm) // 2
    s = struct.unpack(f"<{n}h", pcm[: n * 2])
    win = int(RATE * 0.01)
    loud = [i for i in range(0, n - win, win) if max(abs(x) for x in s[i:i + win]) > thresh]
    if not loud:
        return pcm
    a = max(0, loud[0] - int(pad * RATE))
    b = min(n, loud[-1] + win + int(pad * RATE))
    return pcm[a * 2:b * 2]


def estimate(text):
    """Rough spoken length in seconds (same heuristic as timeline.py)."""
    cjk = len(re.findall(r"[一-鿿]", text))
    words = len(re.findall(r"[A-Za-z]+|\d+(?:\.\d+)?", text))
    pauses = len(re.findall(r"[，、；：,;:]", text))
    return cjk * 0.21 + words * 0.30 + pauses * 0.15 + 0.2


def split(pcm, lines):
    """Cut chapter audio into len(lines) sentences at the longest pauses, or None if unclear."""
    x = np.abs(np.frombuffer(pcm, np.int16).astype(np.int32))
    win = RATE // 100
    loud = x[: len(x) // win * win].reshape(-1, win).max(axis=1) > QUIET
    if not loud.any():
        return None
    first, last = np.argmax(loud), len(loud) - np.argmax(loud[::-1])
    runs, i = [], first
    while i < last:  # silent runs strictly inside the speech
        if not loud[i]:
            j = i
            while not loud[j]:
                j += 1
            if runs and i - runs[-1][1] <= BLIP:  # a click or breath inside a pause doesn't end it
                runs[-1] = (runs[-1][0], j)
            else:
                runs.append((i, j))
            i = j
        else:
            i += 1
    need = len(lines) - 1
    if len(runs) < need:
        return None
    ranked = sorted(runs, key=lambda r: r[1] - r[0], reverse=True)
    cuts = sorted(ranked[:need])
    if need and (min(b - a for a, b in cuts) / 100 < MIN_PAUSE or
                 (len(ranked) > need and ranked[need - 1][1] - ranked[need - 1][0] <= ranked[need][1] - ranked[need][0])):
        return None
    bounds = [0] + [(a + b) // 2 * win for a, b in cuts] + [len(pcm) // 2]
    parts = [trim(pcm[a * 2:b * 2]) for a, b in zip(bounds, bounds[1:])]
    # a skipped or merged sentence shows up as a length mismatch against the chapter's own pace
    ratios = [len(p) / 2 / RATE / estimate(text) for p, text in zip(parts, lines)]
    pace = float(np.median(ratios))
    for r, text in zip(ratios, lines):
        if not 0.55 < r / pace < 1.8:
            print(f"    length check failed ({r / pace:.2f}x): {text}", flush=True)
            return None
    return parts


def main():
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("GEMINI_API_KEY is not set. Add it to the environment, then re-run.")
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    script = json.load(open(SCRIPT, encoding="utf-8"))
    chapters = [[s.get("tts", s["zh"]) for s in ch["sentences"]] for ch in script["chapters"]]
    total = sum(map(len, chapters))
    print(f"Gemini TTS: model={MODEL} voice={VOICE} chapters={len(chapters)} sentences={total}")
    n = 0
    for c, lines in enumerate(chapters):
        text = "\n".join(lines)
        h = hashlib.sha1(f"{MODEL}|{VOICE}|{STYLE}|{text}".encode()).hexdigest()[:16]
        cached = os.path.join(CACHE, f"ch_{h}.pcm")
        parts = split(open(cached, "rb").read(), lines) if os.path.exists(cached) else None
        for attempt in range(TRIES):
            if parts:
                break
            print(f"  chapter {c} ({len(lines)} sentences), try {attempt + 1}", flush=True)
            pcm = request(text)
            if pcm and (parts := split(pcm, lines)):
                open(cached, "wb").write(pcm)  # written only once the audio is known to split cleanly
        if not parts:
            sys.exit(f"Gemini TTS: chapter {c} could not be split into {len(lines)} sentences after {TRIES} tries")
        for p in parts:
            with wave.open(os.path.join(OUT_DIR, f"{n:03d}.wav"), "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(p)
            n += 1
    # remove stale files from a longer previous script
    for f in os.listdir(OUT_DIR):
        if f.endswith(".wav") and int(f[:3]) >= total:
            os.remove(os.path.join(OUT_DIR, f))
    print("done")


if __name__ == "__main__":
    main()
