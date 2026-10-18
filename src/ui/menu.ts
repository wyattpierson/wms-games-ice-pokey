import Phaser from 'phaser';
import type { PlayerDef } from '../config/teams';
import { overall } from '../core/poach';
import { FILL, FONT, THEME, hex } from './theme';

export { hex }; // re-exported so scenes can import everything from one place

/** A selectable item in a Menu (keyboard-driven; may also be clicked). */
export interface Button {
  text: string;
  onSelect?: () => void;
  enabled: boolean;
  color: number;
  highlight: (on: boolean) => void;
}

/** Keyboard navigation state for a column of Buttons: up / down / select. */
export class Menu {
  private selected = 0;
  constructor(
    _scene: Phaser.Scene, // kept for API symmetry with the other UI classes
    private buttons: Button[],
  ) {
    if (buttons.length > 0) buttons[0].highlight(true);
  }

  get count(): number {
    return this.buttons.length;
  }

  private setSelected(i: number): void {
    const n = this.buttons.length;
    if (n === 0) return;
    const next = ((i % n) + n) % n;
    if (next === this.selected) return;
    this.buttons[this.selected].highlight(false);
    this.selected = next;
    this.buttons[next].highlight(true);
  }

  moveUp(): void {
    if (this.count > 1) this.setSelected(this.selected - 1);
  }

  moveDown(): void {
    if (this.count > 1) this.setSelected(this.selected + 1);
  }

  select(): void {
    const b = this.buttons[this.selected];
    if (b && b.enabled) b.onSelect?.();
  }

  /** Re-evaluate after enabled-flags change; keep the selection on an enabled item if possible. */
  refresh(): void {
    const cur = this.buttons[this.selected];
    if (cur && cur.enabled) return;
    const i = this.buttons.findIndex((b) => b.enabled);
    if (i >= 0 && i !== this.selected) this.setSelected(i);
  }
}

/** A centered text button: gold + slightly bigger when highlighted by its Menu. */
export class MenuButton extends Phaser.GameObjects.Text implements Button {
  onSelect?: () => void;
  enabled: boolean;
  color: number;
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    opts?: { enabled?: boolean; color?: number; size?: number; onSelect?: () => void },
  ) {
    super(scene, x, y, label, {
      fontFamily: FONT,
      fontSize: `${opts?.size ?? 24}px`,
      color: opts?.enabled === false ? hex(THEME.DIM) : hex(opts?.color ?? THEME.WHITE),
      align: 'center',
    });
    this.enabled = opts?.enabled ?? true;
    this.color = opts?.color ?? THEME.WHITE;
    this.onSelect = opts?.onSelect;
    scene.add.existing(this);
    this.setOrigin(0.5); // "centered" — Text defaults to a top-left origin, which hung every menu off its x
    this.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.enabled) this.onSelect?.();
    });
  }

  highlight(on: boolean): void {
    if (on) {
      this.setColor(hex(THEME.GOLD));
      this.setScale(1.06);
    } else {
      this.setColor(this.enabled ? hex(this.color) : hex(THEME.DIM));
      this.setScale(1);
    }
  }
}

/**
 * A small bordered button: centered label, lights up under the mouse. Clickable when given
 * an onSelect (otherwise it is a plain, non-interactive chip).
 */
export class TextButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private labelObj: Phaser.GameObjects.Text;
  private accent: number;
  private minWidth: number;
  private size: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    opts?: { color?: number; size?: number; minWidth?: number; onSelect?: () => void },
  ) {
    super(scene, x, y);
    this.accent = opts?.color ?? THEME.GOLD;
    this.size = opts?.size ?? 14;
    this.minWidth = opts?.minWidth ?? 0;
    // Origin 0.5 matters: with the default (0, 0) the label hangs off to the bottom-right
    // of the box instead of sitting inside it.
    this.labelObj = scene.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: `${this.size}px`, color: hex(this.accent) })
      .setOrigin(0.5);
    this.bg = scene.add.rectangle(0, 0, 10, 10, FILL.plate, 1).setStrokeStyle(2, this.accent);
    this.add([this.bg, this.labelObj]);
    this.layout();
    scene.add.existing(this);
    if (opts?.onSelect) {
      const onSelect = opts.onSelect;
      this.setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onSelect())
        .on('pointerover', () => this.bg.setFillStyle(FILL.plateHi, 1))
        .on('pointerout', () => this.bg.setFillStyle(FILL.plate, 1));
    }
  }

  /** Change the text (and optionally the accent color); the box resizes to fit. */
  setLabel(label: string, color?: number): this {
    if (color !== undefined) this.accent = color;
    this.labelObj.setText(label).setColor(hex(this.accent));
    this.bg.setStrokeStyle(2, this.accent);
    this.layout();
    return this;
  }

  private layout(): void {
    const w = Math.max(this.minWidth, this.labelObj.width + 28);
    const h = this.size + 16;
    this.bg.setSize(w, h);
    this.setSize(w, h);
    // Keep an existing hit area in step with the new size (containers hit-test around their center).
    const input = this.input;
    if (input?.hitArea) (input.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, w, h);
  }
}

/**
 * A row of player portraits centered on (x, y): field players first, then a small gap and the
 * goalie. Every player gets the same plate with their OVR underneath; the goalie is told apart
 * by a warm-tinted plate and a "GK" tag — NOT a gold box, which reads as a selection cursor.
 * `size` is the plate edge in px. Returns the container (it is centered on x, y).
 */
export function rosterStrip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  players: readonly PlayerDef[],
  size = 52,
): Phaser.GameObjects.Container {
  const ordered = [...players.filter((p) => !p.goalie), ...players.filter((p) => p.goalie)];
  const gap = Math.max(6, Math.round(size * 0.15));
  const split = ordered.some((p) => p.goalie) && ordered.some((p) => !p.goalie) ? Math.round(size * 0.22) : 0;
  const total = ordered.length * size + (ordered.length - 1) * gap + split;
  const strip = scene.add.container(x, y);

  let px = -total / 2 + size / 2;
  ordered.forEach((p, i) => {
    if (i > 0) px += size + gap + (p.goalie ? split : 0);
    const gk = !!p.goalie;
    const plate = scene.add
      .rectangle(px, 0, size, size, gk ? FILL.goalie : FILL.background, 1)
      .setStrokeStyle(1, gk ? THEME.GOLD : THEME.DIM, gk ? 0.55 : 1);
    const spr = scene.add.image(px, 0, `pkm-${p.sprite}`).setScale((size - 8) / 96);
    const ovr = scene.add
      .text(px, size / 2 + 10, String(overall(p)), { fontFamily: FONT, fontSize: '11px', color: hex(gk ? THEME.GOLD : THEME.GRAY) })
      .setOrigin(0.5);
    strip.add([plate, spr, ovr]);
    if (gk) {
      const tag = scene.add.rectangle(px, -size / 2, 24, 13, THEME.GOLD, 1);
      const tagText = scene.add
        .text(px, -size / 2, 'GK', { fontFamily: FONT, fontSize: '10px', color: '#1a1405', fontStyle: 'bold' })
        .setOrigin(0.5);
      strip.add([tag, tagText]);
    }
  });
  return strip;
}
