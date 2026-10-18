import Phaser from 'phaser';
import type { PlayerDef } from '../config/teams';
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

/** A small bordered chip with a label, e.g. "click or press 2". Clickable. */
export class TextButton extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    opts?: { color?: number; size?: number; onSelect?: () => void },
  ) {
    super(scene, x, y);
    const color = opts?.color ?? THEME.GOLD;
    const labelObj = scene.add.text(0, 0, label, {
      fontFamily: FONT,
      fontSize: `${opts?.size ?? 14}px`,
      color: hex(color),
    });
    const w = labelObj.width + 28;
    const h = (opts?.size ?? 14) + 16;
    const bg = scene.add.rectangle(0, 0, w, h, FILL.plate, 1).setStrokeStyle(2, color);
    this.add([bg, labelObj]);
    scene.add.existing(this);
    if (opts?.onSelect) {
      this.setSize(w, h).setInteractive({ useHandCursor: true }).on('pointerdown', () => opts.onSelect?.());
    }
  }
}

/** A small row of Pokémon sprites starting at (x, y); goalies get a gold ring. */
export function rosterStrip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  players: readonly PlayerDef[],
  size = 44,
): void {
  let cx = x;
  for (const p of players) {
    if (p.goalie) scene.add.rectangle(cx, y, size + 10, size + 10).setStrokeStyle(2, THEME.GOLD);
    const spr = scene.add.image(cx, y, `pkm-${p.sprite}`);
    spr.setScale(size / 96);
    cx += size + 16;
  }
}
