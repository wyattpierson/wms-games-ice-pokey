import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { applyPoach, skipPoach, teamById } from '../core/campaign';
import { compareStats, netUpgrade, overall, rosterEntries, suggestDrop, type RosterEntry } from '../core/poach';
import { getRun, setRun } from '../state/runStore';
import { CARD_W, PlayerCard } from '../ui/PlayerCard';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

// ---- layout (the stage is 1192 × 672) ----
const COL_L = 220; // center x of the beaten team's column
const COL_R = 972; // center x of your column
const FIELD_Y = [184, 278, 372]; // card centers, field players
const DIVIDER_Y = 426; // the "GOALIE" divider between field cards and the goalie card
const GOALIE_Y = 478;
const PANEL_Y = 322;
const PANEL_W = 380;
const PANEL_H = 428;

/** Which column has the cursor: choosing who to take, or choosing who to drop. */
type Stage = 'take' | 'drop';

const T = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color: hex(color),
  ...extra,
});

/**
 * The poach screen: take 1 player from the just-beaten team, drop 1 of your own (same position).
 * The taken player moves into the dropped player's slot. Skipping still consumes the beaten
 * team (you get one pick per win).
 *
 * Two steps, one cursor:
 *   1. TAKE — pick anyone from the beaten team (field players and the goalie are in one list).
 *   2. DROP — pick who they replace. Only same-position players are legal (the rest fade out);
 *      the weakest one is pre-selected as a sensible default.
 * ENTER advances / confirms, ← or ESC goes back. Everything is also clickable.
 */
export class PoachScene extends Phaser.Scene {
  private teamId = '';
  private stage: Stage = 'take';
  private takenIdx = 0; // index into sourceEntries
  private dropIdx = 0; // index into ownEntries
  private committed = false;
  private sourceEntries: RosterEntry[] = [];
  private ownEntries: RosterEntry[] = [];
  private sourceCards: PlayerCard[] = [];
  private ownCards: PlayerCard[] = [];
  private stepText!: Phaser.GameObjects.Text;
  private underL!: Phaser.GameObjects.Rectangle;
  private underR!: Phaser.GameObjects.Rectangle;
  private dropSprite!: Phaser.GameObjects.Image;
  private takeSprite!: Phaser.GameObjects.Image;
  private dropName!: Phaser.GameObjects.Text;
  private takeName!: Phaser.GameObjects.Text;
  private rows: { label: Phaser.GameObjects.Text; drop: Phaser.GameObjects.Text; take: Phaser.GameObjects.Text; diff: Phaser.GameObjects.Text }[] = [];
  private verdict!: Phaser.GameObjects.Text;
  private ovrLine!: Phaser.GameObjects.Text;
  private actionBtn!: TextButton;
  private skipBtn!: TextButton;
  private skipArmed = false;
  private skipTimer: Phaser.Time.TimerEvent | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('PoachScene');
  }

  init(data: { teamId: string }): void {
    this.teamId = data?.teamId ?? '';
    this.stage = 'take';
    this.takenIdx = 0;
    this.dropIdx = 0;
    this.committed = false;
    this.skipArmed = false;
    this.skipTimer = null;
    this.rows = [];
    this.sourceCards = [];
    this.ownCards = [];
  }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const state = getRun();
    if (state.pendingPoach !== this.teamId) {
      // Stale launch (nothing to poach): just carry on.
      this.scene.start('OpponentSelectScene');
      return;
    }
    this.cameras.main.setBackgroundColor(FILL.background);

    const source = teamById(this.teamId);
    const own = state.userTeam;
    this.sourceEntries = rosterEntries(source);
    this.ownEntries = rosterEntries(own);
    this.takenIdx = 0;
    this.dropIdx = suggestDrop(this.ownEntries, this.sourceEntries[0].side);

    this.add.text(W / 2, 32, 'TAKE A PLAYER', T(30, THEME.GOLD)).setOrigin(0.5);
    this.stepText = this.add.text(W / 2, 70, '', T(15, THEME.WHITE)).setOrigin(0.5);

    // Column headers + an underline that follows the cursor.
    this.add.text(COL_L, 122, `TAKE FROM  ${source.name.toUpperCase()}`, T(14, THEME.GREEN)).setOrigin(0.5);
    this.add.text(COL_R, 122, `DROP FROM  ${own.name.toUpperCase()}`, T(14, THEME.RED)).setOrigin(0.5);
    this.underL = this.add.rectangle(COL_L, 134, CARD_W, 3, THEME.GOLD, 1);
    this.underR = this.add.rectangle(COL_R, 134, CARD_W, 3, THEME.GOLD, 1);

    for (const x of [COL_L, COL_R]) {
      this.add.rectangle(x - 78, DIVIDER_Y, 110, 1, THEME.DIM, 0.6);
      this.add.rectangle(x + 78, DIVIDER_Y, 110, 1, THEME.DIM, 0.6);
      this.add.text(x, DIVIDER_Y, 'GOALIE', T(11, THEME.GOLD)).setOrigin(0.5);
    }

    const cardY = (e: RosterEntry) => (e.side === 'goalie' ? GOALIE_Y : FIELD_Y[e.sideIdx]);
    this.sourceCards = this.sourceEntries.map(
      (e, i) =>
        new PlayerCard(this, COL_L, cardY(e), e.player, {
          role: e.side === 'goalie' ? 'GOALIE' : 'FIELD',
          tone: 'take',
          onHover: () => {
            if (this.stage === 'take' && i !== this.takenIdx) this.setTaken(i);
          },
          onClick: () => {
            this.setTaken(i);
            this.stage = 'drop';
            this.refresh();
          },
        }),
    );
    this.ownCards = this.ownEntries.map(
      (e, j) =>
        new PlayerCard(this, COL_R, cardY(e), e.player, {
          role: e.side === 'goalie' ? 'GOALIE' : 'FIELD',
          tone: 'drop',
          onHover: () => {
            if (this.stage === 'drop' && this.isEligible(j) && j !== this.dropIdx) {
              this.dropIdx = j;
              this.refresh();
            }
          },
          onClick: () => {
            if (!this.isEligible(j)) return;
            this.dropIdx = j;
            this.stage = 'drop';
            this.refresh();
          },
        }),
    );

    this.buildPreview();

    this.skipBtn = new TextButton(this, W / 2, 586, 'SKIP — TAKE NOBODY  (ESC)', { color: THEME.GRAY, onSelect: () => this.requestSkip() });
    this.add
      .text(W / 2, 632, '↑ ↓  choose      ENTER  select / confirm      ←  back      the beaten team is gone either way', T(12, THEME.DIM))
      .setOrigin(0.5);

    const onKey = (e: KeyboardEvent) => {
      if (this.committed) return;
      const back = e.code === 'Escape' || e.code === 'Backspace';
      if (e.repeat && (back || e.code === 'Enter' || e.code === 'Space')) return;
      if (!back || this.stage === 'drop') this.disarmSkip();
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.move(-1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.move(1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          if (this.stage === 'take') this.goTo('drop');
          break;
        case 'ArrowLeft':
        case 'KeyA':
          if (this.stage === 'drop') this.goTo('take');
          break;
        case 'Enter':
        case 'Space':
          this.advance();
          break;
        case 'Escape':
        case 'Backspace':
          if (this.stage === 'drop') this.goTo('take');
          else this.requestSkip();
          break;
      }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);

    this.refresh();
  }

  // ---------- the swap preview (center panel) ----------

  private buildPreview(): void {
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, PANEL_Y, PANEL_W, PANEL_H, FILL.panel, 1).setStrokeStyle(2, THEME.DIM);
    this.add.text(cx, 128, 'SWAP PREVIEW', T(13, THEME.DIM)).setOrigin(0.5);

    const plate = (x: number, color: number) => this.add.rectangle(x, 190, 84, 84, FILL.background, 1).setStrokeStyle(2, color);
    plate(cx - 92, THEME.RED);
    plate(cx + 92, THEME.GREEN);
    this.dropSprite = this.add.image(cx - 92, 190, 'pkm-0').setScale(72 / 96);
    this.takeSprite = this.add.image(cx + 92, 190, 'pkm-0').setScale(72 / 96);
    this.add.text(cx, 190, '→', T(30, THEME.GOLD)).setOrigin(0.5);
    this.add.text(cx - 92, 244, 'DROP', T(11, THEME.RED, { fontStyle: 'bold' })).setOrigin(0.5);
    this.add.text(cx + 92, 244, 'TAKE', T(11, THEME.GREEN, { fontStyle: 'bold' })).setOrigin(0.5);
    this.dropName = this.add.text(cx - 92, 262, '', T(15, THEME.WHITE)).setOrigin(0.5);
    this.takeName = this.add.text(cx + 92, 262, '', T(15, THEME.WHITE)).setOrigin(0.5);

    // Stat table: STAT | DROP → TAKE | DIFF
    const X = { label: cx - 150, drop: cx - 40, arrow: cx - 14, take: cx + 50, diff: cx + 150 };
    this.add.text(X.label, 290, 'STAT', T(11, THEME.DIM)).setOrigin(0, 0.5);
    this.add.text(X.drop, 290, 'DROP', T(11, THEME.RED)).setOrigin(1, 0.5);
    this.add.text(X.take, 290, 'TAKE', T(11, THEME.GREEN)).setOrigin(1, 0.5);
    this.add.text(X.diff, 290, 'DIFF', T(11, THEME.DIM)).setOrigin(1, 0.5);
    this.add.rectangle(cx, 302, PANEL_W - 60, 1, THEME.DIM, 0.5);
    for (let i = 0; i < 6; i++) {
      const y = 316 + i * 25;
      this.add.text(X.arrow, y, '→', T(13, THEME.DIM)).setOrigin(0.5);
      this.rows.push({
        label: this.add.text(X.label, y, '', T(15, THEME.GRAY)).setOrigin(0, 0.5),
        drop: this.add.text(X.drop, y, '', T(15, THEME.GRAY)).setOrigin(1, 0.5),
        take: this.add.text(X.take, y, '', T(15, THEME.WHITE)).setOrigin(1, 0.5),
        diff: this.add.text(X.diff, y, '', T(15, THEME.WHITE)).setOrigin(1, 0.5),
      });
    }

    this.verdict = this.add.text(cx, 464, '', T(18, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(0.5);
    this.ovrLine = this.add.text(cx, 485, '', T(12, THEME.GRAY)).setOrigin(0.5);
    this.actionBtn = new TextButton(this, cx, 510, 'CONFIRM', { color: THEME.GREEN, minWidth: 330, onSelect: () => this.advance() });
  }

  // ---------- selection model ----------

  private isEligible(ownIdx: number): boolean {
    return this.ownEntries[ownIdx].side === this.sourceEntries[this.takenIdx].side;
  }

  private eligibleOwn(): number[] {
    return this.ownEntries.map((_, j) => j).filter((j) => this.isEligible(j));
  }

  /** Pick who to take; the drop falls back to the weakest legal player (and is kept if it's still legal). */
  private setTaken(i: number): void {
    this.takenIdx = i;
    if (!this.isEligible(this.dropIdx) || this.stage === 'take') {
      this.dropIdx = suggestDrop(this.ownEntries, this.sourceEntries[i].side);
    }
    this.refresh();
  }

  private move(dir: number): void {
    if (this.stage === 'take') {
      const next = Math.max(0, Math.min(this.sourceEntries.length - 1, this.takenIdx + dir));
      this.setTaken(next);
    } else {
      const legal = this.eligibleOwn();
      const at = legal.indexOf(this.dropIdx);
      this.dropIdx = legal[Math.max(0, Math.min(legal.length - 1, at + dir))];
      this.refresh();
    }
  }

  private goTo(stage: Stage): void {
    this.stage = stage;
    this.refresh();
  }

  /** ENTER / the big button: step 1 → step 2, or step 2 → do the swap. */
  private advance(): void {
    if (this.stage === 'take') this.goTo('drop');
    else this.confirm();
  }

  private confirm(): void {
    const state = getRun();
    if (this.committed || state.pendingPoach !== this.teamId) return;
    const taken = this.sourceEntries[this.takenIdx];
    const dropped = this.ownEntries[this.dropIdx];
    this.committed = true;
    setRun(applyPoach(state, taken.side, this.teamId, taken.sideIdx, dropped.sideIdx));
    this.scene.start('OpponentSelectScene');
  }

  /** Skipping can't be undone (the team is consumed), so it takes two presses. */
  private requestSkip(): void {
    if (this.committed) return;
    if (!this.skipArmed) {
      this.skipArmed = true;
      this.skipBtn.setLabel('SURE? NOBODY JOINS AND THE TEAM IS GONE — ESC / CLICK AGAIN', THEME.RED);
      this.skipTimer = this.time.delayedCall(3500, () => this.disarmSkip());
      return;
    }
    this.committed = true;
    const state = getRun();
    if (state.pendingPoach === this.teamId) setRun(skipPoach(state));
    this.scene.start('OpponentSelectScene');
  }

  private disarmSkip(): void {
    if (!this.skipArmed) return;
    this.skipArmed = false;
    this.skipTimer?.remove(false);
    this.skipTimer = null;
    this.skipBtn.setLabel('SKIP — TAKE NOBODY  (ESC)', THEME.GRAY);
  }

  // ---------- painting ----------

  private refresh(): void {
    const taken = this.sourceEntries[this.takenIdx];
    const dropped = this.ownEntries[this.dropIdx];
    const takeStage = this.stage === 'take';

    this.sourceCards.forEach((c, i) => c.setVisual({ focus: takeStage && i === this.takenIdx, marked: i === this.takenIdx, dimmed: false }));
    this.ownCards.forEach((c, j) =>
      c.setVisual({ focus: !takeStage && j === this.dropIdx, marked: j === this.dropIdx, dimmed: !this.isEligible(j) }),
    );

    this.underL.setAlpha(takeStage ? 1 : 0.15);
    this.underR.setAlpha(takeStage ? 0.15 : 1);
    this.stepText.setText(
      takeStage
        ? `STEP 1 / 2  —  choose who to TAKE from ${teamById(this.teamId).name}`
        : `STEP 2 / 2  —  choose who to DROP  (${taken.side === 'goalie' ? 'goalie for goalie' : 'a field player'})`,
    );

    this.dropSprite.setTexture(`pkm-${dropped.player.sprite}`);
    this.takeSprite.setTexture(`pkm-${taken.player.sprite}`);
    this.dropName.setText(dropped.player.name);
    this.takeName.setText(taken.player.name);

    const deltas = compareStats(taken.player, dropped.player);
    deltas.forEach((d, i) => {
      const color = d.diff > 0 ? THEME.GREEN : d.diff < 0 ? THEME.RED : THEME.DIM;
      const row = this.rows[i];
      row.label.setText(d.label);
      row.drop.setText(String(d.dropped));
      row.take.setText(String(d.taken)).setColor(hex(color));
      row.diff.setText(d.diff > 0 ? `+${d.diff}` : d.diff < 0 ? `${d.diff}` : '·').setColor(hex(color));
    });

    const net = netUpgrade(deltas);
    this.verdict
      .setText(net > 0 ? `NET UPGRADE  +${net}` : net < 0 ? `NET DOWNGRADE  ${net}` : 'EVEN SWAP')
      .setColor(hex(net > 0 ? THEME.GREEN : net < 0 ? THEME.RED : THEME.GRAY));
    const dOvr = overall(taken.player) - overall(dropped.player);
    this.ovrLine.setText(`OVR  ${overall(dropped.player)} → ${overall(taken.player)}   (${dOvr > 0 ? '+' : ''}${dOvr})`);

    if (takeStage) this.actionBtn.setLabel('NEXT: CHOOSE WHO TO DROP  →', THEME.GOLD);
    else this.actionBtn.setLabel('CONFIRM SWAP  (ENTER)', THEME.GREEN);
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.skipTimer?.remove(false);
    this.skipTimer = null;
  }
}
