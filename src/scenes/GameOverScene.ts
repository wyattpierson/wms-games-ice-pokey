import Phaser from 'phaser';
import { getWorldState } from '../core/worldState';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { teamById } from '../core/campaign';
import { getRun, resetRun } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { runSummaryPanel } from '../ui/RunSummary';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { addRun, beginNewYear, getMeta } from '../state/metaStore';
import { yearEndReflection, yearOpening } from '../config/story';
import { beginCareerRun, archiveCareerRun, finishCareerMatch, getCareerStats } from '../state/careerStatsStore';

export interface GameOverData {
  reason?: 'loss' | 'forfeit';
  teamId?: string;
  userScore?: number;
  opponentScore?: number;
}

export class GameOverScene extends Phaser.Scene {
  private menu!: Menu;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('GameOverScene');
  }

  create(data?: GameOverData & { advanceYear?: boolean }): void {
    wireShutdown(this);
    if (data?.advanceYear) { this.advanceYear(); return; }
    const W = GAME_WIDTH;
    const state = getRun();
    const career = getCareerStats().currentRun;
    if (career && !career.outcome && (state.gameOver || data?.reason === 'forfeit')) {
      const losingEntry = Object.entries(state.results).find(([, outcome]) => outcome === 'loss');
      const lostTo = data?.teamId ? teamById(data.teamId).name : losingEntry ? teamById(losingEntry[0]).name : undefined;
      archiveCareerRun({ outcome: data?.reason === 'forfeit' ? 'forfeit' : 'loss', teamName: state.userTeam.name, year: getMeta().seasonYear,
        lineup: state.userTeam.players.map(p => ({ name: p.name, sprite: p.sprite, isStarter: p.isStarter, goalie: p.goalie })),
        lostTo, score: typeof data?.userScore === 'number' && typeof data?.opponentScore === 'number' ? { for: data.userScore, against: data.opponentScore } : undefined,
        winsBeforeEnd: Object.values(state.results).filter(r => r === 'win').length });
      finishCareerMatch();
    }
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
      onSelect: () => this.requestNextYear(),
    });
    const shop = new MenuButton(this, W / 2, 584, 'ITEM SHOP', {
      color: THEME.GOLD,
      size: 18,
      onSelect: () => this.scene.start('StoreScene', { returnTo: 'GameOverScene' }),
    });
    const mainMenu = new MenuButton(this, W / 2, 628, 'MAIN MENU', {
      color: THEME.GRAY,
      size: 18,
      onSelect: () => this.scene.start('TitleScene'),
    });
    const stats = new MenuButton(this, W / 2, 672, 'CAREER STATS', {
      color: THEME.BLUE,
      size: 18,
      onSelect: () => this.scene.start('CareerStatsScene', { returnTo: 'GameOverScene' }),
    });
    this.menu = new Menu(this, [newRun, shop, mainMenu, stats]);

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

  private requestNextYear(): void {
    const reflection = yearEndReflection(getWorldState());
    if (reflection && !getMeta().flags.includes(reflection.flag)) {
      this.scene.start('DialogueScene', {
        nextScene: 'GameOverScene',
        nextData: { advanceYear: true },
        lines: reflection.lines,
        flag: reflection.flag,
      });
      return;
    }
    this.advanceYear();
  }

  private advanceYear(): void {
    resetRun();
    beginNewYear();
    addRun();
    const freshRun = getRun();
    beginCareerRun(freshRun.userTeam.name, getMeta().seasonYear, freshRun.userTeam.players.map(p => ({ name: p.name, sprite: p.sprite, isStarter: p.isStarter, goalie: p.goalie })));
    const intro = yearOpening(getMeta().seasonYear, getWorldState());
    this.scene.start('DialogueScene', { nextScene: 'ZoneSelectScene', lines: intro.lines, flags: intro.flags });
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
