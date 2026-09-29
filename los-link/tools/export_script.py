#!/usr/bin/env python3
"""Write SCRIPT.md: the bilingual narration script with timecodes from web/data.js."""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
txt = open(os.path.join(root, 'web', 'data.js'), encoding='utf-8').read()
d = json.loads(txt[txt.index('{'): txt.rindex('}') + 1])
tl = d['timeline']
fmt = lambda s: f"{int(s // 60):02d}:{int(s % 60):02d}"
out = [f"# {d['title']['zh']}", f"_{d['title']['en']}_", "",
       f"總長 Duration: {fmt(tl['duration'])} · {len(tl['chapters'])} 章 chapters · {len(tl['sentences'])} 句 lines · "
       f"{'Gemini TTS 旁白時間' if tl['narrated'] else '預估時間（尚未產生 TTS）estimated timing, TTS not generated yet'}",
       "", f"旁白聲音 Voice: {d['voice']['style']} / {d['voice']['styleEn']}", ""]
for i, c in enumerate(tl['chapters']):
    out += [f"## {i + 1:02d}. {c['zh']} — {c['en']}  `{fmt(c['start'])}`", ""]
    for s in tl['sentences']:
        if s['c'] == i:
            out += [f"- `{fmt(s['start'])}` {s['zh']}  ", f"  {s['en']}"]
    out.append("")
out += ["## 角色 Characters", ""]
for ch in d['characters']:
    out += [f"- **{ch['zh']} {ch['en']}** — {ch['roleZh']} / {ch['roleEn']}：{ch['descZh']} / {ch['descEn']}"]
open(os.path.join(root, 'SCRIPT.md'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('wrote SCRIPT.md')
