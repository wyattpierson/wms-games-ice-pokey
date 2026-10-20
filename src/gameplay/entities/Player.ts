import type Phaser from 'phaser';
import { ACTION_KEYS } from '../../config/bindings';
import {
  CARRY_SPEED_FACTOR, CHECK_SLOW, GOALIE_RADIUS, GOALIE_RESPECT_DECAY, HP_REGEN_RATE, MOVE_COOLDOWN,
  PARRY_CONE_HALF, PARRY_RANGE, PERFECT_SHOT_CHARGE, PLAYER_RADIUS, TUMBLE_TIME, WHIFF_TIME,
} from '../../config/gameplay';
import type { AIPlan } from '../../core/aiPlan';
import { ICE_X, ICE_Y, RINK_H, RINK_W } from '../../config/rink';
import { clamp, len, v, type Vec2 } from '../../core/vec2';
import {
  dashHeading, dashSpeedAt, dekeAxis, dekeVerticalDir, MOVE_DEFS, sideAwayFrom, type MoveId,
} from '../../core/moves';
import { CENTER_Y } from '../../config/rink';
import type { GoalieStance } from '../../core/goalie';
import { guardRadiusFor, stuffRangeFor } from '../../core/stats';
import type { HockeyStats } from '../../core/stats';

const BLADE_LEN = 8;
const SWING_TIME = 0.3;

/**
 * Tell readability (the #1 playtest complaint was "hard to see"). A tell is now
 * shown four ways, none of which depend on reading the busy sprite:
 *   1. a colour GLOW on the body that grows through the tell;
 *   2. a RING that shrinks onto a fixed target ring — it lands exactly when the
 *      tell ends — with the parry window drawn as a shaded band the ring must
 *      enter; the ring turns white inside the window ("NOW");
 *   3. a SHAPE badge above the head (circle = Spin, diamond = Deke) …
 *   4. … carrying the KEY LETTER to press (learning aid; difficulty-gated).
 * The stick still flashes the move colour too.
 */
const TELL_RING_START = 54; // ring starts this far outside the target ring
const TELL_RING_GAP = 10; // target ring sits this far outside the body
const CUE_BURST_TIME = 0.28; // the flash when a window opens

/**
 * Every cue uses the same grammar (so you learn it once): a ring shrinks onto a
 * fixed target ring; a shaded band marks the window; the ring turns white and a
 * burst fires when the window opens. What differs per source is the SHAPE, so
 * moves are tell-able at a glance:  Spin = rotating arcs (circle), Deke = diamond,
 * shot window on the goalie = gold circle + "SHOOT!".
 */
type CueShape = 'circle' | 'diamond' | 'spin';
interface Cue {
  color: number;
  progress: number; // 0..1 along the ring's travel
  openAt: number; // progress at which the window opens
  inWindow: boolean;
  shape: CueShape;
  badge: 'circle' | 'diamond' | 'square' | 'none';
  label: string | null;
  labelScale: number;
  badgeY: number;
}

/** The goalie's perfect-shot cue (set by the scene while the user charges a shot). */
export interface ShotCue {
  progress: number;
  openAt: number;
  inWindow: boolean;
  /** Label while the window is open (default "SHOOT!"; one-timers say "ONE-TIMER!"). */
  label?: string;
  color?: number;
}

export interface TellHint {
  /** Parry window (s) of the defender who is looking at this tell. */
  window: number;
  /** Show the key letter in the badge. */
  showKey: boolean;
  /** Is the watching defender inside the carrier's parry cone? (colours the cone white / red) */
  inCone: boolean;
}

export interface PlayerVisual {
  name: string;
  sprite: number; // Pokédex number; texture key = `pkm-${sprite}`
  isGoalie: boolean;
  color: number;
  colorDark: number;
  stats: HockeyStats;
}

/**
 * A skater: container = [shadow, Pokémon sprite (or placeholder disc), stick/
 * marker graphics]. The stick is drawn on top and is the readability layer —
 * it points where you're moving/aiming, follows the puck, flashes move colors
 * during tells, and swings on shots/checks.
 */
export class Player {
  pos: Vec2;
  vel: Vec2 = v();
  facing = 0;

  hp: number;
  hpRegenWait = 0; // s until HP starts to regenerate
  down = false; // knocked out (0 HP): lies on the ice for DOWN_TIME, then stands up with full HP
  downTimer = 0;
  /** Opponents already hit by THIS check stance (one hit per target per stance). */
  checkHit = new Set<Player>();
  sinceReceive = 99; // s since this player caught a pass (one-timer grace)
  receivedByPass = false;

  carrying = false;
  charging = false;
  charge = 0;
  stickSwing = 0;

  // Skill-move (juke) state
  move: MoveId | null = null;
  moveT = 0; // seconds since the move started
  moveResolved = false; // tell ended → effect applied (or parried away)
  moveCd = 0;
  moveSeq = 0; // increments per startMove; defenders key their plans off this
  tellDur = 0.3; // THIS move's actual tell length (stat + difficulty scaled)
  effectDur = 0.2;
  tellHint: TellHint | null = null; // set by the scene when a human defender is watching
  // Check (block) stance
  guardT = 0; // >0 while planted as a wall
  // Dash (the landed half of a skill move): velocity is HELD along dashDir for the effect phase
  dashDir: Vec2 | null = null; // current heading of the dash (updated each frame; a curve for Spin)
  dashAim = 0; // the aim angle the dash heading is measured from
  dashSpeed = 0; // px/s at the start of the dash (already × skill)
  moveSide: 1 | -1 = 1; // which way this move goes (away from the nearest defender, picked at tell start)
  moveBase = 0; // heading (rad) when the move started: the Deke sidesteps relative to THIS, not to where the stick points at the end
  guardStart = -99; // scene clock when the current check stance was planted (a late check can't stuff a juke)
  // Possession pressure (see core/pressure.ts): fills while defenders crowd the carrier; 1 = stripped.
  pressure = 0;
  pressers: Player[] = []; // who is pressing this carrier right now (drawn as contact lines)
  // Goalie vs skill moves (see core/goalie.ts) — only meaningful on goalies.
  goaliePlan: { owner: Player | null; seq: number; stance: GoalieStance } = { owner: null, seq: -1, stance: 'hold' };
  respect = 0; // how much this goalie respects the carrier right now (decays)
  lastFooled: MoveId | null = null;
  fooledT = 0; // >0: fooled by a landed move — slow, late, and the next shot is a snap shot
  foolSpent = false; // the fooled window has been used by a shot
  openSign: -1 | 0 | 1 = 0; // screen-y side the fooling move cut toward (the OPEN side)
  speedScale = 1; // AI speed multiplier (difficulty / teammate factor); ignored for the controlled player
  // Whiff / knockback tumble (visual + brief stagger)
  stagger = 0;
  tumble = 0;

  pickupCooldown = 0;
  whiffCooldown = 0; // flailed at a fast puck; can't re-grab it for a moment
  saveCooldown = 0;
  goalieSeq = -1; // (goalie AI) which launch it is currently reacting to
  goalieReactAt: number | null = null; // (goalie AI) game-time at which it commits to a shot it has seen
  checkCd = 0;
  decideTimer = 1;

  // AI response planning (see ai.ts / core/aiPlan.ts)
  aiPlanSeq = -1;
  aiPlan: AIPlan = { kind: 'none' };

  controlled = false;
  aiChase = false;
  shotCue: ShotCue | null = null; // (goalie) the enemy is charging a shot: show the release window
  holdT = 0; // seconds the shoot key has been held (drives charge via core/shot.ts)
  aimY = 0; // shot aim along the goal mouth, -1..1 (reset when a charge starts)
  private cueIn = false;
  private cueBurst = 0;

  readonly seed = Math.random();
  readonly slot: number;
  home: Vec2;

  private container: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private img: Phaser.GameObjects.Image | null = null;
  private tellText: Phaser.GameObjects.Text;
  private def: PlayerVisual;

  private t = 0; // local clock for anims
  private bobT = 0; // walk-bob phase accumulator

  constructor(
    scene: Phaser.Scene,
    def: PlayerVisual,
    x: number,
    y: number,
    readonly team: 0 | 1,
    slot: number,
  ) {
    this.def = def;
    this.pos = v(x, y);
    this.home = v(x, y);
    this.slot = slot;
    this.hp = def.stats.maxHp;

    const r = this.radius();
    const shadow = scene.add.ellipse(0, 3, r * 2.1, r * 1.2, 0x000000).setAlpha(0.22);

    // Pokémon sprite if the texture loaded (Preloader); placeholder disc if
    // not (offline dev / load failure — the game must still work).
    const key = `pkm-${def.sprite}`;
    if (scene.textures.exists(key)) {
      this.img = scene.add.image(0, -2, key)
        .setScale(this.def.isGoalie ? 0.5 : 0.44)
        .setOrigin(0.5, 0.82);
    }

    this.g = scene.add.graphics();
    this.tellText = scene.add
      .text(0, -64, '', {
        fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#000000', strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.container = scene.add.container(
      x, y,
      this.img ? [shadow, this.img, this.g, this.tellText] : [shadow, this.g, this.tellText],
    );
  }

  get name(): string {
    return this.def.name;
  }

  get isGoalie(): boolean {
    return this.def.isGoalie;
  }

  get stats(): HockeyStats {
    return this.def.stats;
  }

  radius(): number {
    return this.def.isGoalie ? GOALIE_RADIUS : PLAYER_RADIUS;
  }

  /** Can this player start a skill move right now? */
  canStartMove(): boolean {
    return !this.move && this.moveCd <= 0 && this.stagger <= 0 && !this.down;
  }

  /**
   * `tellScale` stretches the tell on top of the player's own Special-Attack
   * scaling (the AI passes its difficulty's aiTellScale here).
   */
  startMove(id: MoveId, tellScale = 1, threat: Vec2 | null = null): boolean {
    if (!this.canStartMove()) return false;
    if (id === 'deke') {
      // Always across the net toward the more open side (low → cuts high), not relative to where you're facing.
      const ax = dekeAxis(this.team, dekeVerticalDir(this.pos.y, CENTER_Y, threat ? threat.y : null));
      this.moveSide = ax.side;
      this.moveBase = ax.base;
    } else {
      this.moveSide = sideAwayFrom(this.facing, this.pos, threat);
      this.moveBase = this.facing;
    }
    this.move = id;
    this.moveT = 0;
    this.moveResolved = false;
    this.moveSeq += 1;
    const def = MOVE_DEFS[id];
    this.tellDur = def.tell * this.def.stats.tellMult * tellScale;
    this.effectDur = def.effect;
    this.moveCd = MOVE_COOLDOWN + this.tellDur + this.effectDur;
    // A move is a commitment: cancel any shot charge in progress.
    this.charging = false;
    this.charge = 0;
    this.holdT = 0;
    return true;
  }

  /** Failed parry: staggered and open. */
  whiff(): void {
    this.guardT = 0;
    this.stagger = WHIFF_TIME;
    this.tumble = TUMBLE_TIME;
    this.moveCd = Math.max(this.moveCd, MOVE_COOLDOWN);
  }

  /** Radius of this player's check wall (Defense-scaled). */
  guardRadius(): number {
    return guardRadiusFor(this.def.stats.checkPower);
  }

  /** A juke resolving this close to a planted defender is stuffed. */
  stuffRange(): number {
    return stuffRangeFor(this.def.stats.checkPower);
  }

  /** True while a landed skill move is carrying this player along its dash. */
  get dashing(): boolean {
    return !!(this.dashDir && this.move && this.moveResolved && this.moveT >= this.tellDur);
  }

  /** Angle the stick is drawn at (charge cock-back, swings, tell flick). */
  private stickAngle(): number {
    let a = this.facing;
    if (this.charging) a -= this.charge * 0.9;
    else if (this.stickSwing > 0) a -= 1.2 * (this.stickSwing / SWING_TIME);
    if (this.move && this.moveT < this.tellDur) {
      // The juke animation: the stick (and the puck on its blade) works the
      // puck back and forth while the tell plays out.
      const t = this.moveT / this.tellDur;
      if (this.move === 'spin') {
        a += Math.pow(t, 1.4) * Math.PI * 2; // winds up in a full, accelerating circle (the puck orbits you)
      } else {
        // quick side-to-side feint, biased toward the FAKE side (the cut goes the other way)
        a += Math.sin(this.moveT * 38) * 0.5 * t - this.moveSide * 0.6 * t;
      }
    }
    return a;
  }

  /** Where the puck sits when this player carries it. */
  bladeTip(): Vec2 {
    const a = this.stickAngle();
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy;
    const py = dx;
    const r = this.radius();
    const ex = this.pos.x + dx * (r + 8) + px * r * 0.3;
    const ey = this.pos.y + dy * (r + 8) + py * r * 0.3;
    return v(ex + px * BLADE_LEN, ey + py * BLADE_LEN);
  }

  /** Steer toward a target velocity (glide = hockey feel). */
  applyInput(dir: Vec2, dt: number, speedFactor = 1): void {
    if (this.stagger > 0 || this.down) return; // staggered: can't steer
    const planted = this.guardT > 0 ? CHECK_SLOW : 1;
    const aiScale = this.controlled ? 1 : this.speedScale;
    const carry = this.carrying && !this.isGoalie ? CARRY_SPEED_FACTOR : 1; // the puck slows you a little
    const speed = this.def.stats.moveSpeed * (this.isGoalie ? 0.8 : 1) * speedFactor * planted * aiScale * carry;
    const tx = dir.x * speed;
    const ty = dir.y * speed;
    const t = Math.min(1, dt * 11);
    this.vel.x += (tx - this.vel.x) * t;
    this.vel.y += (ty - this.vel.y) * t;
  }

  /** No input: decelerate on the ice. */
  coast(dt: number): void {
    const mul = Math.exp(-7 * dt);
    this.vel.x *= mul;
    this.vel.y *= mul;
    if (len(this.vel) < 3) this.vel = v();
  }

  update(dt: number, puckPos: Vec2): void {
    this.t += dt;
    if (this.stickSwing > 0) this.stickSwing = Math.max(0, this.stickSwing - dt);
    this.pickupCooldown = Math.max(0, this.pickupCooldown - dt);
    this.whiffCooldown = Math.max(0, this.whiffCooldown - dt);
    this.saveCooldown = Math.max(0, this.saveCooldown - dt);
    this.moveCd = Math.max(0, this.moveCd - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.tumble = Math.max(0, this.tumble - dt);
    this.checkCd = Math.max(0, this.checkCd - dt);
    this.guardT = Math.max(0, this.guardT - dt);
    this.cueBurst = Math.max(0, this.cueBurst - dt);
    this.sinceReceive += dt;
    this.fooledT = Math.max(0, this.fooledT - dt);
    if (this.fooledT <= 0) this.foolSpent = false;
    this.respect = Math.max(0, this.respect - GOALIE_RESPECT_DECAY * dt);
    if (this.respect <= 0) this.lastFooled = null;
    if (this.down) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.down = false; // stand up with full health
        this.hp = this.def.stats.maxHp;
        this.stagger = 0.2;
      }
    } else if (this.hp < this.def.stats.maxHp) {
      this.hpRegenWait -= dt;
      if (this.hpRegenWait <= 0) this.hp = Math.min(this.def.stats.maxHp, this.hp + HP_REGEN_RATE * dt);
    }
    this.decideTimer -= dt;

    // Move lifecycle: tell (scene watches for parries) → effect → done.
    if (this.move) {
      this.moveT += dt;
      // Spin effect: rotate fully through the effect phase.
      if (this.moveResolved && this.move === 'spin' && this.moveT >= this.tellDur) {
        this.facing += ((Math.PI * 2) / this.effectDur) * dt;
      }
      if (this.moveT >= this.tellDur + this.effectDur) this.move = null;
    }
    // Dash: override whatever input/friction did to velocity this frame.
    if (this.dashing && this.move) {
      const ph = (this.moveT - this.tellDur) / this.effectDur;
      const sp = dashSpeedAt(this.dashSpeed, ph);
      // Spin's heading sweeps round a curve; Deke's is a constant cut angle (core/moves.ts).
      const h = dashHeading(MOVE_DEFS[this.move], this.dashAim, this.moveSide, ph);
      this.dashDir = v(Math.cos(h), Math.sin(h));
      this.vel = v(this.dashDir.x * sp, this.dashDir.y * sp);
    } else if (!this.move) {
      this.dashDir = null;
    }

    const sp = len(this.vel);
    if (sp > 10) this.facing = Math.atan2(this.vel.y, this.vel.x);
    // Non-carriers keep their last travel direction when stopped — but
    // non-carriers still aim at the puck (the puck sits on the blade only for
    // the carrier, so no orbit issue).
    else if (!this.carrying) this.facing = Math.atan2(puckPos.y - this.pos.y, puckPos.x - this.pos.x);

    this.pos = v(this.pos.x + this.vel.x * dt, this.pos.y + this.vel.y * dt);

    const r = this.radius();
    this.pos.x = clamp(this.pos.x, ICE_X + r, ICE_X + RINK_W - r);
    this.pos.y = clamp(this.pos.y, ICE_Y + r, ICE_Y + RINK_H - r);

    this.container.setPosition(this.pos.x, this.pos.y);
    this.container.setAlpha(this.down ? 0.45 : 1);

    // Tumble: wobble-rotate the whole body (whiff / knocked back by a juke).
    if (this.tumble > 0) {
      const k = this.tumble / TUMBLE_TIME;
      this.container.rotation = Math.sin((TUMBLE_TIME - this.tumble) * 14) * 0.45 * k;
    } else if (this.down) {
      this.container.rotation = Math.PI / 2; // lying on the ice
    } else if (this.dashing && this.move === 'spin') {
      // Spin: the whole body does one full pirouette through the dash.
      const ph = Math.min(1, (this.moveT - this.tellDur) / this.effectDur);
      this.container.rotation = Math.PI * 2 * (1 - Math.pow(1 - ph, 2.2));
    } else if (this.dashing && this.move === 'deke' && this.dashDir) {
      // Deke: the body leans into each leg of the zig-zag, flipping with the weave.
      const ph = Math.min(1, (this.moveT - this.tellDur) / this.effectDur);
      const cycles = MOVE_DEFS.deke.zigCycles ?? 1;
      this.container.rotation = Math.sin(ph * Math.PI * 2 * cycles) * 0.32 * this.moveSide;
    } else {
      this.container.rotation = 0;
    }

    // Sprite: face travel direction, walk-bob while moving.
    if (this.img) {
      this.img.flipX = Math.cos(this.facing) >= 0; // front sprites face left
      this.bobT += sp * dt;
      this.img.y = -2 - (sp > 24 ? Math.abs(Math.sin(this.bobT * 0.09)) * 3 : 0);
      // Deke wind-up: the body sways side to side, growing as the cut nears.
      const dekeTell = this.move === 'deke' && this.moveT < this.tellDur;
      // …and leans toward the FAKE side: the opposite of where the sidestep will go (perpendicular to travel).
      const prog = dekeTell ? this.moveT / this.tellDur : 0;
      const fx = Math.sin(this.moveBase) * this.moveSide; // fake direction = −(sidestep direction)
      const fy = -Math.cos(this.moveBase) * this.moveSide;
      this.img.x = dekeTell ? Math.sin(this.moveT * 24) * 4 * prog + fx * 9 * prog : 0;
      this.img.y += dekeTell ? fy * 9 * prog : 0;
    }

    this.draw();
  }

  setControlled(c: boolean): void {
    this.controlled = c;
  }

  /** One ring of a cue, in the cue's shape. `moving` = the shrinking ring (Spin's is rotating arcs). */
  private strokeCueRing(g: Phaser.GameObjects.Graphics, shape: CueShape, rad: number, moving: boolean): void {
    if (shape === 'diamond') {
      const d = rad * 1.18;
      g.strokePoints([{ x: 0, y: 2 - d }, { x: d, y: 2 }, { x: 0, y: 2 + d }, { x: -d, y: 2 }], true);
    } else if (shape === 'spin' && moving) {
      const rot = this.t * 9;
      for (let i = 0; i < 3; i++) {
        const a0 = rot + (i * Math.PI * 2) / 3;
        g.beginPath();
        g.arc(0, 2, rad, a0, a0 + 1.3, false);
        g.strokePath();
      }
    } else {
      g.strokeCircle(0, 2, rad);
    }
  }

  /** Glow + shrinking ring + window band + window-open burst + badge/label. See the Cue doc. */
  private drawCue(g: Phaser.GameObjects.Graphics, r: number, cue: Cue | null): void {
    if (!cue) {
      this.cueIn = false;
      this.tellText.setVisible(false);
      this.drawBurst(g, r);
      return;
    }
    const target = r + TELL_RING_GAP;
    const startR = target + TELL_RING_START;
    const ringR = startR + (target - startR) * cue.progress;
    const flicker = 0.5 + 0.5 * Math.sin(this.t * 36);
    const col = cue.color;

    // 1. Body glow — grows through the cue and goes aggressive once the window is open.
    g.fillStyle(cue.inWindow ? 0xffffff : col, 0.14 + 0.28 * cue.progress + (cue.inWindow ? 0.3 * flicker : 0));
    g.fillCircle(0, 2, r + 5 + (cue.inWindow ? 4 : 0));

    // 2. Window band + fixed target ring + the moving ring.
    const openR = startR + (target - startR) * cue.openAt;
    g.lineStyle(openR - target + 6, col, 0.16);
    this.strokeCueRing(g, cue.shape, (openR + target) / 2, false);
    g.lineStyle(3, col, 0.95);
    this.strokeCueRing(g, cue.shape, target, false);
    g.lineStyle(cue.inWindow ? 6 : 3, cue.inWindow ? 0xffffff : col, 1);
    this.strokeCueRing(g, cue.shape, ringR, true);

    // 3. The instant the window opens: an expanding flash.
    if (cue.inWindow && !this.cueIn) this.cueBurst = CUE_BURST_TIME;
    this.cueIn = cue.inWindow;
    this.drawBurst(g, r);

    // 4. Badge (shape per move) and/or label.
    const by = cue.badgeY;
    const k = (cue.inWindow ? 1.2 + 0.1 * flicker : 1) * cue.labelScale;
    const br = 13 * k;
    if (cue.badge !== 'none') {
      g.fillStyle(cue.inWindow ? 0xffffff : col, 0.97);
      g.lineStyle(3, 0x000000, 1);
      if (cue.badge === 'diamond') {
        const pts = [{ x: 0, y: by - br * 1.2 }, { x: br * 1.2, y: by }, { x: 0, y: by + br * 1.2 }, { x: -br * 1.2, y: by }];
        g.fillPoints(pts, true);
        g.strokePoints(pts, true);
      } else if (cue.badge === 'square') {
        g.fillRect(-br, by - br, br * 2, br * 2);
        g.strokeRect(-br, by - br, br * 2, br * 2);
      } else {
        g.fillCircle(0, by, br);
        g.strokeCircle(0, by, br);
      }
    }
    this.tellText.setVisible(cue.label !== null);
    if (cue.label !== null) {
      this.tellText.setText(cue.label);
      this.tellText.setPosition(0, by);
      this.tellText.setScale(k);
    }
  }

  private drawBurst(g: Phaser.GameObjects.Graphics, r: number): void {
    if (this.cueBurst <= 0) return;
    const k = 1 - this.cueBurst / CUE_BURST_TIME;
    g.lineStyle(2 + 7 * (1 - k), 0xffffff, 1 - k);
    g.strokeCircle(0, 2, r + 10 + 66 * k);
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    const r = this.radius();

    // Controlled marker: bobbing arrow above the head + bright ring. This is
    // the "who am I" indicator on both offense and defense (on defense you
    // don't have the puck, so the arrow carries it).
    if (this.controlled) {
      const top = this.img ? 44 : r + 10;
      const ay = -top - 6 - Math.sin(this.t * 5) * 2.5;
      g.lineStyle(3, 0x000000, 1);
      g.strokeTriangle(0, ay, -8, ay + 10, 8, ay + 10);
      g.fillStyle(0xffe066, 1);
      g.fillTriangle(0, ay, -8, ay + 10, 8, ay + 10);
      g.lineStyle(2, 0xffe066, 0.9);
      g.strokeCircle(0, 2, r + 4);
    }

    // Possession pressure: a ring that fills clockwise (orange → red) and flickers near the strip.
    if (this.carrying && this.pressure > 0.03) {
      const pr = Math.min(1, this.pressure);
      const hot = pr > 0.7;
      const flick = hot ? 0.6 + 0.4 * Math.sin(this.t * 34) : 1;
      g.lineStyle(5, 0x000000, 0.35 * flick);
      g.beginPath();
      g.arc(0, 2, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr, false);
      g.strokePath();
      g.lineStyle(3, pr < 0.55 ? 0xffa94d : 0xff4d4d, (0.55 + 0.4 * pr) * flick);
      g.beginPath();
      g.arc(0, 2, r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr, false);
      g.strokePath();
    }

    // Body.
    if (this.img) {
      // Team ring around the sprite (sprites are busy art; the ring says team).
      g.lineStyle(2, this.def.color, 0.95);
      g.strokeCircle(0, 2, r + 1);
    } else {
      g.fillStyle(this.def.color, 1);
      g.fillCircle(0, 0, r);
      g.lineStyle(2, this.def.colorDark, 1);
      g.strokeCircle(0, 0, r);
    }
    if (this.def.isGoalie && !this.img) {
      g.lineStyle(2, this.def.colorDark, 0.8);
      g.strokeCircle(0, 0, r - 4);
    }

    // Check (block) stance: a translucent wall the size of the check radius.
    if (this.guardT > 0) {
      const gr = this.guardRadius();
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 24);
      g.fillStyle(0x9ad1ff, 0.14 + 0.1 * pulse);
      g.fillCircle(0, 2, gr);
      g.lineStyle(3, 0x9ad1ff, 0.85);
      g.strokeCircle(0, 2, gr);
      // Outer faint ring = how far the block reaches to STUFF a juke.
      g.lineStyle(2, 0x9ad1ff, 0.3);
      g.strokeCircle(0, 2, this.stuffRange());
    }

    // Stick: shaft from the hand (body edge), then a short blade out to the
    // side. Container-local coords — must mirror bladeTip() (world-space).
    // During a tell the stick takes the move's color: dim flicker before the
    // parry window, bright flashing once it opens.
    let stickColor = 0xd9b36c;
    let bladeColor = 0x8a6a3b;
    let stickAlpha = 1;
    const telling = !!this.move && this.moveT < this.tellDur;
    const progress = telling ? this.moveT / this.tellDur : 0;
    // Window opens at (1 − window/tell). Without a watching defender, assume half.
    const winFrac = this.tellHint ? Math.min(0.9, this.tellHint.window / this.tellDur) : 0.5;
    const inWindow = telling && progress >= 1 - winFrac;
    if (telling && this.move) {
      const def = MOVE_DEFS[this.move];
      stickColor = def.color;
      bladeColor = def.color;
      stickAlpha = inWindow ? 0.8 + 0.2 * Math.sin(this.t * 42) : 0.35 + 0.2 * Math.sin(this.t * 30);
    }
    let cue: Cue | null = null;
    if (telling && this.move) {
      const def = MOVE_DEFS[this.move];
      const hint = this.tellHint;
      cue = {
        color: def.color,
        progress,
        openAt: 1 - winFrac,
        inWindow,
        shape: this.move === 'spin' ? 'spin' : this.move === 'deke' ? 'diamond' : 'circle',
        badge: !hint ? 'none' : this.move === 'deke' ? 'diamond' : this.move === 'crossover' ? 'square' : 'circle',
        label: hint?.showKey ? (ACTION_KEYS[this.move][0] ?? '').toUpperCase() : null,
        labelScale: 1,
        badgeY: -64,
      };
    } else if (this.shotCue) {
      // The enemy is charging a shot: the goalie shows the release window.
      cue = {
        color: this.shotCue.color ?? 0xffd166,
        progress: this.shotCue.progress,
        openAt: this.shotCue.openAt,
        inWindow: this.shotCue.inWindow,
        shape: 'circle',
        badge: 'none',
        label: this.shotCue.inWindow ? (this.shotCue.label ?? 'SHOOT!') : null,
        labelScale: 1.25,
        badgeY: -(r + 46),
      };
    }
    this.drawCue(g, r, cue);

    // Parry cone: while a human defender watches a tell, show where a parry counts
    // (white = you're inside it, red = you're not — move into the front!).
    if (telling && this.tellHint) {
      const col = this.tellHint.inCone ? 0xffffff : 0xff6b6b;
      const a0 = this.facing - PARRY_CONE_HALF;
      const a1 = this.facing + PARRY_CONE_HALF;
      g.fillStyle(col, 0.1);
      g.slice(0, 2, PARRY_RANGE, a0, a1, false);
      g.fillPath();
      g.lineStyle(2, col, 0.55);
      g.beginPath();
      g.moveTo(0, 2);
      g.lineTo(Math.cos(a0) * PARRY_RANGE, 2 + Math.sin(a0) * PARRY_RANGE);
      g.arc(0, 2, PARRY_RANGE, a0, a1, false);
      g.lineTo(0, 2);
      g.strokePath();
    }

    // Health bar (only once hurt).
    const maxHp = this.def.stats.maxHp;
    if (!this.down && this.hp < maxHp - 0.5) {
      const frac = Math.max(0, this.hp / maxHp);
      g.fillStyle(0x000000, 0.55);
      g.fillRect(-18, -47, 36, 7);
      g.fillStyle(frac > 0.5 ? 0x66ff99 : frac > 0.25 ? 0xffd166 : 0xff6b6b, 1);
      g.fillRect(-17, -46, 34 * frac, 5);
    }

    const a = this.stickAngle();
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy;
    const py = dx;
    const hx = dx * r * 0.3 + px * r * 0.55;
    const hy = dy * r * 0.3 + py * r * 0.55;
    const ex = dx * (r + 8) + px * r * 0.3;
    const ey = dy * (r + 8) + py * r * 0.3;
    const tx = ex + px * BLADE_LEN;
    const ty = ey + py * BLADE_LEN;
    g.lineStyle(3, stickColor, stickAlpha);
    g.lineBetween(hx, hy, ex, ey);
    g.lineStyle(4, bladeColor, stickAlpha);
    g.lineBetween(ex, ey, tx, ty);

    // Charge gauge (yellow arc; turns white in the perfect-shot zone, with a
    // tick at the zone boundary).
    if (this.charging && this.charge > 0) {
      const inPerfect = this.charge >= PERFECT_SHOT_CHARGE;
      g.lineStyle(3, inPerfect ? 0xffffff : 0xffd166, 1);
      g.beginPath();
      g.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + this.charge * Math.PI * 2, false);
      g.strokePath();
      const pa = -Math.PI / 2 + PERFECT_SHOT_CHARGE * Math.PI * 2;
      g.lineStyle(3, 0xffffff, 0.8);
      g.lineBetween(
        Math.cos(pa) * (r + 3), Math.sin(pa) * (r + 3),
        Math.cos(pa) * (r + 8), Math.sin(pa) * (r + 8),
      );
    }

    // Staggered / whiffed: gray flash over the body.
    if (this.stagger > 0) {
      g.fillStyle(0xffffff, 0.25 * Math.sin(this.t * 40) + 0.2);
      g.fillCircle(0, 0, r + 2);
    }

    // down (not implemented yet): gray out
    if (this.down) {
      g.fillStyle(0x000000, 0.45);
      g.fillCircle(0, 0, r);
    }
  }
}
