#!/usr/bin/env python3
"""Tile build/shots/*.png into 2x2 contact sheets in build/sheets (for visual review)."""
import glob, os, shutil, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots, out = os.path.join(root, 'build', 'shots'), os.path.join(root, 'build', 'sheets')
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
pref = sys.argv[1] if len(sys.argv) > 1 else ''
files = sorted(f for f in glob.glob(os.path.join(shots, pref + '*.png')))
for i in range(0, len(files), 4):
    grp = files[i:i + 4]
    while len(grp) < 4:
        grp.append(grp[-1])
    args = []
    for f in grp:
        args += ['-i', f]
    name = os.path.join(out, f"{i // 4:02d}_{os.path.basename(grp[0])}")
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args, '-filter_complex',
                    '[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];'
                    '[a][b]hstack[t];[c][d]hstack[u];[t][u]vstack', name], check=True)
print('\n'.join(sorted(os.listdir(out))))
