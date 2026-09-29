#!/usr/bin/env python3
"""Generate narration with Gemini TTS, one WAV per sentence, into build/tts/.

The script is synthesized two chapters per request (one sentence per line), with
the pro TTS model. Single sentences drift in timbre from request to request, but
one long take drifts in tone and accent as it goes on; ~1.5-minute chunks keep
the delivery consistent. Each chunk is cut back into sentences at the longest
pauses, and each sentence is checked against its expected length.

Needs GEMINI_API_KEY in the environment. Optional overrides:
  GEMINI_TTS_MODEL  (default: gemini-2.5-pro-preview-tts)
  GEMINI_TTS_VOICE  (default: Sulafat — a warm female prebuilt voice)

Each chunk is cached by (model, voice, prompt), so re-runs fetch only chunks whose text changed.
Leading/trailing silence is trimmed so subtitle cues line up with the speech.
"""
import base64, hashlib, json, os, re, sys, time, urllib.request, urllib.error, wave, struct

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "script", "script.json")
OUT_DIR = os.path.join(ROOT, "build", "tts")
CACHE = os.path.join(ROOT, "build", "tts_cache")

MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-pro-preview-tts")
CHUNK = 2           # chapters per request
VOICE = os.environ.get("GEMINI_TTS_VOICE", "Sulafat")
RATE = 24000  # Gemini TTS returns 16-bit mono PCM at 24 kHz

STYLE = ("你是一位充滿熱情的科技 YouTuber，用台灣華語講解無線電傳播與鏈路規劃。"
         "語氣活潑有精神、抑揚頓挫明顯，重點詞加重語氣，問句要有問的語調，偶爾帶點笑意，"
         "節奏明快但每個字都清楚。英文技術名詞照英文發音。每一行是一句。每一句念完，"
         "一定要完全停頓整整兩秒再念下一句，句子裡面的逗號只要短暫停頓。只唸旁白內容：\n")
QUIET = 350        # 16-bit peak below which a 10 ms window counts as silence
MIN_PAUSE = 0.25   # a sentence break must be at least this long (seconds)
MIN_GAP = 0.12     # shorter silences are never considered as breaks
BLIP = 3           # loud 10 ms windows tolerated inside a pause
TRIES = 4          # regenerations when the audio can't be split cleanly


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
            with urllib.request.urlopen(req, timeout=900) as r:
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
            # e.g. finishReason OTHER with no audio; the caller retries
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


def align(runs, first, last, lines):
    """Pick len(lines) - 1 pauses (in order) as sentence breaks.

    Dynamic programming over candidate pauses: long pauses are rewarded, and each
    resulting sentence is penalized by how far its length strays from the text's
    expected share of the take. This survives takes where a sentence break is
    shorter than a comma pause elsewhere, as long as the lengths disagree.
    """
    est = [estimate(t) for t in lines]
    pace = (last - first) / 100 / sum(est)
    pts = [first] + [(a + b) / 2 for a, b in runs] + [last]
    gain = [0.0] + [(b - a) / 100 for a, b in runs] + [0.0]
    N, M = len(lines), len(pts)
    INF = float("inf")
    cost = [[INF] * M for _ in range(N + 1)]
    back = [[-1] * M for _ in range(N + 1)]
    cost[0][0] = 0.0
    for i in range(1, N + 1):
        for j in range(i, M):
            if i == N and j != M - 1:
                continue
            for k in range(i - 1, j):
                if cost[i - 1][k] == INF:
                    continue
                dur = (pts[j] - pts[k]) / 100
                c = cost[i - 1][k] + 2.0 * np.log(dur / (pace * est[i - 1])) ** 2 - 1.5 * gain[j]
                if c < cost[i][j]:
                    cost[i][j], back[i][j] = c, k
    if cost[N][M - 1] == INF:
        return None
    sel, j = [], M - 1
    for i in range(N, 0, -1):
        j = back[i][j]
        if i > 1:
            sel.append(runs[j - 1])
    return sorted(sel)


def split(pcm, lines):
    """Cut take audio into len(lines) sentences at pauses chosen by align(), or None if unclear."""
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
    runs = [r for r in runs if r[1] - r[0] >= MIN_GAP * 100]
    if len(runs) < need:
        return None
    cuts = align(runs, first, last, lines) if need else []
    if cuts is None or (need and min(b - a for a, b in cuts) / 100 < MIN_PAUSE):
        return None
    bounds = [0] + [(a + b) // 2 * win for a, b in cuts] + [len(pcm) // 2]
    parts = [trim(pcm[a * 2:b * 2]) for a, b in zip(bounds, bounds[1:])]
    # a skipped or merged sentence shows up as a length mismatch against the overall pace
    ratios = [len(p) / 2 / RATE / estimate(text) for p, text in zip(parts, lines)]
    pace = float(np.median(ratios))
    if not 0.7 < pace < 2.8:  # e.g. a take that is mostly silence
        print(f"    pace check failed ({pace:.2f}x)", flush=True)
        return None
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
    chunks = [sum(chapters[i:i + CHUNK], []) for i in range(0, len(chapters), CHUNK)]
    lines = sum(chunks, [])
    print(f"Gemini TTS: model={MODEL} voice={VOICE} sentences={len(lines)} requests={len(chunks)}")
    n = 0
    for c, part_lines in enumerate(chunks):
        text = "\n".join(part_lines)
        h = hashlib.sha1(f"{MODEL}|{VOICE}|{STYLE}|{text}".encode()).hexdigest()[:16]
        cached = os.path.join(CACHE, f"chunk_{h}.pcm")
        parts = split(open(cached, "rb").read(), part_lines) if os.path.exists(cached) else None
        for attempt in range(TRIES):
            if parts:
                break
            print(f"  chunk {c + 1}/{len(chunks)} ({len(part_lines)} sentences), try {attempt + 1}", flush=True)
            pcm = request(text)
            if pcm and (parts := split(pcm, part_lines)):
                open(cached, "wb").write(pcm)  # written only once the audio is known to split cleanly
        if not parts:
            sys.exit(f"Gemini TTS: chunk {c + 1} could not be split into {len(part_lines)} sentences after {TRIES} tries")
        for p in parts:
            with wave.open(os.path.join(OUT_DIR, f"{n:03d}.wav"), "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(p)
            n += 1
    # remove stale files from a longer previous script
    for f in os.listdir(OUT_DIR):
        if f.endswith(".wav") and int(f[:3]) >= len(lines):
            os.remove(os.path.join(OUT_DIR, f))
    print("done")


if __name__ == "__main__":
    main()
