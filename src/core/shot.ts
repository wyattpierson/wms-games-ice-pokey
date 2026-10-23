/**
 * Shooting model (pure, testable).
 *
 * CHARGE: hold to charge; `charge` goes 0→1 over CHARGE_TIME. The PERFECT zone
 * is charge ≥ PERFECT_SHOT_CHARGE. After full charge there is a short grace,
 * then the charge bleeds away — so the zone is a real timing WINDOW (the goalie
 * cue shows it), and over-holding is worse than releasing on time.
 *
 * AIM: while charging you are locked onto the goal and aim is a single number
 * `aimY` in [-1, 1] sliding along the goal mouth (−1 top post … +1 bottom post).
 * The shot goes at the POINT on the mouth, from wherever you are — so from any
 * angle, the whole range is on net (the old model was an angle that was ~200px
 * wide of the net at full deflection, applied only at release).
 */

import {
  AIM_POST_MARGIN, CHARGE_TIME, OVERCHARGE_DECAY, OVERCHARGE_GRACE, PERFECT_SHOT_CHARGE,
} from '../config/gameplay';
import { CENTER_Y, GOAL_H } from '../config/rink';
import { norm, v, type Vec2 } from './vec2';

/** Charge (0..1) after holding the shoot key for `hold` seconds. */
export function chargeFromHold(hold: number): number {
  if (hold <= 0) return 0;
  if (hold <= CHARGE_TIME + OVERCHARGE_GRACE) return Math.min(1, hold / CHARGE_TIME);
  return Math.max(0, 1 - (hold - CHARGE_TIME - OVERCHARGE_GRACE) * OVERCHARGE_DECAY);
}

/** Hold-times (s) at which the perfect window opens and closes. */
export function perfectWindowHold(): { open: number; close: number } {
  return {
    open: PERFECT_SHOT_CHARGE * CHARGE_TIME,
    close: CHARGE_TIME + OVERCHARGE_GRACE + (1 - PERFECT_SHOT_CHARGE) / OVERCHARGE_DECAY,
  };
}

/** The Super Shot release window sits strictly inside the normal goalie flash. */
export function superShotWindowHold(): { open: number; close: number } {
  return {
    open: CHARGE_TIME + OVERCHARGE_GRACE * 0.15,
    close: CHARGE_TIME + OVERCHARGE_GRACE * 0.85,
  };
}

export function isSuperShotHold(hold: number): boolean {
  const { open, close } = superShotWindowHold();
  return hold >= open && hold <= close;
}

/** Half the usable goal mouth (px) — aim ±1 lands this far from the centre line. */
export const AIM_HALF_SPAN = GOAL_H / 2 - AIM_POST_MARGIN;

/** y of the aim point on the goal line for `aimY` (values beyond ±1 are wide: AI only). */
export function aimTargetY(aimY: number): number {
  return CENTER_Y + aimY * AIM_HALF_SPAN;
}

/** Unit direction from `from` to the aim point on the goal line at x = goalX. */
export function shotDirection(from: Vec2, goalX: number, aimY: number): Vec2 {
  const d = norm(v(goalX - from.x, aimTargetY(aimY) - from.y));
  return d.x === 0 && d.y === 0 ? v(Math.sign(goalX - from.x) || 1, 0) : d;
}
