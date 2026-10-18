import Phaser from 'phaser';
import { teamById, type CampaignState } from '../core/campaign';
import { averageOverall } from '../core/poach';
import { FILL, FONT, THEME, hex } from './theme';
import { rosterStrip } from './menu';

/**
 * End-of-run recap: match results + poaches (left) and the final roster (right).
 * Used by VictoryScene and GameOverScene.
 */
export function runSummaryPanel(scene: Phaser.Scene, cx: number, cy: number, state: CampaignState): void {
  const W = 780;
  const H = 320;
  scene.add.rectangle(cx, cy, W, H, FILL.plate, 1).setStrokeStyle(2, THEME.DIM);

  const lx = cx - W / 2 + 48;
  scene.add.text(lx, cy - 124, 'RESULTS', { fontFamily: FONT, fontSize: '13px', color: hex(THEME.DIM) });
  Object.entries(state.results).forEach(([id, outcome], i) => {
    scene.add
      .text(lx, cy - 88 + i * 30, `${outcome === 'win' ? 'W' : 'L'}   ${teamById(id).name}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: hex(outcome === 'win' ? THEME.GREEN : THEME.RED),
      });
  });
  const names = state.poaches.map((p) => p.taken);
  scene.add
    .text(lx, cy + 40, names.length > 0 ? `POACHED: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}` : 'POACHED: —', {
      fontFamily: FONT,
      fontSize: '15px',
      color: hex(THEME.GOLD),
    });

  const rx = cx + W / 2 - 48 - 232;
  scene.add.text(rx, cy - 124, 'FINAL ROSTER', { fontFamily: FONT, fontSize: '13px', color: hex(THEME.DIM) });
  rosterStrip(scene, rx, cy + 8, state.userTeam.players, 46);
  scene.add
    .text(rx, cy + 64, `TEAM OVR  ${averageOverall(state.userTeam.players)}`, {
      fontFamily: FONT,
      fontSize: '15px',
      color: hex(THEME.GOLD),
    });
}
