import type Phaser from 'phaser';
import { BANK_PASS_RETAIN, PASS_FRICTION, PUCK_FRICTION, PUCK_RADIUS, PUCK_WALL_DAMPING } from '../../config/gameplay';
import { GOAL_BOTTOM, GOAL_TOP, GOAL_W, ICE_X, ICE_Y, RINK_H, RINK_W } from '../../config/rink';
import { scale, v, type Vec2 } from '../../core/vec2';
import type { Player } from './Player';

export type PuckState = 'loose' | 'carried' | 'scored';

/**
 * The puck: its own world object with four states.
 *  - loose:   free physics (friction, board bounces, goal-mouth detection)
 *  - carried: glued to the carrier's stick blade
 *  - scored:  frozen until the scene resets the drop
 */
export class Puck {
  pos: Vec2;
  vel: Vec2 = v();
  state: PuckState = 'loose';
  carriedBy: Player | null = null;
  lastTaker: Player | null = null;
  /** Most recent completed teammate pass in the current possession, used for assists. */
  lastPasser: Player | null = null;
  scoredBy: 0 | 1 | null = null; // which team scored (team 0 attacks right)
  /** Set while a PASS is in flight: who threw it and who it is meant for (cleared on any pickup / shot). */
  pass: { from: Player; to: Player; bank?: Vec2 } | null = null;
  /** True for a one-timer: the goalie reads it late. */
  quick = false;
  /** Increments on every launch (pass or shot) — lets the goalie tell a NEW shot from the same one. */
  launchSeq = 0;

  private trail: Phaser.GameObjects.Graphics;
  private body: Phaser.GameObjects.Ellipse;
  private shadow: Phaser.GameObjects.Ellipse;
  /** Possession pressure on the carrier (0..1): the puck rattles on the blade and turns red. */
  private pressure = 0;
  private shake = 0;
  private tintedAt = -1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.pos = v(x, y);
    this.trail = scene.add.graphics().setDepth(15);
    this.shadow = scene.add.ellipse(0, 2, 12, 6, 0x000000).setAlpha(0.2).setDepth(15);
    this.body = scene.add.ellipse(0, 0, PUCK_RADIUS * 2.4, PUCK_RADIUS * 1.8, 0x16181d)
      .setStrokeStyle(1, 0xffffff, 0.9).setDepth(16);
  }

  reset(x: number, y: number): void {
    this.pos = v(x, y);
    this.vel = v();
    this.state = 'loose';
    if (this.carriedBy) this.carriedBy.carrying = false;
    this.carriedBy = null;
    this.lastTaker = null;
    this.lastPasser = null;
    this.scoredBy = null;
    this.pass = null;
    this.quick = false;
    this.setPressure(0);
    this.place();
  }

  /** Visual only: how close the carrier is to being stripped. */
  setPressure(p: number): void {
    this.pressure = p;
    // Re-colour only when the (rounded) level changes.
    const level = p < 0.2 ? 0 : Math.round(p * 8);
    if (level !== this.tintedAt) {
      this.tintedAt = level;
      const t = level === 0 ? 0 : Math.min(1, level / 8);
      const r = Math.round(0x16 + (0xff - 0x16) * t);
      const g = Math.round(0x18 + (0x4d - 0x18) * t);
      const b = Math.round(0x1d + (0x4d - 0x1d) * t);
      this.body.setFillStyle((r << 16) | (g << 8) | b);
    }
  }

  /** Give the puck to a player (they become the carrier). */
  give(p: Player): void {
    if (this.carriedBy && this.carriedBy !== p) {
      this.carriedBy.carrying = false;
      this.carriedBy.aiShotAim = null;
      this.carriedBy.charging = false;
      this.carriedBy.charge = 0;
      this.carriedBy.holdT = 0;
    }
    this.state = 'carried';
    this.carriedBy = p;
    p.carrying = true;
    this.vel = v();
    this.pass = null;
    this.quick = false;
  }

  /** Fire the puck loose (pass or shot). */
  launch(dir: Vec2, speed: number, taker: Player): void {
    if (this.carriedBy) {
      this.carriedBy.carrying = false;
      this.carriedBy.aiShotAim = null;
      this.carriedBy.charging = false;
      this.carriedBy.charge = 0;
      this.carriedBy.holdT = 0;
    }
    this.state = 'loose';
    this.carriedBy = null;
    this.lastTaker = taker;
    this.scoredBy = null;
    this.vel = scale(dir, speed);
    this.pass = null; // callers set it right after launching a pass
    this.quick = false;
    this.launchSeq += 1;
  }

  update(dt: number, intercept?: (start: Vec2, end: Vec2) => boolean): void {
    this.shake += dt;
    if (this.state === 'carried') {
      if (this.carriedBy) this.pos = this.carriedBy.bladeTip();
      this.vel = v();
      this.place();
      return;
    }
    if (this.state === 'scored') return;

    let start = v(this.pos.x, this.pos.y);
    let travelTime = dt;
    const bank = this.pass?.bank;
    if (bank && Math.abs(this.vel.y) > 1e-6) {
      const toBoard = (bank.y - start.y) / this.vel.y;
      if (toBoard >= 0 && toBoard <= dt) {
        const contact = v(start.x + this.vel.x * toBoard, bank.y);
        if (intercept?.(start, contact)) { this.place(); return; }
        start = contact;
        travelTime -= toBoard;
        // Preserve the reflection angle: damp BOTH components on a bank pass.
        this.vel = v(this.vel.x * BANK_PASS_RETAIN, -this.vel.y * BANK_PASS_RETAIN);
        if (this.pass) this.pass.bank = undefined;
      }
    }
    const end = v(start.x + this.vel.x * travelTime, start.y + this.vel.y * travelTime);
    if (intercept?.(start, end)) { this.place(); return; }
    this.pos = end;
    const mul = Math.exp(-(this.pass ? PASS_FRICTION : PUCK_FRICTION) * dt);
    this.vel = scale(this.vel, mul);

    const minX = ICE_X + PUCK_RADIUS;
    const maxX = ICE_X + RINK_W - PUCK_RADIUS;
    const minY = ICE_Y + PUCK_RADIUS;
    const maxY = ICE_Y + RINK_H - PUCK_RADIUS;

    const inMouth = this.pos.y > GOAL_TOP + 3 && this.pos.y < GOAL_BOTTOM - 3;

    // left goal line
    if (this.pos.x < minX) {
      if (inMouth) {
        if (this.pos.x < ICE_X) {
          this.scoredBy = 1; // team 1 attacks left
          this.state = 'scored';
          this.place();
          return;
        }
      } else {
        this.pos.x = minX;
        this.vel.x = -this.vel.x * PUCK_WALL_DAMPING;
      }
    }
    // right goal line
    if (this.pos.x > maxX) {
      if (inMouth) {
        if (this.pos.x > ICE_X + RINK_W) {
          this.scoredBy = 0; // team 0 (user) attacks right
          this.state = 'scored';
          this.place();
          return;
        }
      } else {
        this.pos.x = maxX;
        this.vel.x = -this.vel.x * PUCK_WALL_DAMPING;
      }
    }
    // back of the net (if somehow past the line without scoring)
    if (this.pos.x < ICE_X - GOAL_W + PUCK_RADIUS) {
      this.pos.x = ICE_X - GOAL_W + PUCK_RADIUS;
      this.vel.x = -this.vel.x * PUCK_WALL_DAMPING;
    }
    if (this.pos.x > ICE_X + RINK_W + GOAL_W - PUCK_RADIUS) {
      this.pos.x = ICE_X + RINK_W + GOAL_W - PUCK_RADIUS;
      this.vel.x = -this.vel.x * PUCK_WALL_DAMPING;
    }

    // top / bottom boards
    if (this.pos.y < minY) {
      this.pos.y = minY;
      this.vel.y = -this.vel.y * PUCK_WALL_DAMPING;
    } else if (this.pos.y > maxY) {
      this.pos.y = maxY;
      this.vel.y = -this.vel.y * PUCK_WALL_DAMPING;
    }

    this.place();
  }

  private place(): void {
    let jx = 0;
    let jy = 0;
    if (this.state === 'carried' && this.pressure > 0.3) {
      const amp = (this.pressure - 0.3) * 5.5;
      jx = Math.sin(this.shake * 174) * amp;
      jy = Math.cos(this.shake * 222) * amp;
    }
    this.trail.clear();
    if (this.state === 'loose' && this.pass?.bank) {
      this.trail.lineStyle(2, 0x57c9e8, 0.8);
      this.trail.strokeCircle(this.pass.bank.x, this.pass.bank.y, 8);
    }
    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (this.state === 'loose' && speed > 300) {
      const length = Math.min(34, (speed - 300) * 0.055);
      this.trail.lineStyle(5, 0x346080, 0.24);
      this.trail.lineBetween(this.pos.x, this.pos.y, this.pos.x - this.vel.x / speed * length, this.pos.y - this.vel.y / speed * length);
      this.trail.lineStyle(2, 0xffffff, 0.85);
      this.trail.lineBetween(this.pos.x, this.pos.y, this.pos.x - this.vel.x / speed * length * 0.7, this.pos.y - this.vel.y / speed * length * 0.7);
    }
    this.body.setPosition(this.pos.x + jx, this.pos.y + jy);
    this.shadow.setPosition(this.pos.x + jx, this.pos.y + jy + 3);
  }
}
