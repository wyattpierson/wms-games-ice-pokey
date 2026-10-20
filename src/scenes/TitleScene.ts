import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { CAMPAIGN_TEAMS, USER_TEAM } from '../config/teams';
import { difficultyLevel, startMatch } from '../core/campaign';
import { hasSavedRun, resetRun, setRun, takeNotice } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

const TEAM_PARAM = 'team';

const HELP_LINES = [
  ['MOVE', 'ARROWS / WASD'],
  ['PASS · SWITCH', 'SPACE'],
  ['SHOOT', 'HOLD SHIFT — aim UP/DOWN, release on the white ring'],
  ['SKILL MOVES', 'E SPIN · F DEKE sidestep (UP/DOWN = which side)'],
  ['PARRY', "defending: press the ATTACKER'S key on the white ring, from in front"],
  ['CHECK', 'SHIFT defending: bumps a walker; BEFORE a juke = a wall'],
  ['PRESSURE', 'a defender on you strips the puck: pass, shoot or juke'],
  ['GOALIE', 'juke near the net: if it bites, shoot the OPEN side'],
  ['ONE-TIMER', 'SPACE as a pass arrives, then release'],
  ['PAUSE', 'ESC'],
  ['', ''],
  ['RULES', 'first to 3 goals wins'],
  ['WIN', 'poach 1 player from the beaten team (swap: take 1, drop 1)'],
  ['LOSE', 'the run ends — one-shot, no retries'],
  ['GOAL', 'beat all 3 teams, then take the champion'],
];

export class TitleScene extends Phaser.Scene {
  private menu!: Menu;
  private bobbers: { spr: Phaser.GameObjects.Image; phase: number }[] = [];
  private help: Phaser.GameObjects.Container | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    this.cameras.main.setBackgroundColor(FILL.background);

    this.add
      .text(W / 2, 118, 'ICE POKÉY', { fontFamily: FONT, fontSize: '64px', color: hex(THEME.GOLD) })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 172, 'a roguelike pokémon hockey run', { fontFamily: FONT, fontSize: '16px', color: hex(THEME.DIM) })
      .setOrigin(0.5);

    // The starting lineup bobs on the title screen.
    USER_TEAM.players
      .filter((p) => !p.goalie)
      .forEach((p, i) => {
        const spr = this.add.image(W / 2 + (i - 1) * 140, 290, `pkm-${p.sprite}`);
        spr.setScale(1.15);
        this.bobbers.push({ spr, phase: i * 1.1 });
      });

    const notice = takeNotice();
    if (notice) {
      this.add.text(W / 2, 384, notice, { fontFamily: FONT, fontSize: '14px', color: hex(THEME.RED) }).setOrigin(0.5);
    }

    const newRunBtn = new MenuButton(this, W / 2, 444, 'NEW RUN', {
      onSelect: () => {
        resetRun();
        this.scene.start('OpponentSelectScene');
      },
    });
    const continueBtn = new MenuButton(this, W / 2, 498, 'CONTINUE', {
      enabled: hasSavedRun(),
      color: THEME.GREEN,
      onSelect: () => this.scene.start('OpponentSelectScene'),
    });
    const howBtn = new MenuButton(this, W / 2, 552, 'HOW TO PLAY', {
      onSelect: () => this.setHelp(!this.help),
    });
    this.menu = new Menu(this, [newRunBtn, continueBtn, howBtn]);
    this.menu.refresh();

    const onKey = (e: KeyboardEvent) => {
      if (this.help) {
        if (e.code === 'Enter' || e.code === 'Escape' || e.code === 'Space') this.setHelp(false);
        return;
      }
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

    // Dev deep-link: ?team=<teamId> skips straight into a match with a fresh run.
    const teamId = new URLSearchParams(window.location.search).get(TEAM_PARAM);
    if (teamId && CAMPAIGN_TEAMS.some((t) => t.id === teamId)) this.launchMatch(teamId);
  }

  private launchMatch(teamId: string): void {
    const state = startMatch(resetRun(), teamId);
    setRun(state);
    const team = CAMPAIGN_TEAMS.find((t) => t.id === teamId)!;
    this.scene.start('GameScene', { userTeam: state.userTeam, opponent: team, level: difficultyLevel(state, teamId) });
  }

  private setHelp(show: boolean): void {
    if (this.help) {
      this.help.destroy();
      this.help = null;
      return;
    }
    if (!show) return;
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const c = this.add.container(0, 0);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive());
    const pw = 780;
    const ph = 560;
    c.add(this.add.rectangle(W / 2, H / 2, pw, ph, FILL.panel, 1).setStrokeStyle(3, THEME.GOLD));
    c.add(
      this.add
        .text(W / 2, H / 2 - ph / 2 + 44, 'HOW TO PLAY', { fontFamily: FONT, fontSize: '26px', color: hex(THEME.GOLD) })
        .setOrigin(0.5),
    );
    HELP_LINES.forEach(([k, val], i) => {
      const y = H / 2 - ph / 2 + 96 + i * 28;
      c.add(
        this.add
          .text(W / 2 - pw / 2 + 48, y, k.padEnd(14) + val, {
            fontFamily: FONT,
            fontSize: '15px',
            color: k ? hex(THEME.WHITE) : hex(THEME.DIM),
          })
          .setOrigin(0, 0.5),
      );
    });
    c.add(
      this.add
        .text(W / 2, H / 2 + ph / 2 - 36, 'ESC / ENTER — back', { fontFamily: FONT, fontSize: '14px', color: hex(THEME.DIM) })
        .setOrigin(0.5),
    );
    this.help = c;
  }

  update(_time: number, delta: number): void {
    for (const b of this.bobbers) {
      b.phase += (delta / 1000) * 2;
      b.spr.y = 290 + Math.sin(b.phase) * 8;
    }
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
