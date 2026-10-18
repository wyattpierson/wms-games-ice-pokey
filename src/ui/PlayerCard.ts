import Phaser from 'phaser';
import type { PlayerDef } from '../config/teams';
import { overall, POACH_STATS } from '../core/poach';
import { FILL, FONT, THEME, hex } from './theme';

/**
 * A roster card: sprite + name + role/OVR + a two-line stat grid.
 * Used by PoachScene; "selected" = the highlighted pick, "enabled" = in the active side.
 */
export class PlayerCard extends Phaser.GameObjects.Container {
  private frame: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    player: PlayerDef,
    role: string,
    opts?: { width?: number; height?: number },
  ) {
    super(scene, x, y);
    const w = opts?.width ?? 340;
    const h = opts?.height ?? 76;
    this.frame = scene.add.rectangle(0, 0, w, h, FILL.plate, 1).setStrokeStyle(2, THEME.DIM);
    const spr = scene.add.image(-w / 2 + 44, 0, `pkm-${player.sprite}`);
    spr.setScale(58 / 96);
    const name = scene.add.text(-w / 2 + 88, -26, player.name, {
      fontFamily: FONT,
      fontSize: '16px',
      color: hex(THEME.WHITE),
    });
    const roleLine = scene.add.text(-w / 2 + 88, -7, `${role} · OVR ${overall(player)}`, {
      fontFamily: FONT,
      fontSize: '13px',
      color: hex(THEME.GOLD),
    });
    const grid = (slice: readonly (typeof POACH_STATS)[number][]) =>
      slice.map(({ key, label }) => `${label.padEnd(5)}${player.stats[key]}`).join('  ');
    const s1 = scene.add.text(-w / 2 + 88, 14, grid(POACH_STATS.slice(0, 3)), {
      fontFamily: FONT,
      fontSize: '12px',
      color: hex(THEME.GRAY),
    });
    const s2 = scene.add.text(-w / 2 + 88, 31, grid(POACH_STATS.slice(3)), {
      fontFamily: FONT,
      fontSize: '12px',
      color: hex(THEME.GRAY),
    });
    this.add([this.frame, spr, name, roleLine, s1, s2]);
    scene.add.existing(this);
  }

  setSelected(on: boolean): void {
    this.frame.setStrokeStyle(on ? 3 : 2, on ? THEME.GOLD : THEME.DIM);
  }

  setEnabled(on: boolean): void {
    this.setAlpha(on ? 1 : 0.5);
  }
}
