import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { ConfirmDialog } from './ConfirmDialog';
import { Menu, MenuButton } from './menu';
import { FONT, THEME, hex } from './theme';

/**
 * In-scene pause overlay for a live campaign match (ESC). The scene keeps running but
 * GameScene skips its update while this is visible, freezing the match.
 *
 * Keys: Enter/ESC resume · W/S navigate · F forfeit (ends the run) · Q quit to title
 * (ends the run). Forfeit and quit go through a ConfirmDialog first; while a dialog is
 * open it owns the input and this overlay ignores its own keys.
 */
export class PauseOverlay {
  visible = false;
  /** True while a ConfirmDialog (forfeit/quit) is open. */
  get dialogOpen(): boolean {
    return this.dialog !== null;
  }
  private group: Phaser.GameObjects.Container;
  private menu: Menu;
  private dialog: ConfirmDialog | null = null;
  private bindings: [string, () => void][] = [];

  constructor(
    private scene: Phaser.Scene,
    opponentName: string,
    private onResume: () => void,
    private onForfeit: () => void,
    private onQuit: () => void,
  ) {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.68);
    dim.setInteractive();
    const title = scene.add
      .text(W / 2, 140, 'PAUSED', { fontFamily: FONT, fontSize: '44px', color: hex(THEME.WHITE) })
      .setOrigin(0.5);
    const sub = scene.add
      .text(W / 2, 186, `vs ${opponentName}`, { fontFamily: FONT, fontSize: '16px', color: hex(THEME.DIM) })
      .setOrigin(0.5);

    const resume = new MenuButton(scene, W / 2, 300, 'RESUME  (ENTER / ESC)', {
      color: THEME.GREEN,
      onSelect: () => this.onResume(),
    });
    const forfeit = new MenuButton(scene, W / 2, 356, 'FORFEIT RUN  (F)', {
      color: THEME.RED,
      size: 20,
      onSelect: () => this.confirmForfeit(),
    });
    const quit = new MenuButton(scene, W / 2, 404, 'QUIT TO TITLE  (Q)', {
      color: THEME.GRAY,
      size: 20,
      onSelect: () => this.confirmQuit(),
    });
    const hint = scene.add
      .text(W / 2, 462, 'forfeiting or quitting ends this run', {
        fontFamily: FONT,
        fontSize: '13px',
        color: hex(THEME.DIM),
      })
      .setOrigin(0.5);

    this.group = new Phaser.GameObjects.Container(scene, 0, 0, [dim, title, sub, resume, forfeit, quit, hint]);
    this.group.setVisible(false);

    this.menu = new Menu(scene, [resume, forfeit, quit]);

    const bind = (code: string, fn: () => void) => {
      this.scene.input.keyboard!.on(code, fn);
      this.bindings.push([code, fn]);
    };
    // Phaser emits `keydown-<KeyCodes name>` (UP/DOWN/ENTER/ESC — not DOM codes).
    // Bindings live for the whole scene, so every handler must ignore input while
    // the overlay is hidden (e.g. a stray F during play must not open a dialog).
    // NOTE: ESC pause/resume is owned by GameScene (it toggles show/hide). This
    // overlay must NOT also bind ESC — two listeners on the same event would fire
    // in one dispatch and cancel each other (show then immediately hide).
    bind('keydown-ENTER', () => {
      if (this.visible && !this.dialog) this.onResume();
    });
    bind('keydown-F', () => {
      if (this.visible && !this.dialog) this.confirmForfeit();
    });
    bind('keydown-Q', () => {
      if (this.visible && !this.dialog) this.confirmQuit();
    });
    bind('keydown-W', () => {
      if (this.visible && !this.dialog) this.menu.moveUp();
    });
    bind('keydown-UP', () => {
      if (this.visible && !this.dialog) this.menu.moveUp();
    });
    bind('keydown-S', () => {
      if (this.visible && !this.dialog) this.menu.moveDown();
    });
    bind('keydown-DOWN', () => {
      if (this.visible && !this.dialog) this.menu.moveDown();
    });
  }

  show(): void {
    // Menu keeps its selection between shows — nothing to reset.
    if (this.visible) return;
    this.visible = true;
    this.group.setVisible(true);
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.closeDialog();
    this.group.setVisible(false);
  }

  destroy(): void {
    this.hide();
    for (const [code, fn] of this.bindings) this.scene.input.keyboard!.off(code, fn);
    this.bindings = [];
    this.group.destroy();
  }

  private confirmForfeit(): void {
    this.dialog = new ConfirmDialog(
      this.scene,
      'FORFEIT MATCH?',
      'The match ends in a loss and this run is over.',
      'FORFEIT',
      () => {
        this.closeDialog();
        this.onForfeit();
      },
      () => this.closeDialog(),
    );
  }

  private confirmQuit(): void {
    this.dialog = new ConfirmDialog(
      this.scene,
      'QUIT TO TITLE?',
      'The match is forfeited and this run is over.',
      'QUIT',
      () => {
        this.closeDialog();
        this.onQuit();
      },
      () => this.closeDialog(),
    );
  }

  private closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = null;
  }
}
