import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { CAMPAIGN_TEAMS, type Team } from '../config/teams';
import { difficultyLevel, isChampion, startMatch, wins } from '../core/campaign';
import { averageOverall } from '../core/poach';
import { getRun, setRun } from '../state/runStore';
import { TextButton, hex, rosterStrip } from '../ui/menu';
import { FILL, FONT, THEME } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

const CARD_W = 270;
const CARD_H = 300;
const CARD_GAP = 16;
const CARD_TOP = 108;
const CARD_LEFT = (GAME_WIDTH - (CAMPAIGN_TEAMS.length * CARD_W + (CAMPAIGN_TEAMS.length - 1) * CARD_GAP)) / 2;

export class OpponentSelectScene extends Phaser.Scene {
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('OpponentSelectScene');
  }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const state = getRun();
    this.cameras.main.setBackgroundColor(FILL.background);

    this.add
      .text(W / 2, 44, 'CHOOSE YOUR OPPONENT', { fontFamily: FONT, fontSize: '30px', color: hex(THEME.WHITE) })
      .setOrigin(0.5);
    this.add
      .text(W / 2, 82, `${wins(state)} win(s) this run · pick your order — the champion is always on the table`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: hex(THEME.DIM),
      })
      .setOrigin(0.5);

    CAMPAIGN_TEAMS.forEach((team, i) => {
      const cx = CARD_LEFT + i * (CARD_W + CARD_GAP) + CARD_W / 2;
      const cy = CARD_TOP + CARD_H / 2;
      const available = !state.results[team.id];
      const champion = isChampion(team.id);
      const stroke = champion ? THEME.GOLD : team.color;

      const panel = this.add.rectangle(cx, cy, CARD_W, CARD_H, FILL.plate, 1).setStrokeStyle(3, stroke);
      if (available) panel.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.launch(team.id));

      let status = 'READY';
      let statusColor: number = THEME.GREEN;
      if (state.results[team.id] === 'loss') {
        status = 'DEFEATED YOU';
        statusColor = THEME.RED;
      } else if (state.results[team.id] === 'win') {
        status = 'DEFEATED';
        statusColor = THEME.GRAY;
      } else if (champion) {
        status = 'NEARLY IMPOSSIBLE';
        statusColor = THEME.RED;
      }
      this.add.text(cx, CARD_TOP + 24, status, { fontFamily: FONT, fontSize: '13px', color: hex(statusColor) }).setOrigin(0.5);
      this.add
        .text(cx, CARD_TOP + 56, (champion ? '★ ' : '') + team.name, {
          fontFamily: FONT,
          fontSize: '18px',
          color: hex(champion ? THEME.GOLD : THEME.WHITE),
        })
        .setOrigin(0.5);

      this.add.text(cx, CARD_TOP + 96, 'SCOUTING REPORT', { fontFamily: FONT, fontSize: '11px', color: hex(THEME.DIM) }).setOrigin(0.5);
      rosterStrip(this, cx - 104, CARD_TOP + 136, team.players, 40);
      this.add
        .text(cx, CARD_TOP + 186, `TEAM OVR  ${averageOverall(team.players)}`, {
          fontFamily: FONT,
          fontSize: '16px',
          color: hex(THEME.GOLD),
        })
        .setOrigin(0.5);

      if (available) {
        this.add
          .text(cx, CARD_TOP + 216, `AI LEVEL  ${difficultyLevel(state, team.id).toFixed(2)}`, {
            fontFamily: FONT,
            fontSize: '14px',
            color: hex(THEME.BLUE),
          })
          .setOrigin(0.5);
        new TextButton(this, cx, CARD_TOP + CARD_H - 28, `press ${i + 1} · click`, { onSelect: () => this.launch(team.id) });
      } else {
        const poach = state.poaches.find((p) => p.fromTeamId === team.id);
        this.add
          .text(cx, CARD_TOP + 216, state.results[team.id] === 'win' ? (poach ? `poached ${poach.taken}` : 'no poach') : 'the run is over', {
            fontFamily: FONT,
            fontSize: '13px',
            color: hex(THEME.DIM),
          })
          .setOrigin(0.5);
      }
    });

    // Footer: the player's current roster.
    const ft = state.userTeam;
    this.add.text(32, 452, 'YOUR TEAM', { fontFamily: FONT, fontSize: '13px', color: hex(THEME.DIM) });
    this.add
      .text(32, 480, `${ft.name}  ·  ${wins(state)} win(s)  ·  ${state.poaches.length} poached`, {
        fontFamily: FONT,
        fontSize: '16px',
        color: hex(THEME.WHITE),
      });
    rosterStrip(this, 32, 532, ft.players, 48);
    this.add
      .text(32, 578, `TEAM OVR  ${averageOverall(ft.players)}`, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.GOLD) });
    new TextButton(this, GAME_WIDTH - 130, 480, 'SAVE & QUIT  (ESC)', { color: THEME.GRAY, onSelect: () => this.scene.start('TitleScene') });

    const onKey = (e: KeyboardEvent) => {
      const digits = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'];
      const i = digits.indexOf(e.code);
      if (i >= 0 && CAMPAIGN_TEAMS[i]) {
        const team = CAMPAIGN_TEAMS[i];
        if (!getRun().results[team.id]) this.launch(team.id);
        return;
      }
      if (e.code === 'Escape') this.scene.start('TitleScene');
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
  }

  private launch(teamId: string): void {
    const state = startMatch(getRun(), teamId);
    setRun(state);
    const team: Team = CAMPAIGN_TEAMS.find((t) => t.id === teamId)!;
    this.scene.start('GameScene', { userTeam: state.userTeam, opponent: team, level: difficultyLevel(state, teamId) });
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
