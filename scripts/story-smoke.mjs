// Story integration smoke: real Phaser scenes, with controlled match outcomes.
// Usage: node scripts/story-smoke.mjs http://127.0.0.1:5173
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__game?.scene.isActive('TitleScene'));
  await page.evaluate(async () => {
    window.storyTest = await import('/scripts/storyHarness.ts');
  });
  const scene = async (key, data) => {
    await page.evaluate(({ key, data }) => { const active = window.__game.scene.getScenes(true)[0]; active.scene.start(key, data); }, { key, data });
    await page.waitForTimeout(100);
  };
  const dismiss = async () => {
    for (let i = 0; i < 30 && await page.evaluate(() => window.__game.scene.isActive('DialogueScene')); i++) {
      await page.keyboard.press('Enter'); await page.waitForTimeout(50);
    }
  };
  await page.evaluate(() => {
    const { meta, run } = window.storyTest;
    meta.resetMetaState(); meta.chooseStarter('larvitar'); meta.beginNewYear(); run.resetRun();
  });
  await scene('DialogueScene', await page.evaluate(() => ({ ...window.storyTest.story.yearOpening(1), nextScene: 'ZoneSelectScene' })));
  await page.screenshot({ path: '/tmp/ice-story-intro.png' });
  await dismiss();
  assert(await page.evaluate(() => window.__game.scene.isActive('ZoneSelectScene')));
  await page.evaluate(() => window.storyTest.meta.updateMeta({ daysRemaining: 0 }));
  await scene('BattleTowerScene'); await dismiss();
  assert.equal(await page.evaluate(() => window.storyTest.meta.getMeta().bracket.rounds[0].length), 16);
  await page.screenshot({ path: '/tmp/ice-story-bracket.png' });
  for (let round = 0; round < 4; round++) {
    const teamId = await page.evaluate(round => window.storyTest.meta.getMeta().bracket.rounds[round][1], round);
    await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    assert(await page.evaluate(() => window.__game.scene.isActive('GameScene')));
    await scene('ResultScene', { teamId, userScore: 3, opponentScore: 0, tournament: true, towerFloor: round });
    const xp = await page.evaluate(() => window.storyTest.meta.getMeta().starterXp.larvitar);
    // Reopening the same result cannot award more XP or restoration progress.
    await scene('ResultScene', { teamId, userScore: 3, opponentScore: 0, tournament: true, towerFloor: round });
    assert.equal(await page.evaluate(() => window.storyTest.meta.getMeta().starterXp.larvitar), xp);
    await page.keyboard.press('Enter'); await page.waitForTimeout(100); await dismiss();
  }
  assert(await page.evaluate(() => window.storyTest.meta.getMeta().story.happyEnding));
  assert(await page.evaluate(() => window.__game.scene.isActive('VictoryScene')));
  // Seed two genuine failed seasons, then inspect the changed world.
  await page.evaluate(() => {
    const { meta, run } = window.storyTest;
    meta.resetMetaState(); meta.chooseStarter('gible'); meta.beginNewYear(); run.resetRun();
    meta.updateMeta({ story: { ...meta.getMeta().story, towerVisited: true } });
    meta.beginNewYear(); run.resetRun(); meta.beginNewYear(); run.resetRun();
  });
  await scene('ZoneSelectScene'); await dismiss();
  assert(await page.evaluate(() => window.storyTest.meta.getMeta().story.catastrophe));
  await page.screenshot({ path: '/tmp/ice-story-catastrophe.png' });
  // Championships restore the world and unlock the separate final match.
  await page.evaluate(() => {
    const { meta, run } = window.storyTest;
    for (let i = 0; i < 3; i++) { meta.settleSeason(true); if (i < 2) { meta.beginNewYear(); run.resetRun(); } }
  });
  await scene('VictoryScene'); await dismiss();
  await scene('BattleTowerScene', { finalBoss: true }); await dismiss();
  assert(await page.evaluate(() => window.__game.scene.isActive('GameScene')));
  await scene('ResultScene', { teamId: 'story-arceus', userScore: 0, opponentScore: 3, tournament: true, towerFloor: 4 });
  await page.keyboard.press('Enter'); await page.waitForTimeout(100); await dismiss();
  await scene('BattleTowerScene', { finalBoss: true }); await dismiss();
  assert(await page.evaluate(() => window.__game.scene.isActive('GameScene')));
  await scene('ResultScene', { teamId: 'story-arceus', userScore: 3, opponentScore: 0, tournament: true, towerFloor: 4 });
  await page.keyboard.press('Enter'); await page.waitForTimeout(100); await dismiss();
  assert(await page.evaluate(() => window.storyTest.meta.getMeta().story.arceusDefeated));
  assert(await page.evaluate(() => window.__game.scene.isActive('VictoryScene')));
  assert.deepEqual(errors, []);
  console.log('PASS: opening, full bracket, four matches, idempotent results, early ending, catastrophe, restoration, Arceus defeat/retry/victory. No browser exceptions.');
} catch (error) { console.error('Active scenes:', await page.evaluate(() => window.__game.scene.getScenes(true).map(s => s.scene.key)), 'Browser errors:', errors); throw error; } finally { await browser.close(); }
