// Dev-only smoke test: load the page headlessly, verify the game scene is
// actually running (not just that a canvas exists — that's how the blank
// screen from the broken Preloader slipped through), play a few seconds with
// real inputs (move/pass/charge-shot/juke), and capture console/page errors.
// Usage: node scripts/smoke.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/?team=thunder';
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });

// Wait until GameScene is actually running (Preloader → GameScene handoff).
// Times out at 10s — a stuck Preloader (the old blank-screen bug) fails here.
let scene = null;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  scene = await page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const gs = g.scene.getScene('GameScene');
    return {
      running: g.scene.getScenes(true).some((s) => s.scene.key === 'GameScene'),
      state: gs?.state ?? null,
      players: gs?.players?.length ?? 0,
      sprites: g.textures.getTextureKeys().filter((k) => k.startsWith('pkm')).length,
    };
  });
  if (scene?.running && scene?.state === 'live') break; // drop lasts 1.3s
}
console.log('scene:', JSON.stringify(scene));

const canvas = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { buffer: [c.width, c.height], css: [Math.round(r.width), Math.round(r.height)] };
});
console.log('canvas:', JSON.stringify(canvas));

// Play ~5s with real inputs: move, pass, charge shot, juke, check.
await page.keyboard.down('KeyD');
await page.waitForTimeout(900);
await page.keyboard.up('KeyD');
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.keyboard.down('Enter');
await page.waitForTimeout(900);
await page.keyboard.up('Enter');
await page.waitForTimeout(300);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(300);
await page.keyboard.press('KeyK');
await page.waitForTimeout(300);
await page.keyboard.press('KeyL');
await page.waitForTimeout(2500);

// The match must have progressed (drop → live) and the canvas must be visible.
const ok =
  scene?.running === true &&
  scene?.state === 'live' &&
  canvas && canvas.css[0] > 0 && canvas.css[1] > 0;
console.log('game running:', ok ? 'yes' : 'NO');

const filtered = errors.filter(
  (e) => !e.includes('404') && !e.includes('favicon'), // favicon etc.
);
console.log('errors:', filtered.length ? '\n' + filtered.join('\n---\n') : 'none');
await browser.close();
process.exit(ok && filtered.length === 0 ? 0 : 1);
