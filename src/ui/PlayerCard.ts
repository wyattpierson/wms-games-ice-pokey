import Phaser from 'phaser';
import type { PlayerDef } from '../config/teams';
import { overall, POACH_STATS } from '../core/poach';
import { FILL, FONT, THEME, hex } from './theme';

export const CARD_W = 340;
export const CARD_H = 84;

export interface PlayerCardOptions {
  role: 'FIELD' | 'GOALIE';
  /** What picking this card means: "TAKE" (green) or "DROP" (red). Drives the tag + marked color. */
  tone: 'take' | 'drop';
  onClick?: () => void;
  onHover?: () => void;
}

/**
 * A roster card: portrait, name, role, a two-row stat grid and a big OVR.
 *
 * Three independent visual states, so the picker always says where the cursor is AND what
 * is currently chosen:
 *   - focused: the cursor is here (gold outline, lit plate)
 *   - marked:  this is the current choice (tone-colored outline + a TAKE / DROP tag)
 *   - dimmed:  not a legal choice right now (faded, ignores the mouse)
 */
export class PlayerCard extends Phaser.GameObjects.Container {
  private frame: Phaser.GameObjects.Rectangle;
  private tag: Phaser.GameObjects.Container;
  private toneColor: number;
  private dimmed = false;
  private focused = false;
  private marked = false;

  constructor(scene: Phaser.Scene, x: number, y: number, player: PlayerDef, opts: PlayerCardOptions) {
    super(scene, x, y);
    const w = CARD_W;
    const h = CARD_H;
    const goalie = opts.role === 'GOALIE';
    this.toneColor = opts.tone === 'take' ? THEME.GREEN : THEME.RED;

    this.frame = scene.add.rectangle(0, 0, w, h, FILL.plate, 1).setStrokeStyle(2, THEME.DIM);

    // Portrait well — keeps different-sized sprites on a consistent footing.
    const well = scene.add
      .rectangle(-w / 2 + 14 + 32, 0, 64, 64, goalie ? FILL.goalie : FILL.background, 1)
      .setStrokeStyle(1, goalie ? THEME.GOLD : THEME.DIM, goalie ? 0.55 : 0.6);
    const spr = scene.add.image(-w / 2 + 14 + 32, 0, `pkm-${player.sprite}`).setScale(58 / 96);

    const tx = -w / 2 + 94;
    const name = scene.add.text(tx, -h / 2 + 9, player.name, { fontFamily: FONT, fontSize: '16px', color: hex(THEME.WHITE) });
    const role = scene.add.text(tx, -h / 2 + 29, opts.role, {
      fontFamily: FONT,
      fontSize: '11px',
      color: hex(goalie ? THEME.GOLD : THEME.DIM),
    });
    const grid = (slice: readonly (typeof POACH_STATS)[number][]) =>
      slice.map(({ key, label }) => `${label.padEnd(3)} ${String(player.stats[key]).padStart(3)}`).join('  ');
    const s1 = scene.add.text(tx, -h / 2 + 46, grid(POACH_STATS.slice(0, 3)), { fontFamily: FONT, fontSize: '12px', color: hex(THEME.GRAY) });
    const s2 = scene.add.text(tx, -h / 2 + 62, grid(POACH_STATS.slice(3)), { fontFamily: FONT, fontSize: '12px', color: hex(THEME.GRAY) });

    const ovrNum = scene.add
      .text(w / 2 - 36, -4, String(overall(player)), { fontFamily: FONT, fontSize: '28px', color: hex(THEME.GOLD) })
      .setOrigin(0.5);
    const ovrLabel = scene.add.text(w / 2 - 36, 17, 'OVR', { fontFamily: FONT, fontSize: '11px', color: hex(THEME.DIM) }).setOrigin(0.5);

    // TAKE / DROP tag straddling the top-left corner; only shown while marked.
    const tagBg = scene.add.rectangle(0, 0, 46, 16, this.toneColor, 1);
    const tagText = scene.add
      .text(0, 0, opts.tone === 'take' ? 'TAKE' : 'DROP', { fontFamily: FONT, fontSize: '11px', color: '#0b0f16', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.tag = scene.add.container(-w / 2 + 38, -h / 2, [tagBg, tagText]).setVisible(false);

    this.add([this.frame, well, spr, name, role, s1, s2, ovrNum, ovrLabel, this.tag]);
    scene.add.existing(this);

    if (opts.onClick || opts.onHover) {
      this.setSize(w, h).setInteractive({ useHandCursor: true });
      this.on('pointerdown', () => {
        if (!this.dimmed) opts.onClick?.();
      });
      this.on('pointerover', () => {
        if (!this.dimmed) opts.onHover?.();
      });
    }
  }

  /** Set all three states at once and repaint. */
  setVisual(v: { focus: boolean; marked: boolean; dimmed: boolean }): void {
    this.focused = v.focus;
    this.marked = v.marked;
    this.dimmed = v.dimmed;
    this.repaint();
  }

  private repaint(): void {
    if (this.focused) this.frame.setStrokeStyle(3, THEME.GOLD).setFillStyle(FILL.plateHi, 1);
    else if (this.marked) this.frame.setStrokeStyle(3, this.toneColor).setFillStyle(FILL.plate, 1);
    else this.frame.setStrokeStyle(2, THEME.DIM).setFillStyle(FILL.plate, 1);
    this.tag.setVisible(this.marked && !this.dimmed);
    this.setAlpha(this.dimmed ? 0.3 : 1);
    if (this.input) this.input.cursor = this.dimmed ? 'default' : 'pointer';
  }
}
