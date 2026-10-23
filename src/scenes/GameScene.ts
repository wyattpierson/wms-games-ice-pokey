import Phaser from 'phaser';
import {
  AI_SPEED_FACTOR, AIM_SLIDE_SPEED, CHARGE_SKATE, CHECK_BUMP_BASE, CHECK_BUMP_PER_DEF, CHECK_COOLDOWN_BASE,
  CHECK_COOLDOWN_PER_DEF, CHECK_DAMAGE_BASE, CHECK_DAMAGE_PER_DEF, CHECK_HIT_REACH, CHECK_PREPLANT_GRACE,
  CHECK_PRESSURE_BASE, CHECK_PRESSURE_PER_DEF, CHECK_RUNIN_MIN, CHECK_STAGGER_BASE, CHECK_STAGGER_PER_DEF,
  CHECK_TIME, DOWN_TIME, HP_REGEN_DELAY, GOALIE_FOOL_MIN_CHARGE, GOALIE_FOOL_RANGE, GOALIE_FOOL_TIME,
  GOALIE_POKE_RANGE, PRESSURE_LOCKOUT, PRESSURE_RANGE, PRESSURE_STRIP_SPEED,
  ONE_TIMER_GRACE, ONE_TIMER_LEAD, ONE_TIMER_MULT, ONE_TIMER_RING_TIME, PARRY_CONE_HALF, SHOT_RANGE, COUNTER_BURST,
  DROP_TIME, GOALIE_SAVE_COOLDOWN, GOALIE_SAVE_DEFLECT_SPEED,
  GOALIE_SAVE_RADIUS, GOALS_TO_WIN, GOAL_PAUSE, PARRY_RANGE, PASS_SPEED, PICKUP_DELAY,
  PICKUP_RADIUS, PERFECT_SHOT_CHARGE, PERFECT_SHOT_MULT, SUPER_SHOT_MULT, SHOT_SPEED_MAX,
  SHOT_SPEED_MIN, FAST_PUCK_SPEED, STUFF_STAGGER_BASE, STUFF_STAGGER_PER_DEF,
  TELL_STEER, TUMBLE_TIME,
} from '../config/gameplay';
import { DEFAULT_LEVEL, difficultyAt, type Difficulty } from '../config/difficulty';
import { CENTER_X, CENTER_Y, GAME_HEIGHT, GAME_WIDTH, ICE_X, ICE_Y, RINK_H, RINK_W } from '../config/rink';
import { OPPONENTS, USER_TEAM, type Team } from '../config/teams';
import { abandonMatch } from '../core/campaign';
import { canRetryBalanceLabLoss } from '../core/balanceLabItems';
import { add, clamp, dist, dot, len, norm, scale, sub, v, type Vec2 } from '../core/vec2';
import { aimTargetY, chargeFromHold, isSuperShotHold, perfectWindowHold, superShotWindowHold, shotDirection } from '../core/shot';
import {
  ALL_MOVES, dashHeading, dashSpeedAt, inFrontCone, dekeAxis, lateralSignY, MOVE_DEFS, parryTiming, verticalFromStick,
  windowSeconds, type MoveId,
} from '../core/moves';
import { respectAfterFool } from '../core/goalie';
import { stepPressure, type Presser } from '../core/pressure';
import { deriveStats, type HockeyStats } from '../core/stats';
import { nearestThreat, stepAI, type AIWorld } from '../gameplay/ai';
import { Controls } from '../gameplay/controls';
import { Player } from '../gameplay/entities/Player';
import { Puck } from '../gameplay/entities/Puck';
import { drawRink } from '../gameplay/entities/Rink';
import { getRun, setRun } from '../state/runStore';
import { archiveCareerRun, beginCareerMatch, finishCareerMatch, recordCareerGoal } from '../state/careerStatsStore';
import { PauseOverlay } from '../ui/PauseOverlay';
import { wireShutdown } from '../ui/sceneLifecycle';
import { POWER_DEFINITIONS, DEFAULT_CAMPAIGN_POWER_IDS } from '../config/powers';
import { PowerRuntime, type PowerTrigger } from '../core/powers';
import { ITEM_IDS, STARTER_EVOLUTIONS } from '../config/progression';
import { getMeta, type StarterId } from '../state/metaStore';
import { isStarterAtFinalEvolution, MEGA_STARTER_FORMS } from '../core/permanentItems';
import type { BalanceMatchSummary } from '../core/balanceLab';

type MatchState = 'drop' | 'live' | 'goal' | 'over';

/** Legacy dev data (pre-campaign): pick an opponent by index. */
interface GameData {
  opponentIndex?: number;
}

/** Campaign data: an explicit roster, opponent and run-driven AI level. */
export interface MatchConfig {
  userTeam: Team;
  opponent: Team;
  level: number;
  towerFloor?: number;
  tournament?: boolean;
  /** Balance Lab matches bypass campaign progression and return metrics to the lab. */
  testMode?: boolean;
  powerIds?: string[];
  /** Balance Lab-only permanent item toggles. They never touch the campaign save. */
  testItemIds?: string[];
  /** Synthetic final-form starter used to exercise Mega Evolution in Balance Lab. */
  testStarter?: StarterId | null;
  testRetryUsed?: boolean;
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  private controls!: Controls;
  private players: Player[] = [];
  private puck!: Puck;
  private score: [number, number] = [0, 0];
  private state: MatchState = 'drop';
  private stateTimer = 0;
  private controlled: Player | null = null;
  private aimG!: Phaser.GameObjects.Graphics; // shot-aim reticle + guide
  private pressG!: Phaser.GameObjects.Graphics; // possession-pressure contact lines + the defender's pressure ring
  private puckHist: Array<{ t: number; pos: Vec2 }> = []; // recent puck positions (the goalie's positioning lags behind them)
  private trailTick = 0;
  private clock = 0; // seconds of live play
  private oneTimerArmed: { player: Player; until: number } | null = null; // a Shoot press made inside the one-timer window
  private manualPick: Player | null = null; // defender the user picked with SPACE (sticks until possession changes)
  private diff: Difficulty = difficultyAt(DEFAULT_LEVEL);
  private opponentIdx = 0;
  private oppTeam: Team = OPPONENTS[0];
  private userTeam: Team = USER_TEAM;
  private campaign = false;
  private towerFloor: number | undefined;
  private tournament = false;
  private testMode = false;
  private powerIds: string[] = [];
  private testItemIds: string[] = [];
  private testStarter: StarterId | null = null;
  private testRetryUsed = false;
  private powerRuntime = new PowerRuntime(POWER_DEFINITIONS, []);
  private balanceMetrics = { shots: 0, passes: 0, jukes: 0, parries: 0, checks: 0, checkHits: 0, goalsFor: 0, goalsAgainst: 0 };
  private pauseOverlay: PauseOverlay | null = null;
  private scoreText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private megaHud: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } | null = null;
  private megaOriginal: { player: Player; name: string; sprite: number; stats: HockeyStats } | null = null;
  /** A match may activate Mega Evolution once. A goal reverts the form but does not refund the use. */
  private megaUsedThisMatch = false;

  init(data?: MatchConfig | GameData): void {
    this.resetMatchState();
    if (data && 'userTeam' in data) {
      // Campaign match: explicit roster, opponent and AI level.
      const c = data as MatchConfig;
      this.userTeam = c.userTeam;
      this.oppTeam = c.opponent;
      this.diff = difficultyAt(c.level);
      this.towerFloor = c.towerFloor;
      this.tournament = c.tournament === true;
      this.testMode = c.testMode === true;
      this.powerIds = c.powerIds ?? (this.testMode ? [] : DEFAULT_CAMPAIGN_POWER_IDS);
      this.testItemIds = c.testItemIds ?? [];
      this.testStarter = c.testStarter ?? null;
      this.testRetryUsed = c.testRetryUsed === true;
      this.powerRuntime = new PowerRuntime(POWER_DEFINITIONS, this.powerIds);
      this.campaign = !this.testMode;
    } else {
      // Dev mode (and the sim test, which skips init entirely): index + URL knobs.
      const g = data as GameData | undefined;
      this.opponentIdx = g?.opponentIndex ?? readOpponentParam();
      this.diff = difficultyAt(readLevelParam());
    }
  }

  /**
   * Phaser creates ONE instance of each scene and re-runs init()/create() on every
   * scene.start() — class-field initialisers only run once, so per-match state has to be
   * reset here or it leaks into the next match (a 3–1 win used to carry its score over and
   * end the next match on the first goal).
   */
  private resetMatchState(): void {
    this.score = [0, 0];
    this.state = 'drop';
    this.stateTimer = 0;
    this.clock = 0;
    this.trailTick = 0;
    this.controlled = null;
    this.manualPick = null;
    this.oneTimerArmed = null;
    this.pauseOverlay = null;
    this.megaHud = null;
    this.megaOriginal = null;
    this.megaUsedThisMatch = false;
    this.campaign = false;
    this.towerFloor = undefined;
    this.tournament = false;
    this.testMode = false;
    this.powerIds = [];
    this.testItemIds = [];
    this.testStarter = null;
    this.testRetryUsed = false;
    this.powerRuntime = new PowerRuntime(POWER_DEFINITIONS, []);
    this.balanceMetrics = { shots: 0, passes: 0, jukes: 0, parries: 0, checks: 0, checkHits: 0, goalsFor: 0, goalsAgainst: 0 };
  }

  create(): void {
    wireShutdown(this);
    drawRink(this);

    if (!this.campaign && !this.testMode) this.oppTeam = OPPONENTS[this.opponentIdx] ?? OPPONENTS[0];
    this.players = [];
    this.userTeam.players.forEach((pd, i) => this.players.push(this.makePlayer(this.userTeam, 0, i, pd)));
    this.oppTeam.players.forEach((pd, i) => this.players.push(this.makePlayer(this.oppTeam, 1, i, pd)));

    this.puck = new Puck(this, CENTER_X, CENTER_Y);
    this.controls = new Controls(this);
    if (this.campaign) beginCareerMatch(this.userTeam.name, getMeta().seasonYear, this.userTeam.players.map(p => ({ name: p.name, sprite: p.sprite, isStarter: p.isStarter, goalie: p.goalie })));

    this.scoreText = this.add
      .text(CENTER_X, 14, '', { fontFamily: 'monospace', fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5);
    this.bannerText = this.add
      .text(CENTER_X, CENTER_Y, '', {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: '#ffd166',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hintText = this.add
      .text(CENTER_X, CENTER_Y + 64, '', { fontFamily: 'monospace', fontSize: '16px', color: '#8b98ab' })
      .setOrigin(0.5)
      .setAlpha(0);
    if (this.canMegaEvolve()) {
      const bg = this.add.rectangle(GAME_WIDTH - 120, 39, 220, 32, 0x0b1c2b, 0.96)
        .setStrokeStyle(2, 0xffd166).setInteractive({ useHandCursor: true }).setDepth(40);
      const label = this.add.text(GAME_WIDTH - 120, 39, 'MEGA EVOLVE  [M]', { fontFamily: 'monospace', fontSize: '13px', color: '#ffd166', fontStyle: 'bold' }).setOrigin(.5).setDepth(41);
      bg.on('pointerdown', () => this.activateMegaEvolution());
      label.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.activateMegaEvolution());
      this.megaHud = { bg, label };
    }
    this.add
      .text(CENTER_X, GAME_HEIGHT - 12,
        'Arrows move · SPACE pass / switch · SHIFT = shoot / check · E / F = Juke / Counter · ' +
          (this.campaign ? 'ESC pause' : this.testMode ? 'ENTER results / retry' : 'R restart'),
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#8b98ab',
          align: 'center',
        })
      .setOrigin(0.5, 1);

    this.input.keyboard!.on('keydown-R', () => {
      if (!this.campaign && !this.testMode && this.state === 'over') this.restart();
    });
    this.input.keyboard!.on('keydown-SPACE', () => {
      if (this.testMode && this.state === 'over' && this.canUseTestRetry()) this.toBalanceLab();
    });
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (this.state !== 'over') return;
      if (this.testMode) this.finishTestMatch();
      else if (this.campaign) this.toResult();
      else this.restart();
    });
    // ESC toggles the pause overlay. This handler is the ONLY place that binds ESC
    // for pausing — the overlay and any open ConfirmDialog must not also bind ESC,
    // or two listeners would fire in one dispatch and cancel each other.
    this.input.keyboard!.on('keydown-M', () => {
      if (this.pauseOverlay?.visible || this.state === 'over') return;
      this.activateMegaEvolution();
    });
    this.input.keyboard!.on('keydown-ESC', () => {
      if ((!this.campaign && !this.testMode) || this.state === 'over' || !this.pauseOverlay) return;
      if (this.pauseOverlay.dialogOpen) return; // dialog owns ESC (it cancels)
      if (this.pauseOverlay.visible) this.pauseOverlay.handleEscape();
      else this.pauseOverlay.show();
    });
    if (this.campaign || this.testMode) {
      this.pauseOverlay = new PauseOverlay(
        this,
        this.oppTeam.name,
        this.userTeam,
        this.powerIds,
        this.campaign,
        () => this.pauseOverlay?.hide(),
        () => this.campaign ? this.endRun('GameOverScene', { reason: 'forfeit' }) : this.scene.start('BalanceLabScene'),
        () => this.campaign ? this.endRun('TitleScene') : this.scene.start('BalanceLabScene'),
        this.testItemIds,
      );
    }

    this.aimG = this.add.graphics().setDepth(18);
    this.pressG = this.add.graphics().setDepth(14);
    this.updateScoreText(); // show 0 — 0 at kickoff (it used to stay blank until the first goal)
    this.setState('drop');
  }

  update(time: number, dtMs: number): void {
    if (this.pauseOverlay?.visible) return; // paused: freeze the match
    const dt = Math.min(dtMs / 1000, 0.05);

    if (this.state === 'drop') {
      this.stateTimer -= dt;
      for (const p of this.players) {
        const d = sub(p.home, p.pos);
        if (len(d) > 4) p.applyInput(norm(d), dt);
        else p.coast(dt);
        p.update(dt, this.puck.pos);
      }
      this.puck.update(dt);
      if (this.stateTimer <= 0) this.setState('live');
      return;
    }

    if (this.state === 'goal') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.score[0] >= GOALS_TO_WIN || this.score[1] >= GOALS_TO_WIN) this.setState('over');
        else this.setState('drop');
      }
      return;
    }

    if (this.state === 'over') return;

    this.updateLive(time, dt);
  }

  // ---------- live play ----------

  private updateLive(time: number, dt: number): void {
    this.clock += dt;
    // 1. Who does the user control: the carrier on offense; on defense keep the
    //    current living skater until SPACE explicitly cycles defenders. Only choose
    //    the nearest skater automatically when there is no valid current defender.
    const userCarrier = this.players.find((p) => p.team === 0 && p.carrying) ?? null;
    let desired: Player | null = userCarrier;
    if (userCarrier) {
      this.manualPick = null;
    } else {
      // Keep SPACE cycling order stable by lineup/slot, not by distance to the puck.
      // If players are moving, a distance-sorted list can reorder between frames and make
      // the same key press jump to a seemingly random defender.
      const field = this.players.filter((p) => p.team === 0 && !p.isGoalie && !p.down).sort((a, b) => a.slot - b.slot);
      const nearest = [...field].sort((a, b) => dist(a.pos, this.puck.pos) - dist(b.pos, this.puck.pos));
      if (this.controls.justPressed('pass') && field.length) {
        const cur = this.controlled ? field.indexOf(this.controlled) : -1;
        this.manualPick = field[(cur + 1) % field.length];
      }
      if (this.manualPick && (this.manualPick.down || this.manualPick.team !== 0 || this.manualPick.isGoalie)) this.manualPick = null;
      const currentIsValid = !!this.controlled && this.controlled.team === 0 && !this.controlled.isGoalie && !this.controlled.down;
      desired = this.manualPick ?? (currentIsValid ? this.controlled : null) ?? nearest[0] ?? null;
    }
    if (desired && desired !== this.controlled) {
      this.controlled?.setControlled(false);
      this.controlled = desired;
      desired.setControlled(true);
    }

    // 2. User input on the controlled player.
    if (this.controlled) {
      const c = this.controlled;
      const dir = this.controls.direction();
      const committed = !!c.move && !c.moveResolved; // winding up a juke
      // Charging a shot locks you onto the goal: Up/Down slides the aim along the
      // goal mouth instead of skating you up/down; Left/Right still skate (slower).
      const wantsCharge = c.carrying && this.controls.held('shoot') && !committed && c.stagger <= 0;
      // Same lock once a one-timer is ARMED: Up/Down picks the corner instead of skating you off the pass.
      const armedOneTimer = this.oneTimerArmed?.player === c && !c.carrying;
      let moveDir = dir;
      let moveFactor = 1;
      if (wantsCharge || armedOneTimer) {
        moveDir = dir.x ? v(Math.sign(dir.x), 0) : v();
        moveFactor = CHARGE_SKATE;
      }
      if (c.stagger > 0) c.coast(dt);
      else if (committed) {
        // Mid-tell you can still shuffle (reduced control) — and where you
        // point at the end of the tell is where the dash goes.
        if (dir.x || dir.y) {
          c.applyInput(dir, dt, TELL_STEER);
          // Deke goes toward the open side by default; UP / DOWN during the wind-up overrides it (absolute screen direction).
          if (c.move === 'deke') {
            const want = verticalFromStick(norm(dir));
            if (want) {
              const ax = dekeAxis(c.team, want);
              c.moveBase = ax.base;
              c.moveSide = ax.side;
            }
          }
        } else c.coast(dt);
      } else if (moveDir.x || moveDir.y) c.applyInput(moveDir, dt, moveFactor);
      else c.coast(dt);

      if (c.carrying && c.receivedByPass && c.sinceReceive <= ONE_TIMER_GRACE && !committed && this.controls.justPressed('shoot')) {
        // ONE-TIMER (press just after catching the pass): fires instantly, aimed by the held Up/Down.
        this.fireOneTimer(c, clamp(dir.y, -1, 1));
      } else if (c.carrying) {
        // Offense: pass, charge-shot (release inside the window = perfect), juke (E/F).
        if (this.controls.justPressed('pass') && !committed) this.userPass(c);
        if (wantsCharge) {
          if (!c.charging) {
            c.charging = true;
            c.holdT = 0;
            c.aimY = 0;
          }
          c.holdT += dt;
          c.charge = chargeFromHold(c.holdT);
          c.aimY = clamp(c.aimY + dir.y * AIM_SLIDE_SPEED * dt, -1, 1);
          // Lock the stick onto the aim point.
          const gx = c.team === 0 ? ICE_X + RINK_W : ICE_X;
          const target = Math.atan2(aimTargetY(c.aimY) - c.pos.y, gx - c.pos.x);
          let diff = target - c.facing;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          c.facing += diff * Math.min(1, dt * 14);
        } else if (c.charging || c.charge > 0) {
          this.shootPuck(c, c.aimY, c.charge);
          c.charging = false;
          c.charge = 0;
          c.holdT = 0;
          c.aimY = 0;
        }
        for (const id of ALL_MOVES) {
          if (!c.move && this.controls.justPressed(id)) c.startMove(id, 1, nearestThreat(c, this.players));
        }
      } else {
        // Defense: check (Shift/Enter), parry (E/F = the move's key).
        if (c.charging) {
          c.charging = false;
          c.charge = 0;
          c.holdT = 0;
        }
        const pressed = this.controls.justPressed('shoot');
        const inc = this.incomingPass(c);
        if (inc) {
          // A pass is on its way to ME: Shoot arms a one-timer (it never plants a check).
          if (pressed && inc.eta <= ONE_TIMER_LEAD) {
            this.oneTimerArmed = { player: c, until: this.clock + ONE_TIMER_LEAD + 0.3 };
          }
        } else if (pressed) this.doCheck(c);
        for (const id of ALL_MOVES) {
          if (this.controls.justPressed(id)) this.tryParry(c, id);
        }
      }

      // Perfect-shot cue: the enemy goalie shows a shrinking ring + the release window
      // (same grammar as a juke tell), and flashes SHOOT! while the window is open.
      for (const p of this.players) p.shotCue = null;
      const eg = this.players.find((p) => p.team === 1 && p.isGoalie);
      if (eg && c.carrying && c.charging) {
        const { open, close } = perfectWindowHold();
        const superShotOwned = this.hasItem(ITEM_IDS.superShot);
        const superWindow = superShotWindowHold();
        const superTiming = superShotOwned && isSuperShotHold(c.holdT);
        eg.shotCue = {
          progress: Math.min(1, c.holdT / close),
          openAt: superShotOwned ? superWindow.open / close : open / close,
          inWindow: c.charge >= PERFECT_SHOT_CHARGE,
          label: superTiming ? 'SUPER SHOT!' : undefined,
          color: superTiming ? 0xffd166 : undefined,
        };
      }
      // One-timer cue on the RECEIVER: a ring shrinks as the pass arrives; white = shoot now.
      const ringOpen = 1 - ONE_TIMER_LEAD / ONE_TIMER_RING_TIME;
      const inc2 = c.carrying ? null : this.incomingPass(c);
      if (inc2) {
        c.shotCue = {
          progress: clamp(1 - inc2.eta / ONE_TIMER_RING_TIME, 0, 1),
          openAt: ringOpen,
          inWindow: inc2.eta <= ONE_TIMER_LEAD,
          label: 'ONE-TIMER!',
          color: 0x7bdff2,
        };
      } else if (c.carrying && c.receivedByPass && c.sinceReceive <= ONE_TIMER_GRACE) {
        c.shotCue = { progress: 1, openAt: ringOpen, inWindow: true, label: 'ONE-TIMER!', color: 0x7bdff2 };
      }
      this.drawAim(c, dir.y);
    } else {
      this.aimG.clear();
      for (const p of this.players) p.shotCue = null;
    }

    // A goalie that has been FOOLED by a landed move says so (the shooter's snap-shot window).
    for (const gk of this.players) {
      if (!gk.isGoalie || gk.fooledT <= 0 || gk.foolSpent) continue;
      const mine = gk.team === 1; // the user's shot at it
      gk.shotCue = {
        progress: clamp(1 - gk.fooledT / GOALIE_FOOL_TIME, 0, 1),
        openAt: 0,
        inWindow: true,
        label: mine ? 'OPEN!' : 'BEATEN!',
        color: mine ? 0xffd60a : 0xff6b6b,
      };
    }

    // 3. AI: one chaser per team; everyone else zones / carries / goalies.
    const chaserOf: Array<Player | null> = [null, null];
    if (this.puck.state === 'loose') {
      for (const t of [0, 1] as const) {
        let best: Player | null = null;
        let bd = Infinity;
        for (const p of this.players) {
          if (p.team !== t || p.isGoalie || p.down || p === this.controlled) continue;
          const d = dist(p.pos, this.puck.pos);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        chaserOf[t] = best;
      }
    }
    const world: AIWorld = {
      players: this.players,
      puck: this.puck,
      dt,
      time,
      rng: Math.random,
      diff: this.diff,
      pass: (f, m) => this.doPass(f, m),
      shoot: (f, aimY, charge) => this.shootPuck(f, aimY, charge),
      parry: (d, _carrier, key) => this.tryParry(d, key),
      check: (d) => this.doCheck(d),
      puckAt: (lag) => this.puckAt(lag),
    };

    // Tell hints: when the user is DEFENDING, the opposing carrier's tell shows
    // the user's actual parry window (and, at low levels, the key to press).
    for (const p of this.players) p.tellHint = null;
    const oppCarrier = this.players.find((p) => p.team === 1 && p.carrying);
    if (!userCarrier && oppCarrier?.move && this.controlled) {
      oppCarrier.tellHint = {
        window: windowSeconds(oppCarrier.tellDur, this.controlled.stats.parryFrac),
        // Always show the counter key: at high difficulty the tell is faster, so hiding
        // the letter made the same colour grammar unnecessarily hard to read.
        showKey: true,
        inCone: inFrontCone(oppCarrier.facing, oppCarrier.pos, this.controlled.pos, PARRY_CONE_HALF),
      };
    }

    for (const p of this.players) {
      p.aiChase = p === chaserOf[0] || p === chaserOf[1];
      // Difficulty slows opposing SKATERS; goalies keep (nearly) full speed — a slowed goalie just gives the net away.
      p.speedScale = p.isGoalie ? (p.team === 1 ? this.diff.aiGoalieSpeed : 1) : p.team === 1 ? this.diff.aiSpeed : AI_SPEED_FACTOR;
      p.powerSpeedScale = this.powerRuntime.statMultiplier(this.actorKey(p), 'speed', this.clock);
      if (p !== this.controlled) stepAI(p, world);
      p.update(dt, this.puck.pos);
    }

    // A check that was already up when a juke's tell began is a WALL and holds through the whole
    // wind-up (the defender stays rooted — that's the price). One thrown later than that can't stuff it.
    for (const p of this.players) {
      if (!p.move || p.moveResolved) continue;
      const startedAt = this.clock - p.moveT;
      for (const o of this.players) {
        if (o.team === p.team || o.guardT <= 0 || o.down || o.guardStart > startedAt + CHECK_PREPLANT_GRACE) continue;
        if (dist(o.pos, p.pos) <= o.stuffRange()) o.guardT = Math.max(o.guardT, p.tellDur - p.moveT + 0.05);
      }
    }

    // A juke's tell ends → apply its effect (if it wasn't parried away).
    for (const p of this.players) {
      if (p.move && !p.moveResolved && p.moveT >= p.tellDur) {
        p.moveResolved = true;
        this.finishMove(p);
      }
    }
    // Speed lines while a landed move's burst plays out.
    for (const p of this.players) {
      if (p.move && p.moveResolved && p.moveT < p.tellDur + p.effectDur) this.trail(p);
    }

    // 4. Puck: physics, pickups, goalie saves, body separation.
    this.puck.update(dt);
    this.puckHist.push({ t: this.clock, pos: v(this.puck.pos.x, this.puck.pos.y) });
    while (this.puckHist.length > 2 && this.puckHist[0].t < this.clock - 0.8) this.puckHist.shift();
    this.tryPickup();
    this.goalieSaves();
    this.applyGuards();
    this.separate();
    this.updatePressure(dt);
    this.drawPressure();

    if (this.puck.scoredBy !== null) this.onGoal(this.puck.scoredBy);
  }

  /** Where the puck was `lag` seconds ago (goalies position off this, so a fast sidestep catches them leaning). */
  private puckAt(lag: number): Vec2 {
    const want = this.clock - lag;
    for (let i = this.puckHist.length - 1; i >= 0; i--) if (this.puckHist[i].t <= want) return this.puckHist[i].pos;
    return this.puckHist[0]?.pos ?? this.puck.pos;
  }

  private goalieOf(team: 0 | 1): Player | undefined {
    return this.players.find((p) => p.team === team && p.isGoalie);
  }

  /**
   * Possession pressure: a carrier with an opposing skater on top of them loses the puck over
   * ~1.6s unless they do something (pass / shoot / juke reset it). Checks add to it.
   */
  private updatePressure(dt: number): void {
    const carrier = this.puck.state === 'carried' ? this.puck.carriedBy : null;
    for (const p of this.players) {
      if (p !== carrier) {
        p.pressure = 0;
        p.pressers = [];
      }
    }
    if (!carrier || carrier.isGoalie || carrier.down) {
      if (carrier) {
        carrier.pressure = 0;
        carrier.pressers = [];
      }
      this.puck.setPressure(0);
      return;
    }
    // Starting a move is not itself an escape from pressure. If the move is stuffed
    // or parried, the pressure remains and can still strip the puck. A landed move
    // creates separation naturally as defenders are staggered/knocked out of range.
    const face = v(Math.cos(carrier.facing), Math.sin(carrier.facing));
    const near = this.players
      .filter((o) => o.team !== carrier.team && !o.isGoalie && !o.down && o.stagger <= 0 && dist(o.pos, carrier.pos) <= PRESSURE_RANGE)
      .sort((a, b) => dist(a.pos, carrier.pos) - dist(b.pos, carrier.pos));
    const info: Presser[] = near.map((o) => ({ front: dot(norm(sub(o.pos, carrier.pos)), face) > -0.2 }));
    const scaleBy = carrier.team === 0 ? this.diff.aiPressure : 1; // forgiving at low levels when the AI presses YOU
    carrier.pressers = near;
    carrier.pressure = stepPressure(carrier.pressure, info, carrier.stagger > 0, scaleBy, dt);
    this.puck.setPressure(carrier.pressure);
    if (carrier.pressure >= 1 && near.length) this.stripPuck(carrier, near[0]);
  }

  /** Pressure maxed out: the puck pops off the blade toward the presser, who gets first touch. */
  private stripPuck(carrier: Player, presser: Player): void {
    const dir = norm(sub(presser.pos, carrier.pos));
    this.puck.launch(dir, PRESSURE_STRIP_SPEED, carrier);
    carrier.pickupCooldown = Math.max(carrier.pickupCooldown, PRESSURE_LOCKOUT);
    carrier.pressure = 0;
    carrier.pressers = [];
    carrier.move = null;
    carrier.moveResolved = true;
    carrier.dashDir = null;
    carrier.charging = false;
    carrier.charge = 0;
    carrier.holdT = 0;
    this.puck.setPressure(0);
    this.popup('STRIPPED!', carrier.pos, '#ff6b6b', 24);
  }

  /** Contact lines from each presser to the carrier + the controlled defender's pressure ring. */
  private drawPressure(): void {
    const g = this.pressG;
    g.clear();
    const carrier = this.puck.state === 'carried' ? this.puck.carriedBy : null;
    if (!carrier) return;
    const pr = carrier.pressure;
    if (pr > 0.04) {
      for (const o of carrier.pressers) {
        g.lineStyle(2 + 2 * pr, 0xff6b6b, 0.18 + 0.5 * pr);
        g.lineBetween(o.pos.x, o.pos.y, carrier.pos.x, carrier.pos.y);
      }
    }
    // The user DEFENDING: a faint ring showing how close you need to stay to build pressure.
    if (this.controlled && this.controlled.team !== carrier.team && !carrier.isGoalie) {
      const near = dist(this.controlled.pos, carrier.pos) <= PRESSURE_RANGE;
      g.lineStyle(2, near ? 0xff6b6b : 0xffffff, near ? 0.45 : 0.14);
      g.strokeCircle(this.controlled.pos.x, this.controlled.pos.y, PRESSURE_RANGE);
    }
  }

  private tryPickup(): void {
    if (this.puck.state !== 'loose') return;
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.down || p.pickupCooldown > 0) continue;
      const reach = p.isGoalie ? PICKUP_RADIUS + 6 : PICKUP_RADIUS;
      const d = dist(p.pos, this.puck.pos);
      if (d <= reach && d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return;
    // An armed one-timer doesn't need a clean catch: the swing redirects it.
    if (this.oneTimerArmed?.player === best && this.puck.pass?.to === best) {
      this.grantPuck(best);
      return;
    }
    const sp = len(this.puck.vel);
    if (sp < FAST_PUCK_SPEED) {
      // Slow puck: it's yours.
      this.grantPuck(best);
      return;
    }
    // Fast puck (shot / hard pass): a skill contest. A puck moving faster
    // than the grabber can handle can fly past a flailing stick.
    if (best.whiffCooldown > 0) return; // already flailed at this puck
    const chance = clamp(0.9 + 0.5 * best.stats.puckSense - (sp - FAST_PUCK_SPEED) / 700, 0.12, 0.95);
    if (Math.random() < chance) this.grantPuck(best);
    else best.whiffCooldown = 0.45;
  }

  private grantPuck(p: Player): void {
    const wasUserPossession = this.puck.state === 'carried' && this.puck.carriedBy?.team === 0;
    const pass = this.puck.pass;
    const viaPass = !!pass && pass.to === p && pass.from.team === p.team;
    this.puck.give(p);
    this.puck.lastPasser = viaPass ? pass!.from : null;
    p.pressure = 0;
    p.pressers = [];
    p.pickupCooldown = PICKUP_DELAY;
    this.puck.lastTaker = p;
    p.receivedByPass = viaPass;
    if (p.team === 0 && !wasUserPossession) this.emitPowerEvent('possessionGained', p);
    p.sinceReceive = 0;
    const armed = this.oneTimerArmed;
    if (armed && armed.player !== p) this.oneTimerArmed = null; // someone else got it
    if (!viaPass) return;
    if (armed && armed.player === p && this.clock <= armed.until) {
      // The shot leaves the instant the puck touches the blade.
      this.fireOneTimer(p, p === this.controlled ? clamp(this.controls.direction().y, -1, 1) : 0);
    } else if (p !== this.controlled && !p.isGoalie) {
      // AI receivers one-time it sometimes, if they're in range.
      const goalX = p.team === 0 ? ICE_X + RINK_W : ICE_X;
      if (Math.abs(p.pos.x - goalX) < SHOT_RANGE + 80 && Math.random() < this.diff.aiOneTimerRate) {
        this.fireOneTimer(p, (Math.random() * 2 - 1) * this.diff.aiShotSpread);
      }
    }
  }

  private goalieSaves(): void {
    if (this.puck.state !== 'loose') return;
    const sp = len(this.puck.vel);
    if (sp < 140) return;
    for (const g of this.players) {
      if (!g.isGoalie || g.saveCooldown > 0) continue;
      const d = dist(g.pos, this.puck.pos);
      if (d > GOALIE_SAVE_RADIUS) continue;
      const goalX = g.team === 0 ? ICE_X : ICE_X + RINK_W;
      if (Math.sign(goalX - this.puck.pos.x) !== Math.sign(this.puck.vel.x)) continue;
      // Stat-driven base save: SpD (puckSense) vs. shot speed.
      const saveChance = 0.15 + 0.7 * g.stats.puckSense - 0.12 * (sp / SHOT_SPEED_MAX);
      if (Math.random() > saveChance) continue; // shot beats the save
      g.saveCooldown = GOALIE_SAVE_COOLDOWN;
      g.stickSwing = 0.3;
      const out = norm(
        v(CENTER_X - this.puck.pos.x, CENTER_Y - this.puck.pos.y + (Math.random() - 0.5) * 240),
      );
      this.puck.vel = scale(out, GOALIE_SAVE_DEFLECT_SPEED);
      g.pickupCooldown = 0.35; // beat before the breakout — user gets the pass
    }
  }

  private separate(): void {
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        if (a.down || b.down) continue; // players on the ice don't block
        // A dashing carrier slips past the defender it just juked (who is stunned).
        if ((a.dashing && b.team !== a.team && b.stagger > 0) || (b.dashing && a.team !== b.team && a.stagger > 0)) continue;
        const d = dist(a.pos, b.pos);
        const min = a.radius() + b.radius() - 2;
        if (d > 1e-3 && d < min) {
          const n = norm(sub(b.pos, a.pos));
          // A planted (checking) player is a wall: the other body gives way.
          const wa = a.guardT > 0 ? 0 : 1;
          const wb = b.guardT > 0 ? 0 : 1;
          const tot = wa + wb || 2;
          const push = min - d;
          const ka = (wa || (wb ? 0 : 1)) / tot;
          const kb = (wb || (wa ? 0 : 1)) / tot;
          a.pos = v(a.pos.x - n.x * push * ka, a.pos.y - n.y * push * ka);
          b.pos = v(b.pos.x + n.x * push * kb, b.pos.y + n.y * push * kb);
        }
      }
    }
  }

  /**
   * Check = a wall. Opponents inside a planted player's check radius are pushed
   * out to its edge and lose their velocity into it — "blocks forward progress".
   */
  private applyGuards(): void {
    for (const g of this.players) {
      if (g.guardT <= 0 || g.down) continue;
      const R = g.guardRadius();
      for (const o of this.players) {
        if (o.team === g.team || o.isGoalie || o.down) continue;
        const off = sub(o.pos, g.pos);
        const d = len(off);
        if (d >= R) continue;
        const n = d > 1e-3 ? scale(off, 1 / d) : v(g.team === 0 ? 1 : -1, 0);
        o.pos = add(g.pos, scale(n, R));
        const into = dot(o.vel, n);
        if (into < 0) o.vel = sub(o.vel, scale(n, into));
        // Running into a planted defender costs you (unless you're mid-move: that's parry/stuff territory).
        if (into < -CHECK_RUNIN_MIN && !o.move) this.checkHit(g, o, -into);
      }
    }
  }

  // ---------- actions ----------

  private userPass(c: Player): void {
    const dirIn = this.controls.direction();
    const aim = dirIn.x || dirIn.y ? dirIn : v(Math.cos(c.facing), Math.sin(c.facing));
    const mates = this.players.filter((p) => p.team === c.team && !p.isGoalie && !p.down && p !== c);
    if (!mates.length) return;
    // Always pass: best teammate by aim alignment minus a soft distance
    // penalty. No threshold — a teammate ahead of you is always an option.
    let best = mates[0];
    let bestScore = -Infinity;
    for (const m of mates) {
      const d = dist(c.pos, m.pos);
      if (d < 24) continue;
      const to = norm(sub(m.pos, c.pos));
      const score = aim.x * to.x + aim.y * to.y - d / 900;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    this.doPass(c, best);
  }

  private doPass(from: Player, to: Player): void {
    if (from.team === 0) this.balanceMetrics.passes++;
    // Lead the pass: aim at where the receiver is skating, not where they are.
    const speed = PASS_SPEED * from.stats.passPower * this.powerRuntime.statMultiplier(this.actorKey(from), 'passPower', this.clock) * this.powerRuntime.consumeActionMultiplier(this.actorKey(from), 'pass');
    const d = dist(from.pos, to.pos);
    const flight = (d / speed) * 0.75;
    const lead = v(to.pos.x + to.vel.x * flight, to.pos.y + to.vel.y * flight);
    this.puck.launch(norm(sub(lead, from.pos)), speed, from);
    this.puck.lastPasser = null; // only credit the pass if a teammate actually receives it
    this.puck.pass = { from, to }; // in flight: lets the receiver time a one-timer
    if (from.team === 0) this.emitPowerEvent('passComplete', from);
    // Control follows the pass: you become the receiver (so you can one-time it).
    if (from.team === 0 && !to.isGoalie) this.manualPick = to;
    from.pickupCooldown = Math.max(from.pickupCooldown, 0.25);
  }

  /** A pass to `c` that is still in flight and heading at them (eta = seconds until it reaches their stick). */
  private incomingPass(c: Player): { eta: number } | null {
    const pa = this.puck.pass;
    if (!pa || pa.to !== c || this.puck.state !== 'loose') return null;
    const sp = len(this.puck.vel);
    if (sp < 120) return null;
    const to = sub(c.pos, this.puck.pos);
    if (dot(this.puck.vel, to) <= 0) return null; // already past / not heading at them
    return { eta: Math.max(0, (len(to) - PICKUP_RADIUS) / sp) };
  }

  /** Instant, full-power shot (no wind-up). The goalie reads it late (puck.quick). */
  private fireOneTimer(p: Player, aimY: number): void {
    p.receivedByPass = false;
    this.oneTimerArmed = null;
    this.shootPuck(p, aimY, 1, true);
  }

  /**
   * Shoot at a point on the goal mouth (`aimY` −1 top post … +1 bottom post;
   * beyond ±1 is wide — only the AI does that). See core/shot.ts.
   */
  private shootPuck(from: Player, aimY: number, charge: number, quick = false): void {
    if (from.team === 0) this.balanceMetrics.shots++;
    const goalX = from.team === 0 ? ICE_X + RINK_W : ICE_X;
    // Aim from where the PUCK is (it sits on the blade, off to one side of the
    // player) — aiming from the player's centre put full-corner shots on the post.
    const origin = this.puck.state === 'carried' && this.puck.carriedBy === from ? this.puck.pos : from.pos;
    const aim = shotDirection(origin, goalX, aimY);
    // Perfect shot: release with charge in the perfect window (the goalie's
    // ring/flash is the tell) → bonus power and a “!” over the shooter.
    // A goalie fooled by a juke can't read the next shot: it leaves as a snap shot (consumes the window).
    const eg = this.goalieOf(from.team === 0 ? 1 : 0);
    const fooled = !quick && !!eg && eg.fooledT > 0 && !eg.foolSpent;
    if (fooled && eg) {
      eg.foolSpent = true; // one shot per window…
      eg.fooledT = Math.max(eg.fooledT, GOALIE_FOOL_TIME); // …and the goalie stays beaten until that shot has arrived
      charge = Math.max(charge, GOALIE_FOOL_MIN_CHARGE);
    }
    const perfect = !quick && !fooled && from === this.controlled && charge >= PERFECT_SHOT_CHARGE;
    const superShot = this.hasItem(ITEM_IDS.superShot) && !quick && !fooled && from === this.controlled && isSuperShotHold(from.holdT);
    const shotMultiplier = quick ? ONE_TIMER_MULT : superShot ? SUPER_SHOT_MULT : perfect ? PERFECT_SHOT_MULT : 1;
    const speed =
      (SHOT_SPEED_MIN + (SHOT_SPEED_MAX - SHOT_SPEED_MIN) * charge) *
      from.stats.shotPower * this.powerRuntime.statMultiplier(this.actorKey(from), 'shotPower', this.clock) * this.powerRuntime.consumeActionMultiplier(this.actorKey(from), 'shot') * shotMultiplier;
    this.puck.launch(aim, speed, from);
    if (from.team === 0) this.emitPowerEvent('shotTaken', from);
    this.puck.quick = quick || fooled; // the goalie reads it late either way
    from.stickSwing = 0.3;
    from.pickupCooldown = Math.max(from.pickupCooldown, 0.15);
    if (superShot) this.popup('SUPER SHOT!', from.pos, '#ffd166', 26);
    else if (perfect) this.popup('!', from.pos, '#ffffff');
    if (quick) this.popup('ONE-TIMER!', from.pos, '#7bdff2', 24);
    if (fooled) this.popup('SNAP SHOT!', from.pos, '#ffd60a', 24);
  }

  // ---------- juke moves & defense (parry layer) ----------

  /**
   * Defender attempts to parry the enemy carrier's active tell.
   * Matching key inside the window → steal + counter-burst; early/late/wrong
   * key → whiff stagger (with a popup saying WHY, so you can learn the timing).
   * Pressing with no active tell = harmless stick tap.
   */
  private tryParry(d: Player, id: MoveId): void {
    if (d.stagger > 0 || d.guardT > 0 || d.down) return;
    const carrier = this.puck.state === 'carried' ? this.puck.carriedBy : null;
    if (!carrier || carrier.team === d.team || !carrier.move || dist(d.pos, carrier.pos) > PARRY_RANGE) {
      // Harmless stick tap (no tell to react to); tiny cooldown vs. mash.
      d.stickSwing = 0.25;
      d.moveCd = Math.max(d.moveCd, 0.3);
      return;
    }
    // A parry only counts from IN FRONT of the carrier (the cone is drawn on the tell).
    if (!inFrontCone(carrier.facing, carrier.pos, d.pos, PARRY_CONE_HALF)) {
      d.whiff();
      this.popup('NOT IN FRONT', d.pos, '#ff9e9e', 18);
      return;
    }
    const timing = parryTiming(carrier.tellDur, carrier.moveT, d.stats.parryFrac);
    if (id === carrier.move && timing === 'success') {
      if (d.team === 0) { this.balanceMetrics.parries++; this.emitPowerEvent('parrySuccess', d); }
      // PARRY! Cancel the carrier's move (no effect), steal, counter-attack.
      carrier.move = null;
      carrier.moveResolved = true;
      if (d.team === 0 && this.hasItem(ITEM_IDS.superParry)) {
        this.knockDown(carrier, 'SUPER PARRY!');
      } else {
        carrier.tumble = 0.4;
        carrier.stagger = 0.3;
      }
      this.grantPuck(d);
      const away = sub(d.pos, carrier.pos);
      const n = len(away) > 1
        ? norm(away)
        : v(Math.cos(carrier.facing + Math.PI), Math.sin(carrier.facing + Math.PI));
      d.vel = scale(n, COUNTER_BURST);
      d.facing = Math.atan2(n.y, n.x);
      this.popup('PARRY!', d.pos, '#66ff99', 26);
    } else {
      d.whiff();
      const why = id !== carrier.move ? 'WRONG MOVE' : timing === 'early' ? 'TOO EARLY' : 'TOO LATE';
      this.popup(why, d.pos, '#ff9e9e', 18);
    }
  }

  /**
   * Check (defense, Enter/Shift) = BLOCK. Never steals and never whiffs: the
   * defender plants and becomes a wall for CHECK_TIME (see applyGuards /
   * finishMove). The price is being rooted and a cooldown.
   */
  private doCheck(d: Player): void {
    if (d.checkCd > 0 || d.stagger > 0 || d.guardT > 0 || d.down) return;
    if (d.team === 0) this.balanceMetrics.checks++;
    d.checkCd = CHECK_COOLDOWN_BASE - CHECK_COOLDOWN_PER_DEF * d.stats.checkPower; // big checkers re-check sooner
    d.guardT = CHECK_TIME;
    d.guardStart = this.clock; // a juke is only stuffed by a check that was already up when its tell began
    d.stickSwing = 0.3;
    d.vel = scale(d.vel, 0.3); // plant
    d.checkHit.clear();
    // The check also STRIKES anyone already in reach who isn't mid-move (a move is
    // answered by parry / stuff instead): knock-back, stun and damage.
    const reach = d.guardRadius() + CHECK_HIT_REACH;
    for (const o of this.players) {
      if (o.team === d.team || o.isGoalie || o.down || o.move) continue;
      if (dist(o.pos, d.pos) > reach) continue;
      const n = norm(sub(o.pos, d.pos));
      this.checkHit(d, o, Math.max(0, -dot(o.vel, n)));
    }
  }

  /** One check connects: push the target back, stun them, hurt them. Once per target per stance. */
  private checkHit(g: Player, o: Player, closing: number): void {
    if (g.checkHit.has(o)) return;
    g.checkHit.add(o);
    const off = sub(o.pos, g.pos);
    const n = len(off) > 1 ? norm(off) : v(g.team === 0 ? 1 : -1, 0);
    const impact = clamp(0.6 + closing / 300, 0.6, 1.5);
    const mult = g.team === 1 ? this.diff.aiCheckDamage : 1;
    const cp = g.stats.checkPower * this.powerRuntime.statMultiplier(this.actorKey(g), 'checkPower', this.clock);
    const dmg = (CHECK_DAMAGE_BASE + CHECK_DAMAGE_PER_DEF * cp) * impact * mult;
    // A BUMP (not a throw): stops the carrier's progress and stuns them, but leaves them in
    // pressure range — and adds pressure, so a clean check on a walker leads to a strip.
    if (g.team === 0) this.balanceMetrics.checkHits++;
    o.vel = scale(n, (CHECK_BUMP_BASE + CHECK_BUMP_PER_DEF * cp) * impact * (0.5 + 0.5 * mult));
    o.stagger = Math.max(o.stagger, (CHECK_STAGGER_BASE + CHECK_STAGGER_PER_DEF * cp) * impact * mult);
    if (o.carrying) o.pressure = Math.min(0.95, o.pressure + (CHECK_PRESSURE_BASE + CHECK_PRESSURE_PER_DEF * cp) * impact * mult);
    o.tumble = TUMBLE_TIME * 0.6;
    o.guardT = 0;
    o.charging = false;
    o.charge = 0;
    o.holdT = 0;
    g.vel = scale(g.vel, 0.3);
    this.popup(`-${Math.round(dmg)}`, o.pos, '#ff6b6b', 20);
    this.damage(o, dmg);
    if (g.team === 0) this.emitPowerEvent('checkHit', g);
  }

  private damage(o: Player, amount: number): void {
    o.hp = Math.max(0, o.hp - amount);
    o.hpRegenWait = HP_REGEN_DELAY;
    if (o.hp <= 0 && !o.down) this.knockDown(o);
  }

  /** 0 HP: drop the puck and lie on the ice for DOWN_TIME, then stand up with full HP. */
  private knockDown(p: Player, popupLabel = 'DOWN!'): void {
    p.down = true;
    p.downTimer = DOWN_TIME;
    p.move = null;
    p.moveResolved = true;
    p.charging = false;
    p.charge = 0;
    p.holdT = 0;
    p.guardT = 0;
    p.dashDir = null;
    p.vel = scale(p.vel, 0.2);
    if (this.puck.carriedBy === p) {
      const ang = Math.random() * Math.PI * 2;
      this.puck.launch(v(Math.cos(ang), Math.sin(ang)), 140, p);
    }
    this.popup(popupLabel, p.pos, popupLabel === 'SUPER PARRY!' ? '#ffd166' : '#ff6b6b', 26);
  }

  /**
   * A juke's tell ended and it wasn't parried. If a planted defender's wall
   * covers the carrier the move is STUFFED (no burst, carrier stunned, puck
   * kept). Otherwise the carrier bursts — toward where the user is pointing —
   * and nearby defenders are knocked back AND stunned: real separation.
   */
  private finishMove(p: Player): void {
    const id = p.move;
    if (!id) return;
    // Note: p.move stays set through the effect phase (Player.update clears
    // it after tell+effect) — that's what drives the spin's 2π rotation.
    const def = MOVE_DEFS[id];

    // A check only STUFFS the move if it was already planted when the tell began (a wall you
    // can't juke into). One thrown in reaction is too late: it just roots the defender (and the
    // dash below knocks them aside) — that is how a baited check gets punished.
    const startedAt = this.clock - p.moveT;
    const inReach = (o: Player) => o.team !== p.team && o.guardT > 0 && !o.down && dist(o.pos, p.pos) <= o.stuffRange();
    const blocker = this.players.find((o) => inReach(o) && o.guardStart <= startedAt + CHECK_PREPLANT_GRACE);
    if (!blocker && this.players.some(inReach)) this.popup('SLIPPED PAST', p.pos, '#ffd166', 20);
    if (blocker) {
      p.vel = scale(p.vel, 0.15);
      p.stagger = Math.max(p.stagger, STUFF_STAGGER_BASE + STUFF_STAGGER_PER_DEF * blocker.stats.checkPower);
      p.tumble = TUMBLE_TIME;
      p.move = null; // cancel the effect (no spin, no burst)
      this.popup('BLOCKED', p.pos, '#9ad1ff', 22);
      // A stuffed move has not escaped pressure. Keep the existing meter so
      // nearby defenders can still strip the puck after the failed attempt.
      return;
    }

    const superJukeTargets = p.team === 0 && id === 'deke' && this.hasItem(ITEM_IDS.superJuke)
      ? this.players.filter(o => o.team !== p.team && !o.isGoalie && !o.down && dist(o.pos, p.pos) <= PARRY_RANGE + 24)
      : [];

    // Aim = where you point at the end of the tell (else the way you face). The move
    // then bends/cuts away from that aim: Spin curves round the defender, Deke cuts at
    // an angle (see dashHeading) — to the side picked at tell start, away from the nearest defender.
    let aimDir = v(Math.cos(p.facing), Math.sin(p.facing));
    if (p === this.controlled) {
      const inp = this.controls.direction();
      if (inp.x || inp.y) aimDir = inp;
    }
    // The Deke is a SIDESTEP measured from your travel when it started (the stick picked the side).
    p.dashAim = id === 'deke' ? p.moveBase : Math.atan2(aimDir.y, aimDir.x);

    // The enemy goalie's answer to this move (rolled when the tell started — see stepGoalie).
    const eg = this.goalieOf(p.team === 0 ? 1 : 0);
    const plan = eg?.goaliePlan;
    const answered = !!eg && !eg.down && plan?.owner === p && plan.seq === p.moveSeq && dist(p.pos, eg.pos) <= GOALIE_FOOL_RANGE + 40;
    if (eg && plan && answered && plan.stance === 'read') {
      if (dist(p.pos, eg.pos) <= GOALIE_POKE_RANGE && this.puck.carriedBy === p) {
        // Point blank into a goalie who saw it coming: smothered.
        p.vel = scale(p.vel, 0.15);
        p.stagger = Math.max(p.stagger, 0.35);
        p.tumble = TUMBLE_TIME;
        p.move = null;
        this.grantPuck(eg);
        this.popup('SMOTHERED!', eg.pos, '#9ad1ff', 24);
        return;
      }
      this.popup('READ', eg.pos, '#c9d1d9', 18);
    }

    // The juke has cleared every defender check and any goalie smother attempt;
    // only now has it actually landed. A move windup or stuffed/parried move
    // must not wipe the carrier's pressure meter.
    p.pressure = 0;
    p.pressers = [];
    if (this.puck.carriedBy === p) this.puck.setPressure(0);

    const h0 = dashHeading(def, p.dashAim, p.moveSide, 0);
    const dir = v(Math.cos(h0), Math.sin(h0));
    p.facing = h0;
    // DASH: velocity is held along the (curving) heading for the effect phase (see Player.update / dashSpeedAt).
    p.dashDir = dir;
    p.dashSpeed = def.dash * p.stats.skill * this.powerRuntime.statMultiplier(this.actorKey(p), 'skill', this.clock);
    p.vel = scale(dir, dashSpeedAt(p.dashSpeed, 0));
    this.launchFx(p, id);
    if (p.team === 0) { this.balanceMetrics.jukes++; this.emitPowerEvent('moveLanded', p); }
    if (eg && plan && answered && plan.stance === 'bite') {
      const side = lateralSignY(def, p.dashAim, p.moveSide);
      if (side !== 0) {
        // FOOLED: it went for the fake. Slow, late to read, and your next shot is a snap shot.
        eg.fooledT = GOALIE_FOOL_TIME;
        eg.foolSpent = false;
        eg.openSign = side;
        eg.respect = respectAfterFool(eg.respect);
        eg.lastFooled = id;
        this.popup('FOOLED!', eg.pos, '#ffd60a', 22);
      }
    }
    // Knock nearby defenders back (biased behind the carrier's travel) and stun them.
    for (const o of this.players) {
      if (o.team === p.team || o.isGoalie || o.down) continue;
      const d = dist(o.pos, p.pos);
      if (d > def.knockRadius) continue;
      const away = norm(sub(o.pos, p.pos));
      o.vel = add(o.vel, scale(add(away, scale(dir, 0.7)), def.knock * (1.2 - d / def.knockRadius)));
      o.tumble = TUMBLE_TIME * 0.8;
      o.stagger = Math.max(o.stagger, def.stagger);
      o.guardT = 0;
    }
    // Super Juke: a close defender who failed to stuff/parry the move is left behind the carrier.
    if (superJukeTargets.length) {
      const travel = norm(dir);
      const sideVector = v(-travel.y, travel.x);
      superJukeTargets.forEach((o, index) => {
        const side = (index % 2 === 0 ? 1 : -1);
        o.pos = v(
          clamp(p.pos.x - travel.x * 92 + sideVector.x * side * 20, ICE_X + 18, ICE_X + RINK_W - 18),
          clamp(p.pos.y - travel.y * 92 + sideVector.y * side * 20, ICE_Y + 18, ICE_Y + RINK_H - 18),
        );
        o.vel = scale(travel, -175);
        o.stagger = Math.max(o.stagger, 1.0);
        o.tumble = Math.max(o.tumble, TUMBLE_TIME);
        o.guardT = 0;
        o.charging = false; o.charge = 0; o.holdT = 0;
        o.move = null; o.moveResolved = true; o.dashDir = null;
      });
      this.popup('LEFT IN THE DUST!', p.pos, '#7bdff2', 22);
    }
  }

  /**
   * Afterimages while a landed move's dash plays out — a different look per move
   * so you can tell them apart even after the tell is over:
   *   Spin → expanding ripple rings (it's a swirl);  Deke → straight speed
   *   streaks + diamond ghosts along its zig-zag (it's a quick sidestep).
   */
  private trail(p: Player): void {
    if (!p.move || !p.dashDir) return;
    this.trailTick++;
    const col = MOVE_DEFS[p.move].color;
    if (p.move === 'spin') {
      if (this.trailTick % 3 !== 0) return;
      const ring = this.add.circle(p.pos.x, p.pos.y, 14, col, 0).setStrokeStyle(4, col, 0.8).setDepth(0.5);
      this.tweens.add({ targets: ring, scale: 2.8, alpha: 0, duration: 340, onComplete: () => ring.destroy() });
      return;
    }
    const dir = p.dashDir;
    const ang = Math.atan2(dir.y, dir.x);
    for (const off of [-9, 0, 9]) {
      const x = p.pos.x - dir.x * 22 - dir.y * off;
      const y = p.pos.y - dir.y * 22 + dir.x * off;
      const streak = this.add.rectangle(x, y, 44, 4, col, 0.6).setRotation(ang).setDepth(0.5);
      this.tweens.add({ targets: streak, alpha: 0, scaleX: 0.3, duration: 240, onComplete: () => streak.destroy() });
    }
    if (this.trailTick % 3 === 0) {
      const ghost = this.add.rectangle(p.pos.x, p.pos.y, 22, 22, col, 0.35).setRotation(Math.PI / 4).setDepth(0.4);
      this.tweens.add({ targets: ghost, alpha: 0, scale: 1.6, duration: 280, onComplete: () => ghost.destroy() });
    }
  }

  /** One-shot flash at the moment a move lands (matches the move's shape). */
  private launchFx(p: Player, id: MoveId): void {
    const col = MOVE_DEFS[id].color;
    if (id === 'deke') {
      const d = this.add.rectangle(p.pos.x, p.pos.y, 26, 26, col, 0).setStrokeStyle(5, col, 0.95).setRotation(Math.PI / 4).setDepth(0.6);
      this.tweens.add({ targets: d, scale: 3.4, alpha: 0, duration: 320, onComplete: () => d.destroy() });
    } else {
      const c = this.add.circle(p.pos.x, p.pos.y, 18, col, 0).setStrokeStyle(6, col, 0.95).setDepth(0.6);
      this.tweens.add({ targets: c, scale: 3.6, alpha: 0, duration: 380, onComplete: () => c.destroy() });
    }
  }

  /**
   * Aim reticle on the goal mouth + a dotted guide. Shown while charging a shot AND
   * during the one-timer window (where Up/Down held at the moment of the shot picks the corner).
   */
  private drawAim(c: Player, dirY: number): void {
    const g = this.aimG;
    g.clear();
    let aimY: number;
    let hot: boolean;
    const inc = c.carrying ? null : this.incomingPass(c);
    if (c.carrying && c.charging) {
      aimY = c.aimY;
      hot = c.charge >= PERFECT_SHOT_CHARGE;
    } else if ((inc && inc.eta <= ONE_TIMER_LEAD) || (c.carrying && c.receivedByPass && c.sinceReceive <= ONE_TIMER_GRACE)) {
      aimY = clamp(dirY, -1, 1);
      hot = true;
    } else return;
    const gx = c.team === 0 ? ICE_X + RINK_W : ICE_X;
    const ty = aimTargetY(aimY);
    const col = hot ? 0xffffff : 0xffd166;
    const o = this.puck.state === 'carried' && this.puck.carriedBy === c ? this.puck.pos : c.pos;
    const dx = gx - o.x;
    const dy = ty - o.y;
    const n = Math.max(1, Math.floor(Math.hypot(dx, dy) / 22));
    g.fillStyle(col, 0.35);
    for (let i = 1; i < n; i++) g.fillCircle(o.x + (dx * i) / n, o.y + (dy * i) / n, 2.2);
    const pulse = hot ? 1 + 0.15 * Math.sin(this.time.now * 0.03) : 1;
    g.lineStyle(3, col, 0.95);
    g.strokeCircle(gx, ty, 11 * pulse);
    for (const [ax, ay] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      g.lineBetween(gx + ax * 15 * pulse, ty + ay * 15 * pulse, gx + ax * 24 * pulse, ty + ay * 24 * pulse);
    }
  }

  /** Small floating popup ("!" for perfect shots, PARRY!, BLOCKED, TOO EARLY…). */
  private popup(text: string, at: Vec2, color: string, size = 30): void {
    const t = this.add.text(at.x, at.y - 38, text, {
      fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold', color,
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------- match flow ----------

  private onGoal(side: 0 | 1): void {
    this.score[side] += 1;
    if (this.testMode) { if (side === 0) this.balanceMetrics.goalsFor++; else this.balanceMetrics.goalsAgainst++; }
    const shooter = this.puck.lastTaker && this.puck.lastTaker.team === side ? this.puck.lastTaker : null;
    const passer = shooter && this.puck.lastPasser?.team === side && this.puck.lastPasser !== shooter ? this.puck.lastPasser : null;
    if (this.campaign) {
      recordCareerGoal(side, side === 0 && shooter ? { name: shooter.name, sprite: shooter.sprite, isStarter: shooter.isStarter, goalie: shooter.isGoalie } : null,
        side === 0 && passer ? { name: passer.name, sprite: passer.sprite, isStarter: passer.isStarter, goalie: passer.isGoalie } : null);
    }
    if (side === 0 && shooter) this.emitPowerEvent('goalScored', shooter);
    this.updateScoreText();
    this.setState('goal');
    this.flash(side === 0 ? `GOAL — ${this.userTeam.name.toUpperCase()}!` : `GOAL — ${this.oppTeam.name.toUpperCase()}!`);
  }

  private setState(s: MatchState): void {
    this.state = s;
    if (s === 'drop') {
      this.stateTimer = DROP_TIME;
      this.resetPositions();
    } else if (s === 'goal') {
      this.revertMegaForm();
      this.stateTimer = GOAL_PAUSE;
    } else if (s === 'over') {
      this.flash(this.score[0] > this.score[1] ? 'YOU WIN!' : 'YOU LOSE', true);
      const retryAvailable = this.canUseTestRetry();
      this.hintText.setText(this.testMode
        ? retryAvailable ? 'ENTER — RETRY ONCE  ·  SPACE — BACK TO LAB' : 'CLICK / ENTER — RETURN TO BALANCE LAB'
        : this.campaign ? 'ENTER — continue' : 'R — restart').setAlpha(1);
      this.hintText.setInteractive({ useHandCursor: true }).removeAllListeners('pointerdown').on('pointerdown', () => { if (this.testMode) this.finishTestMatch(); else if (this.campaign) this.toResult(); else this.restart(); });
    } else {
      this.bannerText.setAlpha(0);
      this.hintText.setAlpha(0);
    }
  }

  private flash(text: string, persistent = false): void {
    this.bannerText.setText(text);
    if (persistent) {
      this.bannerText.setAlpha(1);
      return;
    }
    this.bannerText.setAlpha(1);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      delay: GOAL_PAUSE * 500,
      duration: 400,
    });
  }

  private resetPositions(): void {
    for (const p of this.players) {
      p.pos = v(p.home.x, p.home.y);
      p.vel = v();
      p.carrying = false;
      p.charging = false;
      p.charge = 0;
      p.move = null;
      p.moveT = 0;
      p.moveResolved = false;
      p.stagger = 0;
      p.tumble = 0;
      p.checkCd = 0;
      p.guardT = 0;
      p.tellHint = null;
      p.shotCue = null;
      p.holdT = 0;
      p.aimY = 0;
      p.hp = p.stats.maxHp; // fresh legs at every faceoff
      p.hpRegenWait = 0;
      p.down = false;
      p.downTimer = 0;
      p.checkHit.clear();
      p.receivedByPass = false;
      p.sinceReceive = 99;
      p.goalieReactAt = null;
      p.dashDir = null;
      p.pressure = 0;
      p.pressers = [];
      p.fooledT = 0;
      p.foolSpent = false;
      p.respect = 0;
      p.lastFooled = null;
      p.goaliePlan = { owner: null, seq: -1, stance: 'hold' };
      p.guardStart = -99;
    }
    this.puckHist = [];
    this.oneTimerArmed = null;
    this.puck.reset(CENTER_X, CENTER_Y);
    this.manualPick = null;
    if (this.controlled) this.controlled.setControlled(false);
    this.controlled = null;
  }

  private restart(): void {
    this.score = [0, 0];
    this.updateScoreText();
    this.setState('drop');
  }

  /** Hand a finished campaign match to the result screen. */
  private toResult(): void {
    if (this.testMode) { this.toBalanceLab(); return; }
    this.scene.start('ResultScene', {
      teamId: this.oppTeam.id,
      userScore: this.score[0],
      opponentScore: this.score[1],
      tournament: this.tournament,
      towerFloor: this.towerFloor,
    });
  }

  private actorKey(p: Player): string { return `${p.team}:${p.slot}`; }

  private emitPowerEvent(trigger: PowerTrigger, p: Player): void {
    const activations = this.powerRuntime.emit(trigger, {
      actorKey: this.actorKey(p), team: p.team, role: p.isGoalie ? 'goalie' : 'field', hasPuck: p.carrying, now: this.clock,
    });
    for (const activation of activations) this.popup(`${activation.powerName.toUpperCase()}!`, p.pos, '#7bdff2', 15);
  }

  private toBalanceLab(): void {
    const summary: BalanceMatchSummary = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toISOString(),
      opponentId: this.oppTeam.id, opponentName: this.oppTeam.name, playerTeamName: this.userTeam.name,
      result: this.score[0] > this.score[1] ? 'win' : 'loss', playerScore: this.score[0], opponentScore: this.score[1],
      liveSeconds: Math.round(this.clock * 10) / 10, ...this.balanceMetrics, powerIds: [...this.powerIds], itemIds: [...this.testItemIds],
      powerActivations: this.powerRuntime.activations.length, activationNames: this.powerRuntime.activations.map((a) => a.powerName),
    };
    this.scene.start('BalanceLabScene', { latest: summary });
  }

  /** Forfeit / quit: the run ends in a loss, then leave the match. */
  private endRun(sceneKey: string, data?: object): void {
    if (this.campaign) {
      setRun(abandonMatch(getRun()));
      archiveCareerRun({
        outcome: 'forfeit',
        teamName: this.userTeam.name,
        year: getMeta().seasonYear,
        lineup: this.userTeam.players.map(p => ({ name: p.name, sprite: p.sprite, isStarter: p.isStarter, goalie: p.goalie })),
        lostTo: this.oppTeam.name,
        score: { for: this.score[0], against: this.score[1] },
        winsBeforeEnd: Object.values(getRun().results).filter(r => r === 'win').length,
      });
      finishCareerMatch();
    }
    this.scene.start(sceneKey, { ...(data ?? {}), ...(this.campaign ? { teamId: this.oppTeam.id, userScore: this.score[0], opponentScore: this.score[1] } : {}) });
  }

  shutdown(): void {
    this.pauseOverlay?.destroy();
    this.pauseOverlay = null;
  }

  private updateScoreText(): void {
    this.scoreText.setText(
      `${this.userTeam.name}  ${this.score[0]} — ${this.score[1]}  ${this.oppTeam.name}   ·   first to ${GOALS_TO_WIN}`,
    );
  }

  /** A Balance Lab item toggle behaves like a purchased item, without touching saved unlocks. */
  private hasItem(itemId: string): boolean {
    if (this.testMode) return this.testItemIds.includes(itemId);
    return this.campaign && getMeta().unlocked.includes(itemId);
  }

  private canUseTestRetry(): boolean {
    return this.testMode && canRetryBalanceLabLoss(this.testItemIds, this.testRetryUsed, this.score[0], this.score[1]);
  }

  private finishTestMatch(): void {
    if (!this.canUseTestRetry()) { this.toBalanceLab(); return; }
    this.scene.restart({
      userTeam: this.userTeam,
      opponent: this.oppTeam,
      level: this.diff.level,
      testMode: true,
      powerIds: [...this.powerIds],
      testItemIds: [...this.testItemIds],
      testStarter: this.testStarter,
      testRetryUsed: true,
    } satisfies MatchConfig);
  }

  private canMegaEvolve(): boolean {
    if (this.megaUsedThisMatch || !this.hasItem(ITEM_IDS.megaEvolution)) return false;
    if (this.testMode) {
      if (!this.testStarter) return false;
      const finalStage = STARTER_EVOLUTIONS[this.testStarter][STARTER_EVOLUTIONS[this.testStarter].length - 1];
      return this.players.some(p => p.team === 0 && p.isStarter && !p.isGoalie && p.sprite === finalStage.sprite);
    }
    if (!this.campaign) return false;
    const meta = getMeta();
    if (!meta.starter || !isStarterAtFinalEvolution(meta.starter, meta.starterXp)) return false;
    const finalStage = STARTER_EVOLUTIONS[meta.starter][STARTER_EVOLUTIONS[meta.starter].length - 1];
    return this.players.some(p => p.team === 0 && p.isStarter && !p.isGoalie && p.sprite === finalStage.sprite);
  }

  private activateMegaEvolution(): void {
    if (this.state !== 'live' || this.megaOriginal || !this.canMegaEvolve()) return;
    const starter = this.testMode ? this.testStarter : getMeta().starter;
    if (!starter) return;
    const player = this.players.find(p => p.team === 0 && p.isStarter && !p.isGoalie);
    const mega = MEGA_STARTER_FORMS[starter];
    if (!player || !mega) return;
    this.megaOriginal = { player, name: player.name, sprite: player.sprite, stats: player.stats };
    this.megaUsedThisMatch = true;
    player.setForm(mega.name, mega.sprite, deriveStats(mega.stats));
    if (this.megaHud) this.megaHud.label.setText('MEGA ACTIVE  ·  UNTIL GOAL').setColor('#7bdff2');
    this.popup(`${mega.name.toUpperCase()}!`, player.pos, '#ffd166', 28);
  }

  private revertMegaForm(): void {
    if (!this.megaOriginal) return;
    const old = this.megaOriginal;
    old.player.setForm(old.name, old.sprite, old.stats);
    this.megaOriginal = null;
    if (this.megaHud) this.megaHud.label.setText('MEGA USED  ·  THIS MATCH').setColor('#8b98ab');
  }

  private makePlayer(team: Team, teamIdx: 0 | 1, i: number, pd: Team['players'][number]): Player {
    const stats = deriveStats(pd.stats);
    const [x, y] = formationPos(teamIdx, i);
    return new Player(
      this,
      {
        name: pd.name,
        sprite: pd.sprite,
        isGoalie: !!pd.goalie,
        color: team.color,
        colorDark: team.colorDark,
        stats,
        isStarter: pd.isStarter === true,
      },
      x,
      y,
      teamIdx,
      i,
    );
  }
}

/** Dev deep-link: ?opp=0..2 picks the opponent (mirrors pokemon-bowl's ?match=). */
export function readOpponentParam(): number {
  const raw = new URLSearchParams(window.location.search).get('opp');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n < OPPONENTS.length ? n : 0;
}

/** Dev deep-link: ?level=0..1 sets the AI difficulty (0 = slow tutorial pace, 1 = full speed). */
export function readLevelParam(): number {
  const raw = new URLSearchParams(window.location.search).get('level');
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : DEFAULT_LEVEL;
}

/** i: 0–2 field, 3 goalie. Team 0 defends left; team 1 mirrored. */
function formationPos(teamIdx: 0 | 1, i: number): [number, number] {
  const xs = [ICE_X + 190, ICE_X + 190, ICE_X + 340, ICE_X + 30];
  const ys = [CENTER_Y - 140, CENTER_Y + 140, CENTER_Y, CENTER_Y];
  if (teamIdx === 0) return [xs[i], ys[i]];
  return [ICE_X + RINK_W - (xs[i] - ICE_X), ys[i]];
}

