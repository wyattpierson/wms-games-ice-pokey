/**
 * Skill-move (juke) + parry timing model (pure — no Phaser).
 *
 * A move has a TELL phase (what the defender reads: ring, glow, badge, stick)
 * followed by an EFFECT phase (burst / spin). The parry window is the LAST
 * `windowSeconds` of the tell. Tell length is per-instance (it depends on the
 * attacker's Special Attack and the AI difficulty), so everything here takes
 * the actual tell duration instead of looking it up on the def.
 *
 * Right key inside the window → steal. Early / late / wrong key → whiff.
 */

import { ENABLED_MOVES, PARRY_WINDOW_FLOOR } from '../config/gameplay';

export type MoveId = 'spin' | 'crossover' | 'deke';

export interface MoveDef {
  id: MoveId;
  /** BASE tell duration in seconds (scaled per player / difficulty). */
  tell: number;
  /** Effect duration in seconds — also how long the DASH lasts. */
  effect: number;
  /** Dash speed (px/s) at the start of the effect, × the carrier's skill stat. */
  dash: number;
  /** Knockback strength applied to defenders in range. */
  knock: number;
  /** Radius around the carrier that gets knocked back. */
  knockRadius: number;
  /** How long knocked-back defenders are stunned (real separation). */
  stagger: number;
  /** Tell colour (readability layer; the badge SHAPE also differs per move). */
  color: number;
}

export const MOVE_DEFS: Record<MoveId, MoveDef> = {
  // Fast + cheap: short tell, modest payoff.
  spin: { id: 'spin', tell: 0.3, effect: 0.22, dash: 720, knock: 260, knockRadius: 60, stagger: 0.3, color: 0xff9f1c },
  // Slow + big: long tell (easy to parry), the biggest payoff.
  deke: { id: 'deke', tell: 0.5, effect: 0.28, dash: 880, knock: 340, knockRadius: 85, stagger: 0.45, color: 0xffd60a },
  // Built but disabled (see ENABLED_MOVES).
  crossover: { id: 'crossover', tell: 0.35, effect: 0.18, dash: 760, knock: 280, knockRadius: 55, stagger: 0.3, color: 0x4cc9f0 },
};

/** The moves currently in the game. */
export const ALL_MOVES: MoveId[] = ENABLED_MOVES;

/** Parry window length in seconds for a tell of `tell` seconds. */
export function windowSeconds(tell: number, frac: number): number {
  return Math.min(Math.max(tell * frac, PARRY_WINDOW_FLOOR), tell * 0.9);
}

export type ParryTiming = 'early' | 'success' | 'late';

/** Classify a parry press made `elapsed` seconds after the tell started. */
export function parryTiming(tell: number, elapsed: number, frac: number): ParryTiming {
  const open = tell - windowSeconds(tell, frac);
  if (elapsed < open) return 'early';
  if (elapsed <= tell) return 'success';
  return 'late';
}

/** Which phase of the move is `elapsed` seconds in. */
export function movePhase(tell: number, effect: number, elapsed: number): 'tell' | 'effect' | 'done' {
  if (elapsed < tell) return 'tell';
  if (elapsed < tell + effect) return 'effect';
  return 'done';
}

/**
 * Dash speed `ph` (0..1) of the way through the effect phase: held near full
 * speed, then easing out. A move used to be a one-shot velocity impulse that
 * friction ate in ~0.1s (it moved you ~7px more than just running); holding the
 * velocity for the whole effect phase is what makes a juke actually carry you
 * past the defender. Distance ≈ 0.85 × dash × effect × skill.
 */
export function dashSpeedAt(dashSpeed: number, ph: number): number {
  const p = Math.max(0, Math.min(1, ph));
  return dashSpeed * (1 - 0.45 * p * p);
}
