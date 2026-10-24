import Phaser from 'phaser';
import { getWorldState } from '../core/worldState';
import { addRetroChrome, addRetroPanel } from '../ui/chrome';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { CAMPAIGN_TEAMS } from '../config/teams';
import { difficultyLevel, startMatch } from '../core/campaign';
import { clearRunSave, getRun, hasSavedRun, resetRun, setRun, takeNotice } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { addRun, beginNewYear, getMeta, resetMetaState, type StarterId } from '../state/metaStore';
import { yearEndReflection, yearOpening } from '../config/story';
import { STARTER_EVOLUTIONS } from '../config/progression';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { beginCareerRun, clearCareerStats } from '../state/careerStatsStore';

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
  ['LOSE', 'the run ends; Second Chance Charm grants one rematch per run'],
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

  create(data?: { advanceYearAfterReflection?: boolean }): void {
    wireShutdown(this);
    if (data?.advanceYearAfterReflection) { this.beginNextYear(); return; }
    this.bobbers = [];
    this.help = null;
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GOLD);

    this.add
      .text(348, 151, 'ICE POKÉY', { fontFamily: FONT, fontSize: '64px', color: hex(THEME.GOLD) })
      .setOrigin(0.5);
    this.add
      .text(348, 204, 'a roguelike pokémon hockey run', { fontFamily: FONT, fontSize: '16px', color: hex(THEME.DIM) })
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
    addRetroPanel(this, 348, 352, 508, 214, THEME.BLUE, FILL.panel);
    this.add.text(348, 274, hasPlayed ? 'YOUR CURRENT LINEUP' : 'CHOOSE YOUR STARTER', { fontFamily: FONT, fontSize: '14px', color: hex(THEME.DIM) }).setOrigin(0.5);
    lineup.forEach((p, i) => {
      const spr = this.add.image(348 + (i - (lineup.length - 1) / 2) * 140, 350, `pkm-${p.sprite}`);
      spr.setScale(1.15);
      this.bobbers.push({ spr, phase: i * 1.1 });
      this.add.text(spr.x, 414, p.name.toUpperCase(), { fontFamily: FONT, fontSize: '12px', color: hex(THEME.WHITE) }).setOrigin(0.5);
    });

    const notice = takeNotice();
    if (notice) {
      this.add.text(348, 510, notice, { fontFamily: FONT, fontSize: '13px', color: hex(THEME.RED), align: 'center', wordWrap: { width: 480 } }).setOrigin(0.5);
    }

    const newGame = !hasPlayed;
    addRetroPanel(this, 890, 336, 420, 548, THEME.GOLD, FILL.panel);
    this.add.text(890, 94, 'CAMPAIGN', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.GOLD), fontStyle: 'bold' }).setOrigin(.5);
    const primaryPlate = this.add.rectangle(890, 150, 356, 56, FILL.plateHi).setStrokeStyle(1, THEME.GREEN);
    this.add.rectangle(890, 194, 356, 1, 0x34465a);
    this.add.rectangle(890, 508, 356, 1, 0x34465a);
    this.add.text(348, 488, hasPlayed ? `YEAR ${meta.seasonYear}  /  ${meta.daysRemaining} DAYS LEFT  /  ${meta.currency} CREDITS` : 'BUILD A TEAM. CONQUER THE ISLANDS.', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.BLUE) }).setOrigin(.5);
    this.add.text(890, 584, '↑ / ↓ SELECT   ·   ENTER CONFIRM', { fontFamily: FONT, fontSize: '11px', color: hex(THEME.DIM) }).setOrigin(.5);
    const primaryBtn = new MenuButton(this, 890, 150, newGame ? 'NEW GAME' : 'CONTINUE', {
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
        const reflection = yearEndReflection(getWorldState());
        if (reflection && !getMeta().flags.includes(reflection.flag)) {
          this.scene.start('DialogueScene', { nextScene: 'TitleScene', nextData: { advanceYearAfterReflection: true }, lines: reflection.lines, flag: reflection.flag });
          return;
        }
        this.beginNextYear();
      },
    });
    primaryPlate.setInteractive({ useHandCursor: true }).on('pointerdown', () => primaryBtn.onSelect?.());
    const howBtn = new MenuButton(this, 890, 228, 'HOW TO PLAY', {
      size: 20,
      onSelect: () => this.setHelp(!this.help),
    });
    const statsBtn = new MenuButton(this, 890, 280, 'STATS GUIDE' , {
      size: 20,
      color: THEME.BLUE,
      onSelect: () => this.scene.start('StatsGuideScene', { returnTo: 'TitleScene' }),
    });
    const labBtn = new MenuButton(this, 890, 332, 'BALANCE LAB', {
      size: 20,
      color: THEME.GOLD,
      onSelect: () => this.scene.start('BalanceLabScene'),
    });
    const careerStatsBtn = new MenuButton(this, 890, 384, 'CAREER STATS', {
      size: 20,
      color: THEME.BLUE,
      onSelect: () => this.scene.start('CareerStatsScene', { returnTo: 'TitleScene' }),
    });
    const shopBtn = new MenuButton(this, 890, 436, 'ITEM SHOP', {
      size: 20,
      color: THEME.GOLD,
      onSelect: () => this.scene.start('StoreScene', { returnTo: 'TitleScene' }),
    });
    const buttons: MenuButton[] = [primaryBtn, howBtn, statsBtn, labBtn, careerStatsBtn, shopBtn];
    if (hasPlayed) {
      buttons.push(new MenuButton(this, 890, 546, 'WIPE ALL DATA', {
        color: THEME.RED,
        size: 14,
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
        clearCareerStats();
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
    const pw = 960;
    const ph = 560;
    c.add(this.add.rectangle(W / 2, H / 2, pw, ph, FILL.panel, 1).setStrokeStyle(3, THEME.GOLD));
    c.add(
      this.add
        .text(W / 2, H / 2 - ph / 2 + 44, 'HOW TO PLAY', { fontFamily: FONT, fontSize: '26px', color: hex(THEME.GOLD) })
        .setOrigin(0.5),
    );
    HELP_LINES.forEach(([k, val], i) => {
      const y = H / 2 - ph / 2 + 86 + i * 27;
      c.add(this.add.text(W / 2 - pw / 2 + 32, y, k, { fontFamily: FONT, fontSize: '12px', color: hex(THEME.GOLD), fontStyle: 'bold' }).setOrigin(0, .5));
      c.add(
        this.add
          .text(W / 2 - pw / 2 + 200, y, val, {
            fontFamily: FONT,
            fontSize: '12px',
            wordWrap: { width: 710 },
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
      b.spr.y = 350 + Math.sin(b.phase) * 8;
    }
  }

  private beginNextYear(): void {
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
    this.resetDialog?.destroy();
    this.resetDialog = null;
    this.bobbers = [];
    this.help?.destroy();
    this.help = null;
  }
}
