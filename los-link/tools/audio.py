#!/usr/bin/env python3
"""Synthesize the original background score and mix it with the narration.

- Music: D-minor ambient-tech loop (pad, pluck arpeggio, sub bass, soft drums),
  generated from scratch with numpy — no samples, no third-party material.
- A whoosh + chime marks each chapter start.
- Ducking: while narration plays, the music drops ~11 dB with a 120 ms attack
  and 550 ms release, driven by the sentence timings in web/data.js.
- Output: build/mix.wav, then loudness-normalized web/audio.mp3 and build/mix.m4a.
"""
import json, os, re, subprocess, wave
import numpy as np
from scipy.signal import resample_poly, lfilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
rng = np.random.default_rng(7)


def load_data():
    txt = open(os.path.join(ROOT, "web", "data.js"), encoding="utf-8").read()
    return json.loads(txt[txt.index("{"): txt.rindex("}") + 1])


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------- instruments ----------
TABLE_N = 4096
_ph = np.arange(TABLE_N) / TABLE_N
SAW = sum(np.sin(2 * np.pi * k * _ph) / k for k in range(1, 12)) * 0.55
SOFT = np.sin(2 * np.pi * _ph) + 0.25 * np.sin(4 * np.pi * _ph) + 0.08 * np.sin(6 * np.pi * _ph)


def osc(table, freq, n, phase0=0.0):
    ph = (phase0 + np.arange(n) * freq / SR) % 1.0
    return table[(ph * TABLE_N).astype(int)]


def onepole_lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    return lfilter([1 - a], [1, -a], x)


def adsr(n, a, r):
    env = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    env[:na] = np.linspace(0, 1, na)
    env[-nr:] *= np.linspace(1, 0, nr)
    return env


def add(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


# ---------- score ----------
BPM = 88
BEAT = 60 / BPM
BAR = BEAT * 4
# (root, chord tones as MIDI) — Dm9, Bbmaj9, Fmaj7, Cadd9
CHORDS = [
    (38, [50, 53, 57, 60, 64]),
    (34, [46, 50, 53, 57, 60]),
    (41, [53, 57, 60, 64, 67]),
    (36, [48, 52, 55, 60, 62]),
]
ARP_ORDER = [0, 2, 3, 4, 3, 2, 1, 2]


def render_music(dur, chapter_starts):
    n = int(dur * SR) + SR
    padL, padR = np.zeros(n), np.zeros(n)
    arp, bass, drums = np.zeros(n), np.zeros(n), np.zeros(n)
    seg = BAR * 2
    total_bars = int(dur / BAR) + 1

    # pad + bass
    t, ci = 0.0, 0
    while t < dur:
        root, notes = CHORDS[ci % 4]
        m = int((seg + 1.6) * SR)
        env = adsr(m, 1.2, 1.6)
        for idx, note in enumerate(notes):
            for det, pan in ((-0.07, 0.2), (0.0, 0.5), (0.08, 0.8)):
                f = midi(note + det)
                s = osc(SAW, f, m, rng.random()) * env * 0.022
                add(padL, t, s * (1 - pan))
                add(padR, t, s * pan)
        for b in range(2):
            for half in range(2):
                bt = t + b * BAR + half * BEAT * 2
                mm = int(BEAT * 2 * SR)
                e = np.exp(-np.linspace(0, 3.5, mm)) * adsr(mm, 0.01, 0.05)
                add(bass, bt, osc(SOFT, midi(root), mm) * e * 0.16)
        t += seg
        ci += 1

    # arpeggio: 16ths, enters after 4 bars, rests during the last 4 bars
    step = BEAT / 4
    k = 0
    tt = BAR * 4
    while tt < dur - BAR * 4:
        root, notes = CHORDS[int(tt // seg) % 4]
        note = notes[ARP_ORDER[k % 8]] + 12
        mm = int(0.45 * SR)
        e = np.exp(-np.linspace(0, 9, mm)) * adsr(mm, 0.004, 0.02)
        vel = 0.55 + 0.45 * (k % 4 == 0)
        add(arp, tt, osc(SOFT, midi(note), mm) * e * 0.05 * vel)
        tt += step
        k += 1

    # drums: soft kick on 1 & 3, closed hat on the off-8ths, from bar 8
    for bar in range(8, total_bars - 4):
        b0 = bar * BAR
        for beat in (0, 2):
            mm = int(0.35 * SR)
            tk = np.arange(mm) / SR
            f = 45 + 75 * np.exp(-tk * 30)
            kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 11)
            add(drums, b0 + beat * BEAT, kick * 0.22)
        for e8 in range(8):
            if e8 % 2 == 1:
                mm = int(0.06 * SR)
                hat = np.diff(rng.standard_normal(mm + 1)) * np.exp(-np.linspace(0, 8, mm))
                add(drums, b0 + e8 * BEAT / 2, hat * 0.018)

    # stereo ping-pong delay on the arp
    d = int(BEAT * 0.75 * SR)
    arpL, arpR = arp.copy(), arp.copy() * 0.6
    echo = np.zeros(n)
    echo[d:] = arp[:-d] * 0.35
    arpR += echo
    echo2 = np.zeros(n)
    echo2[2 * d:] = arp[:-2 * d] * 0.18
    arpL += echo2

    padL = onepole_lp(padL, 1400)
    padR = onepole_lp(padR, 1400)
    L = padL + arpL + bass + drums
    R = padR + arpR + bass + drums

    # chapter whoosh + chime
    for cs in chapter_starts:
        mm = int(1.6 * SR)
        noise = rng.standard_normal(mm)
        sweep = np.linspace(0, 1, mm) ** 2.2
        wh = np.zeros(mm)
        cut = 300 + 5000 * sweep
        a = np.exp(-2 * np.pi * cut / SR)
        y = 0.0
        for i in range(mm):  # time-varying one-pole lowpass
            y = (1 - a[i]) * noise[i] + a[i] * y
            wh[i] = y
        wh *= sweep * np.linspace(1, 0.2, mm) ** 0.5 * 0.10
        add(L, max(0, cs - 1.3), wh)
        add(R, max(0, cs - 1.3), wh)
        mm = int(2.2 * SR)
        tk = np.arange(mm) / SR
        bell = sum(np.sin(2 * np.pi * midi(74) * p * tk) * g * np.exp(-tk * dcy)
                   for p, g, dcy in ((1, 1, 2.2), (2.76, 0.45, 3.5), (5.4, 0.2, 5)))
        add(L, cs + 0.25, bell * 0.04)
        add(R, cs + 0.27, bell * 0.04)

    out = np.stack([L, R])[:, : int(dur * SR)]
    fade_in, fade_out = int(2.5 * SR), int(4 * SR)
    out[:, :fade_in] *= np.linspace(0, 1, fade_in)
    out[:, -fade_out:] *= np.linspace(1, 0, fade_out)
    return out


def duck_env(dur, sentences, depth=0.28):
    ctl = 200  # control rate (Hz)
    m = int(dur * ctl) + 1
    target = np.ones(m)
    for s in sentences:
        a = int(max(0, s["start"] - 0.15) * ctl)
        b = int((s["end"] + 0.25) * ctl)
        target[a:b] = depth
    env = np.empty(m)
    g = 1.0
    att, rel = np.exp(-1 / (0.12 * ctl)), np.exp(-1 / (0.55 * ctl))
    for i in range(m):
        c = att if target[i] < g else rel
        g = c * g + (1 - c) * target[i]
        env[i] = g
    return np.interp(np.arange(int(dur * SR)) / SR, np.arange(m) / ctl, env)


def main():
    data = load_data()
    tl = data["timeline"]
    dur = tl["duration"]
    music = render_music(dur, [c["start"] for c in tl["chapters"]])
    music /= np.max(np.abs(music)) + 1e-9
    music *= 0.5

    voice = np.zeros(music.shape[1])
    if tl["narrated"]:
        for s in tl["sentences"]:
            with wave.open(os.path.join(ROOT, "build", "tts", f"{s['n']:03d}.wav")) as w:
                sr = w.getframerate()
                pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float) / 32768
            if sr != SR:
                g = np.gcd(SR, sr)
                pcm = resample_poly(pcm, SR // g, sr // g)
            add(voice, s["start"], pcm)
        voice /= np.max(np.abs(voice)) + 1e-9
        voice *= 0.9
        music *= duck_env(dur, tl["sentences"])[None, :]

    mix = music + voice[None, :]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16).T.copy()
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    raw = os.path.join(ROOT, "build", "mix.wav")
    with wave.open(raw, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

    ln = "loudnorm=I=-16:TP=-1.5:LRA=11" if tl["narrated"] else "loudnorm=I=-20:TP=-2:LRA=11"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", ln, "-ar", "44100",
                    "-c:a", "libmp3lame", "-b:a", "160k", os.path.join(ROOT, "web", "audio.mp3")], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", ln, "-ar", "48000",
                    "-c:a", "aac", "-b:a", "192k", os.path.join(ROOT, "build", "mix.m4a")], check=True)
    print(f"mixed {dur:.1f}s ({'with narration' if tl['narrated'] else 'music only — no TTS yet'})")


if __name__ == "__main__":
    main()
