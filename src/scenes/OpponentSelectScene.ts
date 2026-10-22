import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import type { Team } from '../config/teams';
import { isChampion, isIslandBoss, startMatch, teamById, wins } from '../core/campaign';
import { averageOverall } from '../core/poach';
import { getRun, setRun } from '../state/runStore';
import { TextButton, hex, rosterStrip } from '../ui/menu';
import { FILL, FONT, THEME } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { ZONES, zoneThreatLevel } from '../config/progression';
import { getMeta, spendDays } from '../state/metaStore';
import { TIME_COSTS } from '../config/progression';

// ---- layout (the stage is 1192 × 672) ----
const CARD_W = 270;
const CARD_H = 350;
const CARD_GAP = 16;
const CARD_TOP = 98;
const CARD_COUNT = 4;
const CARDS_W = CARD_COUNT * CARD_W + (CARD_COUNT - 1) * CARD_GAP;
const CARD_LEFT = (GAME_WIDTH - CARDS_W) / 2;
const FOOTER_Y = CARD_TOP + CARD_H + 22; // top edge of the "your team" plate
const FOOTER_H = 672 - FOOTER_Y - 44;
const PIPS = 5;

const T = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color: hex(color),
  ...extra,
});

interface OpponentCard {
  team: Team;
  cx: number;
  cy: number;
  available: boolean;
}

export class OpponentSelectScene extends Phaser.Scene {
  private cards: OpponentCard[] = [];
  private focus = -1; // index of the highlighted island opponent (-1: none available)
  private ring!: Phaser.GameObjects.Rectangle;
  private panels: Phaser.GameObjects.Rectangle[] = [];
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('OpponentSelectScene');
  }

  init(): void {
    this.cards = [];
    this.panels = [];
    this.focus = -1;
  }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const state = getRun();
    if (getMeta().daysRemaining <= 0) { this.scene.start('ZoneSelectScene'); return; }

    // A poach that was earned but never resolved (e.g. the page was refreshed on the poach
    // screen) is resumed rather than silently lost.
    if (state.pendingPoach) {
      this.scene.start('PoachScene', { teamId: state.pendingPoach });
      return;
    }

    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.BLUE);
    const zone = ZONES.find(z => z.id === getMeta().selectedZoneId) || ZONES[0];
    this.add.text(W / 2, 38, zone.name, T(30, THEME.WHITE)).setOrigin(0.5);
    const islandTeams = [...zone.opponents, zone.bossId].map(id => teamById(id));
    const regulars = islandTeams.length;
    const beaten = islandTeams.filter((t) => state.results[t.id] === 'win').length;
    this.add
      .text(W / 2, 72, `YEAR ${getMeta().seasonYear} · ${getMeta().daysRemaining} DAYS TO TOURNAMENT · ${beaten} / ${regulars} teams beaten · ${zone.theme}`, T(13, getMeta().daysRemaining <= 45 ? THEME.RED : THEME.DIM))
      .setOrigin(0.5);

    const ownOvr = averageOverall(state.userTeam.players);
    islandTeams.forEach((team, i) => this.buildCard(i, team, ownOvr));

    // One ring follows the keyboard/mouse focus from card to card.
    this.ring = this.add.rectangle(0, 0, CARD_W + 12, CARD_H + 12).setStrokeStyle(3, THEME.GOLD).setVisible(false);
    this.focus = this.cards.findIndex((c) => c.available);
    this.paintFocus();

    this.buildFooter(ownOvr);

    const onKey = (e: KeyboardEvent) => {
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const i = Number(digit[2]) - 1;
        if (this.cards[i]?.available) this.launch(this.cards[i].team.id);
        return;
      }
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.stepFocus(-1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.stepFocus(1);
          break;
        case 'Enter':
        case 'Space':
          if (this.focus >= 0 && this.cards[this.focus].available) this.launch(this.cards[this.focus].team.id);
          break;
        case 'Escape':
          this.scene.start('TitleScene');
          break;
      }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
  }

  // ---------- one opponent card ----------

  private buildCard(i: number, team: Team, ownOvr: number): void {
    const state = getRun();
    const zone = ZONES.find(z => z.id === getMeta().selectedZoneId) || ZONES[0];
    const cx = CARD_LEFT + i * (CARD_W + CARD_GAP) + CARD_W / 2;
    const cy = CARD_TOP + CARD_H / 2;
    const champion = isChampion(team.id);
    const boss = isIslandBoss(team.id);
    const result = state.results[team.id];
    const available = !result;
    this.cards.push({ team, cx, cy, available });

    const card = this.add.container(cx, cy);
    const put = <G extends Phaser.GameObjects.GameObject>(o: G): G => {
      card.add(o);
      return o;
    };
    const stroke = champion || boss ? THEME.GOLD : team.color;

    const panel = put(this.add.rectangle(0, 0, CARD_W, CARD_H, FILL.plate, 1).setStrokeStyle(3, stroke));
    this.panels[i] = panel;
    // A strip in the team's color carries the status label.
    put(this.add.rectangle(0, -CARD_H / 2 + 22, CARD_W - 6, 40, team.color, 0.18));

    let status = 'READY';
    let statusColor: number = THEME.GREEN;
    if (result === 'loss') {
      status = 'DEFEATED YOU';
      statusColor = THEME.RED;
    } else if (result === 'win') {
      status = '✓ DEFEATED';
      statusColor = THEME.GRAY;
    } else if (boss) {
      status = 'ISLAND BOSS';
      statusColor = THEME.RED;
    }
    put(this.add.text(0, -CARD_H / 2 + 22, status, T(13, statusColor, { fontStyle: 'bold' })).setOrigin(0.5));
    put(this.add.text(0, -CARD_H / 2 + 68, (boss ? '★ ' : '') + team.name, T(20, champion || boss ? THEME.GOLD : THEME.WHITE, { fontStyle: 'bold' })).setOrigin(0.5));

    put(this.add.text(0, -CARD_H / 2 + 104, 'ROSTER  ·  OVR', T(11, THEME.DIM)).setOrigin(0.5));
    put(rosterStrip(this, 0, -CARD_H / 2 + 146, team.players, 52));

    const ovr = averageOverall(team.players);
    put(this.add.text(0, -CARD_H / 2 + 208, `TEAM OVR  ${ovr}`, T(17, THEME.GOLD)).setOrigin(0.5));

    if (available) {
      // How they stack up against you: higher than yours is a warning, lower is good news.
      const gap = ovr - ownOvr;
      const vs = gap === 0 ? 'even with your team' : `${gap > 0 ? '+' : '−'}${Math.abs(gap)} vs your team`;
      put(this.add.text(0, -CARD_H / 2 + 232, vs, T(12, gap > 0 ? THEME.RED : gap < 0 ? THEME.GREEN : THEME.GRAY)).setOrigin(0.5));

      put(this.add.text(0, -CARD_H / 2 + 286, `MATCH COST · ${TIME_COSTS.match} DAYS`, T(12, THEME.GOLD)).setOrigin(0.5));
      const completedRegularWins = zone.opponents.filter(id => state.results[id] === 'win').length;
      const level = zoneThreatLevel(zone.difficulty, completedRegularWins, boss);
      const lit = Math.max(1, Math.min(PIPS, Math.round(level * PIPS)));
      const pipW = 16;
      const pipGap = 4;
      const barW = PIPS * pipW + (PIPS - 1) * pipGap;
      const rowY = -CARD_H / 2 + 262;
      put(this.add.text(-barW / 2 - 8, rowY, 'THREAT', T(11, THEME.DIM)).setOrigin(1, 0.5));
      for (let p = 0; p < PIPS; p++) {
        const on = p < lit;
        put(this.add.rectangle(-barW / 2 + pipW / 2 + p * (pipW + pipGap) + 4, rowY, pipW, 8, on ? THEME.BLUE : FILL.background, 1).setStrokeStyle(1, on ? THEME.BLUE : THEME.DIM));
      }

      card.add(new TextButton(this, 0, CARD_H / 2 - 28, `FIGHT  [${i + 1}]`, { color: champion || boss ? THEME.GOLD : THEME.GREEN, minWidth: 150 }));
    } else {
      const poach = state.poaches.find((p) => p.fromTeamId === team.id);
      const line =
        result === 'win' ? (poach ? `took ${poach.taken}` : 'nobody taken') : 'your run ended here';
      const color = result === 'win' ? (poach ? THEME.GREEN : THEME.DIM) : THEME.DIM;
      put(this.add.text(0, -CARD_H / 2 + 248, line, T(13, color)).setOrigin(0.5));
      card.setAlpha(0.55);
    }

    if (available) {
      panel.setInteractive({ useHandCursor: true });
      panel.on('pointerover', () => {
        this.focus = i;
        this.paintFocus();
      });
      panel.on('pointerdown', () => this.launch(team.id));
    }
  }

  // ---------- footer: your team ----------

  private buildFooter(ownOvr: number): void {
    const state = getRun();
    const x0 = (GAME_WIDTH - CARDS_W) / 2;
    const cy = FOOTER_Y + FOOTER_H / 2;
    this.add.rectangle(GAME_WIDTH / 2, cy, CARDS_W, FOOTER_H, FILL.plate, 1).setStrokeStyle(2, THEME.DIM);

    const lx = x0 + 28;
    this.add.text(lx, cy - 40, 'YOUR TEAM', T(11, THEME.DIM)).setOrigin(0, 0.5);
    this.add.text(lx, cy - 14, state.userTeam.name, T(22, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    this.add.text(lx, cy + 16, `${wins(state)} win${wins(state) === 1 ? '' : 's'}  ·  ${state.poaches.length} poached`, T(13, THEME.GRAY)).setOrigin(0, 0.5);

    rosterStrip(this, x0 + 470, cy - 4, state.userTeam.players, 60);

    this.add.text(x0 + 770, cy - 30, 'TEAM OVR', T(11, THEME.DIM)).setOrigin(0.5);
    this.add.text(x0 + 770, cy + 4, String(ownOvr), T(40, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(0.5);

    new TextButton(this, x0 + CARDS_W - 28 - 88, cy, 'SAVE & QUIT  (ESC)', { color: THEME.GRAY, minWidth: 176, onSelect: () => this.scene.start('TitleScene') });
  }

  // ---------- focus ----------

  private stepFocus(dir: number): void {
    const open = this.cards.map((c, i) => (c.available ? i : -1)).filter((i) => i >= 0);
    if (open.length === 0) return;
    const at = open.indexOf(this.focus);
    this.focus = open[(at + dir + open.length) % open.length];
    this.paintFocus();
  }

  private paintFocus(): void {
    this.cards.forEach((c, i) => {
      if (c.available) this.panels[i].setFillStyle(i === this.focus ? FILL.plateHi : FILL.plate, 1);
    });
    if (this.focus < 0) {
      this.ring.setVisible(false);
      return;
    }
    const c = this.cards[this.focus];
    this.ring.setPosition(c.cx, c.cy).setVisible(true);
  }

  private launch(teamId: string): void {
    if (getMeta().daysRemaining <= 0) { this.scene.start('ZoneSelectScene'); return; }
    spendDays(TIME_COSTS.match);
    const state = startMatch(getRun(), teamId);
    setRun(state);
    const team = teamById(teamId);
    const zone = ZONES.find(z => z.id === getMeta().selectedZoneId) || ZONES[0];
    const completedRegularWins = zone.opponents.filter(id => state.results[id] === 'win').length;
    const level = zoneThreatLevel(zone.difficulty, completedRegularWins, teamId === zone.bossId);
    this.scene.start('GameScene', { userTeam: state.userTeam, opponent: team, level });
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
