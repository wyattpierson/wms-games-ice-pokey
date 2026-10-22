import Phaser from 'phaser';
import { addRetroChrome, addRetroPanel } from '../ui/chrome';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { CAMPAIGN_TEAMS } from '../config/teams';
import { difficultyLevel, startMatch } from '../core/campaign';
import { clearRunSave, getRun, hasSavedRun, resetRun, setRun, takeNotice } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { addRun, beginNewYear, getMeta, resetMetaState, setStoryFlag, type StarterId } from '../state/metaStore';
import { STORY_BEATS, yearOpening } from '../config/story';
import { STARTER_EVOLUTIONS } from '../config/progression';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const TEAM_PARAM = 'team';

const HELP_LINES = [
  ['MOVE', 'ARROWS / WASD'],
  ['PASS · SWITCH', 'SPACE'],
  ['SHOOT', 'HOLD SHIFT — aim UP/DOWN, release on the white ring'],
  ['SKILL MOVES', 'E SPIN · F DEKE: fake low, cut high'],
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
  private resetDialog: ConfirmDialog | null = null;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GOLD);

    this.add
      .text(W / 2, 118, 'ICE POKÉY', { fontFamily: FONT, fontSize: '64px', color: hex(THEME.GOLD) })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 172, 'a roguelike pokémon hockey run', { fontFamily: FONT, fontSize: '16px', color: hex(THEME.DIM) })
      .setOrigin(0.5);

    const meta = getMeta();
    // Before the first save, preview the three possible starters. Afterwards,
    // show the active field lineup from the current saved run (including poaches/evolution).
    let hasBalanceHistory = false;
    try { hasBalanceHistory = !!localStorage.getItem('ice-pokey:balance-lab:v1'); } catch { /* storage may be unavailable */ }
    const hasPlayed = !!meta.starter || meta.totalRuns > 0 || meta.totalMatches > 0 || hasSavedRun() || hasBalanceHistory;
    const lineup = hasPlayed
      ? getRun().userTeam.players.filter((p) => !p.goalie).map((p) => ({ name: p.name, sprite: p.sprite }))
      : (['larvitar', 'gible', 'bagon'] as StarterId[]).map((id) => {
          const starter = STARTER_EVOLUTIONS[id][0];
          return { name: starter.name, sprite: starter.sprite };
        });
    this.add.text(W / 2, 214, hasPlayed ? 'YOUR CURRENT LINEUP' : 'CHOOSE YOUR STARTER', { fontFamily: FONT, fontSize: '14px', color: hex(THEME.DIM) }).setOrigin(0.5);
    lineup.forEach((p, i) => {
      const spr = this.add.image(W / 2 + (i - 1) * 140, 286, `pkm-${p.sprite}`);
      spr.setScale(1.15);
      this.bobbers.push({ spr, phase: i * 1.1 });
      this.add.text(spr.x, 330, p.name.toUpperCase(), { fontFamily: FONT, fontSize: '12px', color: hex(THEME.WHITE) }).setOrigin(0.5);
    });

    const beat = STORY_BEATS.find(b => b.when === 'run-start' && (!b.requiresFlag || meta.flags.includes(b.requiresFlag)) && (!b.requiresNoFlag || !meta.flags.includes(b.requiresNoFlag)));
    if (beat) { this.add.text(W / 2, 360, beat.text, { fontFamily: FONT, fontSize: '13px', color: hex(THEME.GOLD), wordWrap: { width: 850 }, align: 'center' }).setOrigin(0.5); if (beat.setFlag) setStoryFlag(beat.setFlag); }
    const notice = takeNotice();
    if (notice) {
      this.add.text(W / 2, 384, notice, { fontFamily: FONT, fontSize: '14px', color: hex(THEME.RED) }).setOrigin(0.5);
    }

    const newGame = !hasPlayed;
    addRetroPanel(this, W / 2, 511, 370, 198, THEME.GOLD, FILL.panel);
    const primaryBtn = new MenuButton(this, W / 2, 438, newGame ? 'NEW GAME' : 'CONTINUE', {
      color: THEME.GREEN,
      onSelect: () => {
        const current = getMeta();
        if (!current.starter) {
          this.scene.start('StarterSelectScene');
          return;
        }
        if (hasSavedRun()) {
          this.scene.start('ZoneSelectScene');
          return;
        }
        // A completed/failed run rolls straight into the next year. There is no
        // separate New Run button; Continue is the single campaign entry point.
        resetRun();
        beginNewYear();
        addRun();
        const intro = yearOpening(getMeta().seasonYear);
        this.scene.start('DialogueScene', { nextScene: 'ZoneSelectScene', lines: intro.lines, flag: intro.flag });
      },
    });
    const howBtn = new MenuButton(this, W / 2, 492, 'HOW TO PLAY', {
      onSelect: () => this.setHelp(!this.help),
    });
    const labBtn = new MenuButton(this, W / 2, 536, 'BALANCE LAB', {
      color: THEME.GOLD,
      onSelect: () => this.scene.start('BalanceLabScene'),
    });
    const buttons: MenuButton[] = [primaryBtn, howBtn, labBtn];
    if (hasPlayed) {
      buttons.push(new MenuButton(this, W / 2, 586, 'WIPE ALL DATA', {
        color: THEME.RED,
        size: 20,
        onSelect: () => this.confirmWipe(),
      }));
    }
    this.menu = new Menu(this, buttons);
    this.menu.refresh();

    const onKey = (e: KeyboardEvent) => {
      if (this.resetDialog) return;
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

  private confirmWipe(): void {
    if (this.resetDialog) return;
    this.resetDialog = new ConfirmDialog(
      this,
      'WIPE ALL SAVE DATA?',
      'This permanently deletes your starter, years, currency, island resources, unlocks, current run, and Balance Lab history. This cannot be undone.',
      'WIPE EVERYTHING',
      () => {
        this.resetDialog?.destroy();
        this.resetDialog = null;
        resetMetaState();
        clearRunSave();
        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key?.startsWith('ice-pokey:')) localStorage.removeItem(key);
          }
        } catch { /* storage may be unavailable */ }
        this.scene.restart();
      },
      () => {
        this.resetDialog?.destroy();
        this.resetDialog = null;
      },
    );
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
    this.resetDialog?.destroy();
    this.resetDialog = null;
  }
}
