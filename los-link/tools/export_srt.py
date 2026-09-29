#!/usr/bin/env python3
"""Write out/*.zh-TW.srt and out/*.en.srt from the sentence timings in web/data.js.

Cue timing matches the on-screen subtitles in engine.js: each line appears 0.12 s
before its narration and stays until just before the next line in the same
chapter (or 0.55 s after it ends at a chapter break).
"""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
txt = open(os.path.join(root, 'web', 'data.js'), encoding='utf-8').read()
ss = json.loads(txt[txt.index('{'): txt.rindex('}') + 1])['timeline']['sentences']


def ts(t):
    ms = int(round(max(0, t) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


for lang, key in (('zh-TW', 'zh'), ('en', 'en')):
    out = []
    for i, s in enumerate(ss):
        nx = ss[i + 1] if i + 1 < len(ss) else None
        end = nx['start'] - 0.12 if nx and nx['c'] == s['c'] else s['end'] + 0.55
        out += [str(i + 1), f"{ts(s['start'] - 0.12)} --> {ts(end)}", s[key], '']
    path = os.path.join(root, 'out', f'LOS-link-frequency-1080p.{lang}.srt')
    open(path, 'w', encoding='utf-8').write('\n'.join(out))
    print('wrote', os.path.relpath(path, root))
