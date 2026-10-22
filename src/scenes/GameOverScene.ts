import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { teamById } from '../core/campaign';
import { getRun, resetRun } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { runSummaryPanel } from '../ui/RunSummary';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { addRun, beginNewYear, getMeta } from '../state/metaStore';
import { yearOpening } from '../config/story';

export interface GameOverData {
  reason?: 'loss' | 'forfeit';
  teamId?: string;
}

export class GameOverScene extends Phaser.Scene {
  private menu!: Menu;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('GameOverScene');
  }

  create(data?: GameOverData): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const state = getRun();
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.RED);

    this.add
      .text(W / 2, 96, 'GAME OVER', { fontFamily: FONT, fontSize: '52px', color: hex(THEME.RED) })
      .setOrigin(0.5);
    const sub =
      data?.reason === 'forfeit'
        ? 'match forfeited — the run is over.'
        : data?.teamId
          ? `you lost to ${teamById(data.teamId).name} — the run is over.`
          : 'the run is over.';
    this.add.text(W / 2, 142, sub, { fontFamily: FONT, fontSize: '17px', color: hex(THEME.DIM) }).setOrigin(0.5);

    runSummaryPanel(this, W / 2, 320, state);

    const newRun = new MenuButton(this, W / 2, 540, 'NEXT YEAR →', {
      color: THEME.GREEN,
      onSelect: () => {
        resetRun();
        beginNewYear();
        addRun();
        const intro=yearOpening(getMeta().seasonYear);
        this.scene.start('DialogueScene',{nextScene:'ZoneSelectScene',lines:intro.lines,flag:intro.flag});
      },
    });
    const mainMenu = new MenuButton(this, W / 2, 588, 'MAIN MENU', {
      color: THEME.GRAY,
      size: 18,
      onSelect: () => this.scene.start('TitleScene'),
    });
    this.menu = new Menu(this, [newRun, mainMenu]);

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
