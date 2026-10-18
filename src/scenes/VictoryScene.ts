import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { getRun, resetRun } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { runSummaryPanel } from '../ui/RunSummary';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

export class VictoryScene extends Phaser.Scene {
  private menu!: Menu;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('VictoryScene');
  }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const state = getRun();
    this.cameras.main.setBackgroundColor(FILL.background);

    this.add
      .text(W / 2, 96, 'CHAMPION!', { fontFamily: FONT, fontSize: '52px', color: hex(THEME.GOLD) })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 142, 'Aurora Dynasty has fallen — the rink is yours.', {
        fontFamily: FONT,
        fontSize: '17px',
        color: hex(THEME.DIM),
      })
      .setOrigin(0.5);

    runSummaryPanel(this, W / 2, 320, state);

    const newRun = new MenuButton(this, W / 2, 540, 'NEW RUN →', {
      color: THEME.GREEN,
      onSelect: () => {
        resetRun();
        this.scene.start('OpponentSelectScene');
      },
    });
    const menu = new MenuButton(this, W / 2, 588, 'MAIN MENU', {
      color: THEME.GRAY,
      size: 18,
      onSelect: () => this.scene.start('TitleScene'),
    });
    this.menu = new Menu(this, [newRun, menu]);

    const onKey = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.menu.moveUp();
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.menu.moveDown();
          break;
        case 'Enter':
        case 'Space':
          this.menu.select();
          break;
      }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
