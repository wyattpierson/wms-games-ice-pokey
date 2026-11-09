import Phaser from 'phaser';
import { THEME } from './theme';

/** A tiny smiling cup, drawn locally so it works offline and in every font. */
export function addTrophy(scene: Phaser.Scene, x: number, y: number, color = THEME.GOLD, locked = false): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.lineStyle(4, color, 1);
  g.strokeRoundedRect(-27, -20, 18, 23, 8);
  g.strokeRoundedRect(9, -20, 18, 23, 8);
  g.fillStyle(color);
  g.fillRoundedRect(-18, -25, 36, 39, { tl: 3, tr: 3, bl: 16, br: 16 });
  g.fillRect(-4, 11, 8, 13);
  g.fillRoundedRect(-18, 23, 36, 7, 2);
  if (!locked) {
    g.fillStyle(0x20364e);
    g.fillCircle(-7, -9, 2);
    g.fillCircle(7, -9, 2);
    g.lineStyle(2, 0x20364e);
    g.beginPath(); g.arc(0, -4, 5, 0, Math.PI, false); g.strokePath();
    g.fillStyle(0xef8e99); g.fillCircle(-12, -3, 3); g.fillCircle(12, -3, 3);
  }
  c.add(g);
  return c;
}
