// Render every frame (1920×1080, 30 fps) with headless Chromium, then mux with the audio mix.
// Usage: node tools/render.mjs [workers=4] [seconds-limit]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.NODE_GLOBAL || '/opt/node22/lib/node_modules', 'playwright'));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const frames = path.join(root, 'build', 'frames');
const workers = Number(process.argv[2] || 4);
const limit = process.argv[3] ? Number(process.argv[3]) : null;
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });
const engineSrc = fs.readFileSync(path.join(root, 'web', 'engine.js'), 'utf8');

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.addInitScript({ content: 'window.EXTRA_TEXT=' + JSON.stringify(engineSrc) });
  await page.goto('file://' + path.join(root, 'tools', 'render.html'));
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
  return page;
}
const first = await openPage();
const tl = await first.evaluate(() => window.timeline);
const fps = tl.fps;
const total = Math.ceil((limit ?? tl.duration) * fps);
const t0 = Date.now();
let done = 0;
async function work(page, w) {
  for (let f = w; f < total; f += workers) {
    const url = await page.evaluate((t) => window.frameJPEG(t, 0.94), f / fps);
    fs.writeFileSync(path.join(frames, `${String(f).padStart(5, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    if (++done % 300 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`${done}/${total} frames  ${(done / el).toFixed(1)} fps  eta ${((total - done) / (done / el)).toFixed(0)}s`);
    }
  }
}
const pages = [first];
for (let i = 1; i < workers; i++) pages.push(await openPage());
await Promise.all(pages.map((p, i) => work(p, i)));
await browser.close();
console.log(`rendered ${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const out = path.join(root, 'out', limit ? 'preview.mp4' : 'CAS-CCS-signaling-1080p.mp4');
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'),
  '-i', path.join(root, 'build', 'mix.m4a'),
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'animation',
  '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
