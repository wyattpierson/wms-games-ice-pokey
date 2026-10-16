import type Phaser from 'phaser';
import {
  GOALIE_RADIUS, MOVE_COOLDOWN, PERFECT_SHOT_CHARGE, PLAYER_RADIUS,
  TUMBLE_TIME, WHIFF_TIME,
} from '../../config/gameplay';
import { ICE_X, ICE_Y, RINK_H, RINK_W } from '../../config/rink';
import { clamp, len, v, type Vec2 } from '../../core/vec2';
import { MOVE_DEFS, type MoveId } from '../../core/moves';
import type { HockeyStats } from '../../core/stats';

const BLADE_LEN = 8;
const SWING_TIME = 0.3;

/**
 * Tell-flash readability contract (this is what defenders read — sprites are
 * busy art, the stick is the signal):
 *   tell progress <  0.45 → dim flicker in the move color ("a move is coming")
 *   tell progress >= 0.45 → bright flashing ("NOW — the parry window is open")
 * The bright phase is drawn from 0.45; the actual success window is the last
 * `effectiveWindow` (<= 0.7 × tell) seconds, so the bright phase always
 * contains it.
 */
const TELL_BRIGHT_AT = 0.45;

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
  down = false;
  downTimer = 0;

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
  // Whiff / knockback tumble (visual + brief stagger)
  stagger = 0;
  tumble = 0;

  pickupCooldown = 0;
  whiffCooldown = 0; // flailed at a fast puck; can't re-grab it for a moment
  saveCooldown = 0;
  checkCd = 0;
  decideTimer = 1;

  // AI parry planning (see ai.ts)
  parryRollSeq = -1;
  parryPlanT: number | null = null; // tell-elapsed at which the AI presses
  checkPlanT: number | null = null;

  controlled = false;
  aiChase = false;
  shotTell = false; // (goalie) enemy is in the perfect-shot charge zone

  readonly seed = Math.random();
  readonly slot: number;
  home: Vec2;

  private container: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private img: Phaser.GameObjects.Image | null = null;
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
    this.container = scene.add.container(x, y, this.img ? [shadow, this.img, this.g] : [shadow, this.g]);
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

  startMove(id: MoveId): boolean {
    if (!this.canStartMove()) return false;
    this.move = id;
    this.moveT = 0;
    this.moveResolved = false;
    this.moveSeq += 1;
    const def = MOVE_DEFS[id];
    this.moveCd = MOVE_COOLDOWN + def.tell + def.effect;
    // A move is a commitment: cancel any shot charge in progress.
    this.charging = false;
    this.charge = 0;
    return true;
  }

  /** Failed parry: staggered and open. */
  whiff(): void {
    this.stagger = WHIFF_TIME;
    this.tumble = TUMBLE_TIME;
    this.moveCd = Math.max(this.moveCd, MOVE_COOLDOWN);
  }

  /** Angle the stick is drawn at (charge cock-back, swings, tell flick). */
  private stickAngle(): number {
    let a = this.facing;
    if (this.charging) a -= this.charge * 0.9;
    else if (this.stickSwing > 0) a -= 1.2 * (this.stickSwing / SWING_TIME);
    if (this.move && this.moveT < MOVE_DEFS[this.move].tell) {
      // The juke animation: the stick (and the puck on its blade) works the
      // puck back and forth while the tell plays out.
      const t = this.moveT / MOVE_DEFS[this.move].tell;
      a += Math.sin(this.moveT * 38) * 0.55 * t;
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
    const speed = this.def.stats.moveSpeed * (this.isGoalie ? 0.8 : 1) * speedFactor;
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
    this.decideTimer -= dt;

    // Move lifecycle: tell (scene watches for parries) → effect → done.
    if (this.move) {
      this.moveT += dt;
      const def = MOVE_DEFS[this.move];
      // Spin effect: rotate fully through the effect phase.
      if (this.moveResolved && this.move === 'spin' && this.moveT >= def.tell) {
        this.facing += ((Math.PI * 2) / def.effect) * dt;
      }
      if (this.moveT >= def.tell + def.effect) this.move = null;
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

    // Tumble: wobble-rotate the whole body (whiff / knocked back by a juke).
    if (this.tumble > 0) {
      const k = this.tumble / TUMBLE_TIME;
      this.container.rotation = Math.sin((TUMBLE_TIME - this.tumble) * 14) * 0.45 * k;
    } else {
      this.container.rotation = 0;
    }

    // Sprite: face travel direction, walk-bob while moving.
    if (this.img) {
      this.img.flipX = Math.cos(this.facing) >= 0; // front sprites face left
      this.bobT += sp * dt;
      this.img.y = -2 - (sp > 24 ? Math.abs(Math.sin(this.bobT * 0.09)) * 3 : 0);
    }

    this.draw();
  }

  setControlled(c: boolean): void {
    this.controlled = c;
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

    // Perfect-shot tell (goalie only): while the shooter's charge is in the
    // perfect zone the goalie flashes white — that flash IS the timing tell.
    if (this.shotTell) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 30);
      g.lineStyle(3, 0xffffff, 0.4 + 0.6 * pulse);
      g.strokeCircle(0, 0, r + 6);
      g.fillStyle(0xffffff, 0.12 + 0.22 * pulse);
      g.fillCircle(0, 0, r + 2);
    }

    // Stick: shaft from the hand (body edge), then a short blade out to the
    // side. Container-local coords — must mirror bladeTip() (world-space).
    // During a tell the stick takes the move's color: dim flicker before the
    // parry window, bright flashing once it opens.
    let stickColor = 0xd9b36c;
    let bladeColor = 0x8a6a3b;
    let stickAlpha = 1;
    if (this.move) {
      const def = MOVE_DEFS[this.move];
      if (this.moveT < def.tell) {
        const t = this.moveT / def.tell;
        const bright = t >= TELL_BRIGHT_AT;
        stickColor = def.color;
        bladeColor = def.color;
        stickAlpha = bright ? 0.8 + 0.2 * Math.sin(this.t * 42) : 0.35 + 0.2 * Math.sin(this.t * 30);
      }
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
