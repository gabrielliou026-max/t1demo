// Render check frames: one per sentence (late in the sentence, when its visuals are fully in)
// plus each chapter title card. Usage: node tools/shots.mjs [filter-chapter-index]
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.NODE_GLOBAL || '/opt/node22/lib/node_modules', 'playwright'));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'build', 'shots');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const only = process.argv[2] !== undefined ? Number(process.argv[2]) : null;
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript({ content: 'window.EXTRA_TEXT=' + JSON.stringify(fs.readFileSync(path.join(root, 'web', 'engine.js'), 'utf8')) });
await page.goto('file://' + path.join(root, 'tools', 'render.html'));
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const tl = await page.evaluate(() => window.timeline);
const jobs = [];
tl.chapters.forEach((c, i) => { if (only === null || only === i) jobs.push([`c${i}_card`, c.start + (i === 0 ? 1.5 : 0.8)]); });
if (only === 0 || only === null) jobs.push(['c0_card2', tl.chapters[0].start + 3.6]);
tl.sentences.forEach((s) => {
  if (only !== null && s.c !== only) return;
  jobs.push([`c${s.c}_s${String(s.k).padStart(2, '0')}`, s.start + (s.end - s.start) * 0.88]);
});
for (const [name, t] of jobs) {
  await page.evaluate((t) => window.renderAt(t), t);
  const el = await page.$('#c');
  await el.screenshot({ path: path.join(out, name + '.png') });
}
await browser.close();
console.log(`${jobs.length} shots → ${out}`);
