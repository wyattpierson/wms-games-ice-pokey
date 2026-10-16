import type Phaser from 'phaser';
import { PUCK_FRICTION, PUCK_RADIUS, PUCK_WALL_DAMPING } from '../../config/gameplay';
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
  scoredBy: 0 | 1 | null = null; // which team scored (team 0 attacks right)

  private body: Phaser.GameObjects.Ellipse;
  private shadow: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.pos = v(x, y);
    this.shadow = scene.add.ellipse(0, 2, 12, 6, 0x000000).setAlpha(0.2).setDepth(15);
    this.body = scene.add.ellipse(0, 0, PUCK_RADIUS * 2.4, PUCK_RADIUS * 1.8, 0x16181d).setDepth(16);
  }

  reset(x: number, y: number): void {
    this.pos = v(x, y);
    this.vel = v();
    this.state = 'loose';
    if (this.carriedBy) this.carriedBy.carrying = false;
    this.carriedBy = null;
    this.lastTaker = null;
    this.scoredBy = null;
    this.place();
  }

  /** Give the puck to a player (they become the carrier). */
  give(p: Player): void {
    if (this.carriedBy && this.carriedBy !== p) this.carriedBy.carrying = false;
    this.state = 'carried';
    this.carriedBy = p;
    p.carrying = true;
    this.vel = v();
  }

  /** Fire the puck loose (pass or shot). */
  launch(dir: Vec2, speed: number, taker: Player): void {
    if (this.carriedBy) this.carriedBy.carrying = false;
    this.state = 'loose';
    this.carriedBy = null;
    this.lastTaker = taker;
    this.scoredBy = null;
    this.vel = scale(dir, speed);
  }

  update(dt: number): void {
    if (this.state === 'carried') {
      if (this.carriedBy) this.pos = this.carriedBy.bladeTip();
      this.vel = v();
      this.place();
      return;
    }
    if (this.state === 'scored') return;

    this.pos = v(this.pos.x + this.vel.x * dt, this.pos.y + this.vel.y * dt);
    const mul = Math.exp(-PUCK_FRICTION * dt);
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
    this.body.setPosition(this.pos.x, this.pos.y);
    this.shadow.setPosition(this.pos.x, this.pos.y);
  }
}
