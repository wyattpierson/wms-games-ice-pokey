import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { applyPoach, sidePlayers, skipPoach, teamById, type Side } from '../core/campaign';
import { compareStats, netUpgrade } from '../core/poach';
import { getRun, setRun } from '../state/runStore';
import { PlayerCard } from '../ui/PlayerCard';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

const CARD_Y = { field: [214, 300, 386], goalie: [300] } as const;
const LEFT_X = 220;
const RIGHT_X = 972;

/**
 * The poach screen: take 1 player from the just-beaten team, drop 1 of your own
 * (same side). The taken player swaps into the dropped player's slot. Cancelling
 * or skipping still consumes the beaten team (you get one pick per win).
 */
export class PoachScene extends Phaser.Scene {
  private teamId = '';
  private side: Side = 'field';
  private picked: 'source' | 'own' = 'source';
  private takenIdx = 0;
  private droppedIdx = 0;
  private sourceCards: PlayerCard[] = [];
  private ownCards: PlayerCard[] = [];
  private statRows: Phaser.GameObjects.Text[] = [];
  private verdict!: Phaser.GameObjects.Text;
  private group!: Phaser.GameObjects.Container;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('PoachScene');
  }

  init(data: { teamId: string }): void {
    this.teamId = data?.teamId ?? '';
    this.side = 'field';
    this.picked = 'source';
    this.takenIdx = 0;
    this.droppedIdx = 0;
  }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const state = getRun();
    if (state.pendingPoach !== this.teamId) {
      // Stale launch (e.g. refreshed into a mid-poach save is impossible — the poach
      // screen is not saved — so this is just a safety net): go on without poaching.
      this.scene.start('OpponentSelectScene');
      return;
    }
    this.cameras.main.setBackgroundColor(FILL.background);

    this.add.text(W / 2, 36, 'TAKE A PLAYER', { fontFamily: FONT, fontSize: '30px', color: hex(THEME.GOLD) }).setOrigin(0.5);
    this.group = this.add.container(0, 0);
    this.buildSide();

    const onKey = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.picked = 'source';
          this.refresh();
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.picked = 'own';
          this.refresh();
          break;
        case 'ArrowUp':
        case 'KeyW':
          this.nudge(-1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.nudge(1);
          break;
        case 'Enter':
        case 'Space':
          this.confirm();
          break;
        case 'KeyX':
        case 'Escape':
          this.skip();
          break;
      }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
  }

  private nudge(dir: number): void {
    const state = getRun();
    const source = teamById(this.teamId);
    const max = this.side === 'field'
      ? Math.min(sidePlayers(source, this.side).length, sidePlayers(state.userTeam, this.side).length) - 1
      : 0;
    if (this.picked === 'source') this.takenIdx = Math.max(0, Math.min(max, this.takenIdx + dir));
    else this.droppedIdx = Math.max(0, Math.min(max, this.droppedIdx + dir));
    this.refresh();
  }

  private buildSide(): void {
    const state = getRun();
    const source = teamById(this.teamId);
    const own = state.userTeam;
    const g = this.group;
    g.removeAll(true);
    this.sourceCards = [];
    this.ownCards = [];
    this.statRows = [];

    const sideWord = this.side === 'field' ? 'field players' : 'goalie';
    g.add(
      this.add
        .text(GAME_WIDTH / 2, 70, `beat ${source.name} — take one of their ${sideWord}, drop one of yours into that slot`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: hex(THEME.DIM),
        })
        .setOrigin(0.5),
    );
    const toggle = (x: number, label: string, active: boolean, pick: () => void) => {
      const btn = new TextButton(this, x, 110, label, { color: active ? THEME.GOLD : THEME.DIM, onSelect: pick });
      g.add(btn); // reparent into the group so it dies on side-switch
    };
    toggle(516, 'FIELD × 3', this.side === 'field', () => this.switchSide('field'));
    toggle(676, 'GOALIE × 1', this.side === 'goalie', () => this.switchSide('goalie'));

    g.add(this.add.text(LEFT_X, 152, `TAKE ONE — ${source.name}`, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.GREEN) }).setOrigin(0.5));
    g.add(this.add.text(RIGHT_X, 152, `DROP ONE — ${own.name}`, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.RED) }).setOrigin(0.5));

    const sourcePlayers = sidePlayers(source, this.side);
    const ownPlayers = sidePlayers(own, this.side);
    const ys = CARD_Y[this.side];
    sourcePlayers.forEach((p, i) => {
      const card = new PlayerCard(this, LEFT_X, ys[i], p, this.side === 'goalie' ? 'GOALIE' : 'FIELD');
      g.add(card); // reparent into the group so it dies on side-switch
      this.sourceCards.push(card);
    });
    ownPlayers.forEach((p, i) => {
      const card = new PlayerCard(this, RIGHT_X, ys[i], p, this.side === 'goalie' ? 'GOALIE' : 'FIELD');
      g.add(card);
      this.ownCards.push(card);
    });

    // Center panel: the swap preview.
    g.add(this.add.rectangle(GAME_WIDTH / 2, 432, 380, 404, FILL.panel, 1).setStrokeStyle(2, THEME.DIM));
    g.add(this.add.text(GAME_WIDTH / 2, 254, 'SWAP PREVIEW', { fontFamily: FONT, fontSize: '14px', color: hex(THEME.DIM) }).setOrigin(0.5));
    const taken = sourcePlayers[this.takenIdx];
    const dropped = ownPlayers[this.droppedIdx];
    const tSpr = this.add.image(GAME_WIDTH / 2 - 100, 314, `pkm-${taken.sprite}`);
    tSpr.setScale(54 / 96);
    const dSpr = this.add.image(GAME_WIDTH / 2 + 100, 314, `pkm-${dropped.sprite}`);
    dSpr.setScale(54 / 96);
    g.add([tSpr, dSpr]);
    g.add(this.add.text(GAME_WIDTH / 2 - 100, 356, 'TAKE', { fontFamily: FONT, fontSize: '11px', color: hex(THEME.GREEN) }).setOrigin(0.5));
    g.add(this.add.text(GAME_WIDTH / 2 + 100, 356, 'DROP', { fontFamily: FONT, fontSize: '11px', color: hex(THEME.RED) }).setOrigin(0.5));
    g.add(this.add.text(GAME_WIDTH / 2 - 100, 376, taken.name, { fontFamily: FONT, fontSize: '14px', color: hex(THEME.WHITE) }).setOrigin(0.5));
    g.add(this.add.text(GAME_WIDTH / 2 + 100, 376, dropped.name, { fontFamily: FONT, fontSize: '14px', color: hex(THEME.WHITE) }).setOrigin(0.5));
    g.add(this.add.text(GAME_WIDTH / 2, 320, 'vs', { fontFamily: FONT, fontSize: '15px', color: hex(THEME.DIM) }).setOrigin(0.5));

    compareStats(taken, dropped).forEach((d, i) => {
      const diffStr = d.diff > 0 ? `+${d.diff}` : `${d.diff}`;
      const row = this.add
        .text(GAME_WIDTH / 2, 406 + i * 27, `${d.label.padEnd(6)}${String(d.dropped).padStart(4)}   →   ${String(d.taken).padStart(4)}     ${diffStr.padStart(4)}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: hex(d.diff > 0 ? THEME.GREEN : d.diff < 0 ? THEME.RED : THEME.DIM),
        })
        .setOrigin(0.5);
      this.statRows.push(row);
      g.add(row);
    });
    this.verdict = this.add.text(GAME_WIDTH / 2, 572, '', { fontFamily: FONT, fontSize: '18px' }).setOrigin(0.5);
    g.add(this.verdict);
    g.add(this.add.text(GAME_WIDTH / 2, 600, 'ENTER — confirm swap', { fontFamily: FONT, fontSize: '15px', color: hex(THEME.GOLD) }).setOrigin(0.5));
    g.add(this.add.text(GAME_WIDTH / 2, 626, 'X — cancel · ESC — skip (the team is gone either way)', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.DIM) }).setOrigin(0.5));

    this.refresh();
  }

  private switchSide(side: Side): void {
    if (side === this.side) return;
    this.side = side;
    this.takenIdx = 0;
    this.droppedIdx = 0;
    this.buildSide();
  }

  private refresh(): void {
    for (const [cards, idx] of [
      [this.sourceCards, this.takenIdx],
      [this.ownCards, this.droppedIdx],
    ] as const) {
      cards.forEach((c, i) => {
        c.setEnabled(true);
        c.setSelected(false);
        const active = this.picked === (cards === this.sourceCards ? 'source' : 'own');
        if (!active) c.setEnabled(false);
        if (active && i === idx) c.setSelected(true);
      });
    }
    const state = getRun();
    const source = teamById(this.teamId);
    const taken = sidePlayers(source, this.side)[this.takenIdx];
    const dropped = sidePlayers(state.userTeam, this.side)[this.droppedIdx];
    if (taken && dropped) {
      const net = netUpgrade(compareStats(taken, dropped));
      this.verdict
        .setText(net > 0 ? `NET UPGRADE  +${net}` : net < 0 ? `NET DOWNGRADE  ${net}` : 'EVEN SWAP')
        .setColor(hex(net > 0 ? THEME.GREEN : net < 0 ? THEME.RED : THEME.GRAY));
    }
  }

  private confirm(): void {
    const state = getRun();
    if (state.pendingPoach !== this.teamId) return;
    setRun(applyPoach(state, this.side, this.teamId, this.takenIdx, this.droppedIdx));
    this.scene.start('OpponentSelectScene');
  }

  private skip(): void {
    const state = getRun();
    if (state.pendingPoach === this.teamId) setRun(skipPoach(state));
    this.scene.start('OpponentSelectScene');
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
