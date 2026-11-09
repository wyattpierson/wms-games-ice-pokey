import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.argv[2] || 'http://127.0.0.1:5174');
  await page.waitForFunction(() => window.__game?.scene.isActive('TitleScene'));
  await page.evaluate(async () => { window.storyTest = await import('/scripts/storyHarness.ts'); });
  const show = async (speaker, starter = 'larvitar', xp = 0, catastrophe = false) => {
    await page.evaluate(({ speaker, starter, xp, catastrophe }) => {
      const { meta } = window.storyTest;
      meta.resetMetaState(); meta.chooseStarter(starter);
      meta.updateMeta({ starterXp: { ...meta.getMeta().starterXp, [starter]: xp }, story: { ...meta.getMeta().story, catastrophe } });
      const active = window.__game.scene.getScenes(true)[0];
      active.scene.start('DialogueScene', { lines: [{ speaker, text: 'We’re going to be the best team in the world.' }, { speaker: 'UNKNOWN', text: '…can you hear… hurry…' }] });
    }, { speaker, starter, xp, catastrophe });
    await page.waitForTimeout(150);
    return page.evaluate(() => window.__game.scene.getScene('DialogueScene').children.list.filter(c => c.type === 'Container').flatMap(c => c.list.filter(o => o.type === 'Image').map(o => o.texture.key)));
  };
  for (const [starter, stages, rival] of [['larvitar', [246,247,248],445], ['gible',[443,444,445],373], ['bagon',[371,372,373],248]]) {
    for (const [i,xp] of [0,40,100].entries()) assert.deepEqual(await show('YOU',starter,xp), [`pkm-${stages[i]}`, 'trainer-player']);
    assert.deepEqual(await show('RILEY',starter), [`pkm-${rival}`, 'trainer-rival']);
  }
  await show('YOU'); await page.screenshot({ path: '/tmp/ice-portrait-player.png' });
  await show('RILEY'); await page.screenshot({ path: '/tmp/ice-portrait-rival.png' });
  assert.deepEqual(await show('COACH VALEN'), ['trainer-valen']);
  assert.deepEqual(await show('COACH VALEN','gible',0,true), ['trainer-valen-revealed']);
  await page.screenshot({ path: '/tmp/ice-portrait-valen.png' });
  assert.deepEqual(await show('MIMIKYU'), ['pkm-778']);
  await page.screenshot({ path: '/tmp/ice-portrait-mimikyu.png' });
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.__game.scene.getScene('DialogueScene').children.list.filter(c => c.type === 'Container').flatMap(c => c.list.filter(o => o.type === 'Image'))), []);
  assert.deepEqual(await show('UNKNOWN'), []);
  assert.deepEqual(errors, []);
  console.log('PASS: all starter evolutions, rival partners, Valen reveal, Mimikyu, unknown signal, and portrait cleanup.');
} finally { await browser.close(); }
