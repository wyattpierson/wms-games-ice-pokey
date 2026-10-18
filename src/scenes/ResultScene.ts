import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { isChampion, recordResult, skipPoach, teamById } from '../core/campaign';
import { getRun, resetRun, setRun } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

export interface ResultData {
  teamId: string;
  userScore: number;
  opponentScore: number;
}

export class ResultScene extends Phaser.Scene {
  private menu!: Menu;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('ResultScene');
  }

  create(data: ResultData): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const win = data.userScore > data.opponentScore;
    const champion = isChampion(data.teamId);
    const team = teamById(data.teamId);
    const state = getRun();
    // Record the outcome now (idempotent per run: recordResult throws if already faced).
    if (!state.results[data.teamId]) {
      setRun(recordResult(state, data.teamId, win ? 'win' : 'loss'));
    }
    const userTeam = getRun().userTeam;
    this.cameras.main.setBackgroundColor(FILL.background);

    this.add
      .text(W / 2, 130, win ? 'VICTORY!' : 'DEFEAT', {
        fontFamily: FONT,
        fontSize: '52px',
        color: hex(win ? THEME.GOLD : THEME.RED),
      })
      .setOrigin(0.5);
    this.add
      .text(
        W / 2, 188,
        win ? (champion ? 'the dynasty has fallen' : `you beat ${team.name}`) : 'the run is over',
        { fontFamily: FONT, fontSize: '17px', color: hex(THEME.DIM) },
      )
      .setOrigin(0.5);

    this.add.rectangle(W / 2, 272, 560, 96, FILL.plate, 1).setStrokeStyle(2, THEME.DIM);
    this.add
      .text(W / 2, 272, `${userTeam.name}  ${data.userScore} — ${data.opponentScore}  ${team.name}`, {
        fontFamily: FONT,
        fontSize: '24px',
        color: hex(THEME.WHITE),
      })
      .setOrigin(0.5);

    let note = '';
    if (win && !champion) note = 'a player from that team is open for the taking — but you must drop one of your own.';
    else if (win) note = 'first to 3 goals — the gauntlet is complete.';
    else note = 'every match is a one-shot: lose and the run ends.';
    this.add.text(W / 2, 348, note, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.GRAY) }).setOrigin(0.5);

    const buttons: MenuButton[] = [];
    if (win && !champion) {
      buttons.push(
        new MenuButton(this, W / 2, 452, 'TAKE A PLAYER →', {
          color: THEME.GREEN,
          onSelect: () => this.scene.start('PoachScene', { teamId: data.teamId }),
        }),
        new MenuButton(this, W / 2, 506, 'SKIP POACH (team consumed)', {
          color: THEME.GRAY,
          size: 18,
          onSelect: () => {
            setRun(skipPoach(getRun()));
            this.scene.start('OpponentSelectScene');
          },
        }),
      );
    } else if (win) {
      buttons.push(
        new MenuButton(this, W / 2, 452, 'CONTINUE →', {
          color: THEME.GREEN,
          onSelect: () => this.scene.start('VictoryScene'),
        }),
      );
    } else {
      buttons.push(
        new MenuButton(this, W / 2, 452, 'NEW RUN →', {
          color: THEME.GREEN,
          onSelect: () => {
            resetRun();
            this.scene.start('OpponentSelectScene');
          },
        }),
        new MenuButton(this, W / 2, 506, 'TITLE SCREEN', {
          color: THEME.GRAY,
          size: 18,
          onSelect: () => this.scene.start('TitleScene'),
        }),
      );
    }
    this.menu = new Menu(this, buttons);

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
