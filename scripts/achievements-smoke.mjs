// Browser integration: real goal hooks, queued toasts, trophy secrecy, and the wipe dialog.
// Run against Vite: node scripts/achievements-smoke.mjs http://127.0.0.1:5173
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: 1192, height: 672 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Exercise the built-in offline sprite fallback as well as avoiding external network waits.
  await page.route('https://raw.githubusercontent.com/**', route => route.abort());
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__game?.scene.isActive('TitleScene'));
  const openRoom = async () => {
    await page.evaluate(() => window.__game.scene.getScene('TitleScene').children.list.find(c => c.text === 'ACHIEVEMENTS').emit('pointerdown'));
    await page.waitForFunction(() => window.__game.scene.isActive('AchievementsScene'));
  };
  const roomText = () => page.evaluate(() => {
    const collect = c => [c.text || '', ...(c.list || []).flatMap(collect)];
    return window.__game.scene.getScene('AchievementsScene').children.list.flatMap(collect).join('\n');
  });
  await openRoom();
  assert.equal((await roomText()).match(/Unknown/g).length, 8);
  assert.ok(!(await roomText()).includes('Little Goal Getter'));
  await page.screenshot({ path: '/tmp/ice-pokey-achievements-locked.png' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.scene.isActive('TitleScene'));
  await page.evaluate(async () => {
    const career = await import('/src/state/careerStatsStore.ts');
    const meta = await import('/src/state/metaStore.ts');
    meta.chooseStarter('larvitar');
    career.beginCareerRun('Test', 1);
    career.beginCareerMatch();
    for (let i = 0; i < 10; i++) career.recordCareerGoal(0, { name: 'Larvitar', sprite: 246, isStarter: true });
  });
  await page.waitForFunction(() => window.__game.scene.getScene('AchievementToastScene').children.list.some(c => c.list?.some(t => t.text === 'Little Goal Getter')));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/ice-pokey-achievement-toast.png' });
  // A scene transition cannot discard an in-flight notification.
  await openRoom();
  assert.ok((await roomText()).includes('Score 10 career goals'));
  assert.equal((await roomText()).match(/Unknown/g).length, 7);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: '/tmp/ice-pokey-achievements-earned.png' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.scene.isActive('TitleScene'));
  await page.evaluate(() => window.__game.scene.getScene('TitleScene').children.list.find(c => c.text === 'WIPE ALL DATA').emit('pointerdown'));
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/ice-pokey-achievements-wipe.png' });
  await page.evaluate(() => window.__game.scene.getScene('TitleScene').children.list.find(c => c.text === 'WIPE SAVE DATA').emit('pointerdown'));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ice-pokey:achievements:v1')).starterGoals), 10);
  assert.equal(await page.evaluate(() => localStorage.getItem('ice-pokey:career-stats:v1')), null);
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.isActive('TitleScene'));
  await openRoom();
  assert.ok((await roomText()).includes('Little Goal Getter'));
  assert.deepEqual(errors, []);
  console.log('PASS: hidden criteria, immediate starter trophy, toast across scene transitions, wipe preservation, reload persistence, and no browser errors.');
} finally {
  await browser.close();
}
