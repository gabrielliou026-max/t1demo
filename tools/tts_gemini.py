#!/usr/bin/env python3
"""Generate narration with Gemini TTS, one WAV per sentence, into build/tts/.

Needs GEMINI_API_KEY in the environment. Optional overrides:
  GEMINI_TTS_MODEL  (default: gemini-2.5-flash-preview-tts)
  GEMINI_TTS_VOICE  (default: Sulafat — a warm female prebuilt voice)

Results are cached by (model, voice, prompt) so re-runs only fetch changed lines.
Leading/trailing silence is trimmed so subtitle cues line up with the speech.
"""
import base64, hashlib, json, os, sys, time, urllib.request, urllib.error, wave, struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "script", "script.json")
OUT_DIR = os.path.join(ROOT, "build", "tts")
CACHE = os.path.join(ROOT, "build", "tts_cache")

MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
VOICE = os.environ.get("GEMINI_TTS_VOICE", "Sulafat")
RATE = 24000  # Gemini TTS returns 16-bit mono PCM at 24 kHz

STYLE = ("請用台灣口音的年輕女性聲音朗讀，語氣溫暖、清楚，像在說故事給工程師聽，"
         "語速自然適中，英文技術名詞照英文發音。只唸冒號後面的句子：")


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
            with urllib.request.urlopen(req, timeout=120) as r:
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
        except (KeyError, IndexError) as e:
            if attempt < 5:
                time.sleep(3)
                continue
            sys.exit(f"Unexpected Gemini response: {e}")


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


def main():
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("GEMINI_API_KEY is not set. Add it to the environment, then re-run.")
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    script = json.load(open(SCRIPT, encoding="utf-8"))
    lines = [s.get("tts", s["zh"]) for ch in script["chapters"] for s in ch["sentences"]]
    print(f"Gemini TTS: model={MODEL} voice={VOICE} sentences={len(lines)}")
    for n, text in enumerate(lines):
        h = hashlib.sha1(f"{MODEL}|{VOICE}|{STYLE}|{text}".encode()).hexdigest()[:16]
        cached = os.path.join(CACHE, h + ".pcm")
        if not os.path.exists(cached):
            print(f"  [{n:02d}] {text}", flush=True)
            open(cached, "wb").write(trim(request(text)))
        pcm = open(cached, "rb").read()
        with wave.open(os.path.join(OUT_DIR, f"{n:03d}.wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm)
    # remove stale files from a longer previous script
    for f in os.listdir(OUT_DIR):
        if f.endswith(".wav") and int(f[:3]) >= len(lines):
            os.remove(os.path.join(OUT_DIR, f))
    print("done")


if __name__ == "__main__":
    main()
