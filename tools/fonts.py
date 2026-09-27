#!/usr/bin/env python3
"""Mirror the Google Fonts used by the page into build/fonts for offline rendering."""
import os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "fonts")
CSS_URL = ("https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900"
           "&family=JetBrains+Mono:wght@400;700&family=Oxanium:wght@500;700&display=block")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read()


os.makedirs(OUT, exist_ok=True)
css = get(CSS_URL).decode()
urls = sorted(set(re.findall(r"url\((https://[^)]+)\)", css)))


def fetch(u):
    name = re.sub(r"[^A-Za-z0-9._-]", "_", u.split("/s/")[1])
    path = os.path.join(OUT, name)
    if not os.path.exists(path):
        open(path, "wb").write(get(u))
    return u, name


with ThreadPoolExecutor(16) as ex:
    for u, name in ex.map(fetch, urls):
        css = css.replace(u, name)
open(os.path.join(OUT, "fonts.css"), "w").write(css)
print(f"{len(urls)} font files mirrored")
