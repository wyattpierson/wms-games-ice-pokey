import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { FILL, THEME } from './theme';

/** A restrained, hard-edged arcade frame shared by non-gameplay screens. */
export function addRetroChrome(scene: Phaser.Scene, accent: number = THEME.BLUE): void {
  scene.cameras.main.setBackgroundColor(FILL.background);
  const g = scene.add.graphics();
  // Deep inset frame with single-pixel-like corner blocks: retro, but intentionally quiet.
  g.lineStyle(2, 0x26374a, 1);
  g.strokeRect(10, 10, GAME_WIDTH - 20, GAME_HEIGHT - 20);
  g.lineStyle(1, accent, 0.48);
  g.strokeRect(16, 16, GAME_WIDTH - 32, GAME_HEIGHT - 32);
  g.fillStyle(accent, 0.95);
  const s = 8;
  [[16,16],[GAME_WIDTH-24,16],[16,GAME_HEIGHT-24],[GAME_WIDTH-24,GAME_HEIGHT-24]].forEach(([x,y]) => g.fillRect(x,y,s,s));
  // Small side vents keep the frame arcade-like without sitting behind centered headings.
  g.fillStyle(0x36506a, 0.7);
  for (let i = 0; i < 6; i++) {
    g.fillRect(34 + i * 10, 18, 5, 3);
    g.fillRect(GAME_WIDTH - 94 + i * 10, 18, 5, 3);
    g.fillRect(34 + i * 10, GAME_HEIGHT - 21, 5, 3);
    g.fillRect(GAME_WIDTH - 94 + i * 10, GAME_HEIGHT - 21, 5, 3);
  }
}

/** Pixel-ish double-edge panel for important groups of menu content. */
export function addRetroPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: number = THEME.DIM,
  fill: number = FILL.panel,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const shadow = scene.add.rectangle(3, 4, width, height, 0x000000, 0.38);
  const base = scene.add.rectangle(0, 0, width, height, fill, 1).setStrokeStyle(2, accent, 1);
  const inset = scene.add.rectangle(0, 0, width - 8, height - 8, 0x000000, 0).setStrokeStyle(1, 0x34465a, 0.85);
  const tab = scene.add.rectangle(-width / 2 + 13, -height / 2 + 13, 8, 8, accent, 1);
  c.add([shadow, base, inset, tab]);
  return c;
}
