import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { FILL, FONT, THEME, hex } from './theme';
import { Menu, type Button } from './menu';

/**
 * A small modal: dim overlay + panel + title + body + confirm (danger) / cancel buttons.
 * While open it owns the input: W/S or U/D to switch, Enter/Space to choose, Esc/X to cancel.
 * Call destroy() to remove it and its key bindings.
 */
export class ConfirmDialog {
  private menu: Menu;
  private confirmLabel: Phaser.GameObjects.Text;
  private cancelLabel: Phaser.GameObjects.Text;
  private bindings: [string, () => void][] = [];
  /** Everything this dialog put on the scene, so destroy() can take ALL of it down again. */
  private parts: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: Phaser.Scene,
    title: string,
    body: string,
    confirmLabel: string,
    private onConfirm: () => void,
    private onCancel: () => void,
  ) {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const overlay = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6);
    overlay.setInteractive();
    const pw = 520;
    const ph = 300;
    const panel = scene.add.rectangle(W / 2, H / 2, pw, ph, FILL.panel, 1).setStrokeStyle(3, THEME.GOLD);
    const titleText = scene.add.text(W / 2, H / 2 - ph / 2 + 52, title, {
      fontFamily: FONT,
      fontSize: '24px',
      color: hex(THEME.RED),
    }).setOrigin(0.5);
    const bodyText = scene.add.text(W / 2, H / 2 - 16, body, {
      fontFamily: FONT,
      fontSize: '15px',
      color: hex(THEME.WHITE),
      align: 'center',
      wordWrap: { width: pw - 80 },
    }).setOrigin(0.5);
    this.parts.push(overlay, panel, titleText, bodyText);

    this.confirmLabel = scene.add.text(W / 2 - 130, H / 2 + ph / 2 - 58, confirmLabel, {
      fontFamily: FONT,
      fontSize: '18px',
      color: hex(THEME.RED),
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.cancelLabel = scene.add.text(W / 2 + 130, H / 2 + ph / 2 - 58, 'CANCEL', {
      fontFamily: FONT,
      fontSize: '18px',
      color: hex(THEME.GRAY),
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const applyHighlight = (on: boolean) => {
      this.confirmLabel.setScale(on ? 1.08 : 1).setColor(on ? hex(THEME.GOLD) : hex(THEME.RED));
      this.cancelLabel.setScale(on ? 1.08 : 1).setColor(on ? hex(THEME.GOLD) : hex(THEME.GRAY));
    };
    const confirmBtn: Button = {
      text: confirmLabel,
      enabled: true,
      color: THEME.RED,
      highlight: (on) => {
        applyHighlight(on);
      },
      onSelect: () => this.onConfirm(),
    };
    const cancelBtn: Button = {
      text: 'CANCEL',
      enabled: true,
      color: THEME.GRAY,
      highlight: (on) => {
        applyHighlight(!on);
      },
      onSelect: () => this.onCancel(),
    };
    this.menu = new Menu(scene, [confirmBtn, cancelBtn]);
    this.confirmLabel.on('pointerdown', () => this.onConfirm());
    this.cancelLabel.on('pointerdown', () => this.onCancel());

    const bind = (code: string, fn: () => void) => {
      scene.input.keyboard!.on(code, fn);
      this.bindings.push([code, fn]);
    };
    // Phaser emits `keydown-<KeyCodes name>` (UP/DOWN/ENTER/ESC — not DOM codes).
    bind('keydown-W', () => this.menu.moveUp());
    bind('keydown-UP', () => this.menu.moveUp());
    bind('keydown-S', () => this.menu.moveDown());
    bind('keydown-DOWN', () => this.menu.moveDown());
    bind('keydown-ENTER', () => this.menu.select());
    bind('keydown-SPACE', () => this.menu.select());
    bind('keydown-ESC', () => this.onCancel());
    bind('keydown-X', () => this.onCancel());
  }

  destroy(): void {
    for (const [code, fn] of this.bindings) this.scene.input.keyboard!.off(code, fn);
    this.bindings = [];
    this.confirmLabel.destroy();
    this.cancelLabel.destroy();
    for (const part of this.parts) part.destroy();
    this.parts = [];
  }
}
