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
  private parts: { destroy(): void; setDepth(depth: number): unknown }[] = [];

  constructor(
    private scene: Phaser.Scene,
    title: string,
    body: string,
    confirmLabel: string,
    private onConfirm: () => void,
    private onCancel: () => void,
    portraitTexture?: string,
  ) {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const overlay = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6);
    overlay.setInteractive();
    const pw = 520;
    const ph = 300;
    const panel = scene.add.rectangle(W / 2, H / 2, pw, ph, FILL.panel, 1).setStrokeStyle(2, THEME.GOLD);
    const inset = scene.add.rectangle(W / 2, H / 2, pw - 10, ph - 10, 0x000000, 0).setStrokeStyle(1, 0x34465a, 1);
    const accentLine = scene.add.rectangle(W / 2, H / 2 - ph / 2 + 18, 112, 4, THEME.GOLD, 1);
    const titleText = scene.add.text(W / 2, H / 2 - ph / 2 + 52, title, {
      fontFamily: FONT,
      fontSize: '24px',
      color: hex(THEME.RED),
    }).setOrigin(0.5);
    const bodyText = scene.add.text(portraitTexture ? W / 2 + 42 : W / 2, H / 2 - 16, body, {
      fontFamily: FONT,
      fontSize: '15px',
      color: hex(THEME.WHITE),
      align: 'center',
      wordWrap: { width: portraitTexture ? pw - 175 : pw - 80 },
    }).setOrigin(0.5);
    this.parts.push(overlay, panel, inset, accentLine, titleText, bodyText);
    if (portraitTexture) {
      this.parts.push(scene.add.rectangle(W / 2 - 190, H / 2 - 8, 86, 100, FILL.background, 1).setStrokeStyle(2, THEME.GREEN, 1));
      this.parts.push(scene.add.image(W / 2 - 190, H / 2 - 8, portraitTexture).setScale(68 / 96));
    }
    // Modal controls must render above any nested scene overlays (including the pause menu).
    this.parts.forEach(part => part.setDepth(9000));

    this.confirmLabel = scene.add.text(W / 2 - 130, H / 2 + ph / 2 - 58, confirmLabel, {
      fontFamily: FONT,
      fontSize: '18px',
      color: hex(THEME.RED),
    }).setOrigin(0.5).setDepth(9001).setInteractive({ useHandCursor: true });
    this.cancelLabel = scene.add.text(W / 2 + 130, H / 2 + ph / 2 - 58, 'CANCEL', {
      fontFamily: FONT,
      fontSize: '18px',
      color: hex(THEME.GRAY),
    }).setOrigin(0.5).setDepth(9001).setInteractive({ useHandCursor: true });

    const confirmBtn: Button = {
      text: confirmLabel,
      enabled: true,
      color: THEME.RED,
      highlight: (on) => {
        this.confirmLabel.setScale(1).setColor(on ? hex(THEME.GOLD) : hex(THEME.RED));
      },
      onSelect: () => this.onConfirm(),
    };
    const cancelBtn: Button = {
      text: 'CANCEL',
      enabled: true,
      color: THEME.GRAY,
      highlight: (on) => {
        this.cancelLabel.setScale(1).setColor(on ? hex(THEME.GOLD) : hex(THEME.GRAY));
      },
      onSelect: () => this.onCancel(),
    };
    this.menu = new Menu(scene, [confirmBtn, cancelBtn]);
    this.confirmLabel.on('pointerdown', () => this.onConfirm())
      .on('pointerover', () => this.confirmLabel.setColor(hex(THEME.GOLD)))
      .on('pointerout', () => this.confirmLabel.setColor(hex(THEME.RED)));
    this.cancelLabel.on('pointerdown', () => this.onCancel())
      .on('pointerover', () => this.cancelLabel.setColor(hex(THEME.GOLD)))
      .on('pointerout', () => this.cancelLabel.setColor(hex(THEME.GRAY)));

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
