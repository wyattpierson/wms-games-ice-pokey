// Dev-only smoke test: load the page headlessly and walk the WHOLE campaign
// pipeline with real inputs — Title → Opponent Select → Match (live) → pause
// overlay → forfeit → Game Over → saved run on reload. Captures console/page
// errors along the way. Usage: node scripts/smoke.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
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

const activeScene = () =>
  page.evaluate(() => window.__game?.scene.getScenes(true).map((s) => s.scene.key) ?? []);

async function waitForScene(key, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const scenes = await activeScene();
    if (scenes.includes(key)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

let failed = false;
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
};

await page.goto(url, { waitUntil: 'networkidle' });

// 1. Title screen.
check('title scene is active', await waitForScene('TitleScene'));
await page.waitForTimeout(300);

// 2. Enter = NEW RUN → opponent select.
await page.keyboard.press('Enter');
check('opponent select after NEW RUN', await waitForScene('OpponentSelectScene'));
await page.waitForTimeout(300);

// 3. Digit 1 → campaign match vs the first team.
await page.keyboard.press('Digit1');
const inMatch = await waitForScene('GameScene');
check('game scene after picking opponent 1', inMatch);
await page.waitForTimeout(2500); // drop (1.3s) → live

const match = await page.evaluate(() => {
  const g = window.__game;
  const gs = g.scene.getScene('GameScene');
  return {
    state: gs?.state ?? null,
    campaign: gs?.campaign ?? null,
    players: gs?.players?.length ?? 0,
    opponent: gs?.oppTeam?.name ?? null,
    sprites: g.textures.getTextureKeys().filter((k) => k.startsWith('pkm')).length,
  };
});
console.log('match:', JSON.stringify(match));
check('match is live', match.state === 'live');
check('match is a campaign match', match.campaign === true);
check('8 players on the ice', match.players === 8);
check('opponent is Tidal Wave', match.opponent === 'Tidal Wave');
check('all sprites loaded', match.sprites >= 16);

// 4. Play a couple of seconds with real inputs.
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(700);
await page.keyboard.up('ArrowRight');
await page.keyboard.press('Space');
await page.waitForTimeout(500);

// 5. ESC → pause overlay.
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const paused = await page.evaluate(() => window.__game.scene.getScene('GameScene')?.pauseOverlay?.visible);
check('pause overlay visible after ESC', paused === true);

// 6. F → confirm dialog; Enter → confirm forfeit → Game Over.
await page.keyboard.press('KeyF');
await page.waitForTimeout(300);
const dialog = await page.evaluate(() => !!window.__game.scene.getScene('GameScene')?.pauseOverlay?.dialog);
check('forfeit confirm dialog open', dialog === true);
await page.keyboard.press('Enter');
check('game over scene after forfeit', await waitForScene('GameOverScene'));

// 7. The run was saved as forfeited.
const saved = await page.evaluate(() => {
  try {
    const raw = localStorage.getItem('ice-pokey:run');
    if (!raw) return null;
    const { run } = JSON.parse(raw);
    return { gameOver: run.gameOver, victory: run.victory, inProgress: !!run.matchInProgress };
  } catch {
    return 'parse-error';
  }
});
console.log('saved run:', JSON.stringify(saved));
check('saved run is forfeited and complete', saved?.gameOver === true && saved.victory === false && saved.inProgress === false);

const titleTexts = () =>
  page.evaluate(() =>
    window.__game.scene
      .getScene('TitleScene')
      .children.list.filter((c) => c.type === 'Text')
      .map((t) => t.text),
  );

// 8. Reload after a CLEAN forfeit: the run completed, so there is NO
//    "left unfinished" notice (that one is only for mid-match reloads).
await page.reload({ waitUntil: 'networkidle' });
check('title scene after reload', await waitForScene('TitleScene'));
const afterReload = { texts: await titleTexts() };
console.log('title after clean-forfeit reload:', JSON.stringify(afterReload.texts));
check('no abandoned-match notice after a clean forfeit',
  !afterReload.texts.some((t) => String(t).includes('left unfinished')));

// 9. Start a fresh run and reload MID-MATCH: the unfinished match is counted as
//    a forfeit and the title shows the abandoned-match notice.
await page.keyboard.press('Enter'); // NEW RUN
check('opponent select (second run)', await waitForScene('OpponentSelectScene'));
await page.waitForTimeout(300);
await page.keyboard.press('Digit1');
check('second match started', await waitForScene('GameScene'));
let live = false;
for (let i = 0; i < 40; i++) {
  live = (await page.evaluate(() => window.__game.scene.getScene('GameScene')?.state)) === 'live';
  if (live) break;
  await page.waitForTimeout(250);
}
check('second match reached live before reload', live);
await page.reload({ waitUntil: 'networkidle' });
check('title scene after mid-match reload', await waitForScene('TitleScene'));
const midReload = { texts: await titleTexts() };
console.log('title after mid-match reload:', JSON.stringify(midReload.texts));
check('abandoned-match notice shown after mid-match reload',
  midReload.texts.some((t) => String(t).includes('left unfinished')));
const savedMid = await page.evaluate(() => {
  try {
    const raw = localStorage.getItem('ice-pokey:run');
    if (!raw) return null;
    const { run } = JSON.parse(raw);
    return { gameOver: run.gameOver, inProgress: !!run.matchInProgress };
  } catch {
    return 'parse-error';
  }
});
console.log('saved run after mid-match reload:', JSON.stringify(savedMid));
check('mid-match reload saved as forfeited + complete',
  savedMid?.gameOver === true && savedMid.inProgress === false);

const filtered = errors.filter((e) => !e.includes('404') && !e.includes('favicon'));
console.log('errors:', filtered.length ? '\n' + filtered.join('\n---\n') : 'none');
await browser.close();
process.exit(failed || filtered.length > 0 ? 1 : 0);
