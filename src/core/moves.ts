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
import type { Vec2 } from './vec2';

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
  /** Dash heading offset (rad, off the aim) at the START of the dash. Signed by the move's side. */
  headFrom: number;
  /** …and at the END. from ≠ to is a CURVE (Spin: swing out, curve back round); from = to is a straight line. */
  headTo: number;
  /** ZIG-ZAG: the heading also weaves ± this many rad around the line above (Deke: a sidestep that zig-zags). */
  zigAmp?: number;
  /** …and this many full weave cycles over the dash (1.5 = out, back, out). */
  zigCycles?: number;
  /** Tell colour (readability layer; the badge SHAPE also differs per move). */
  color: number;
}

export const MOVE_DEFS: Record<MoveId, MoveDef> = {
  // Fast + cheap: short tell, modest payoff.
  spin: { id: 'spin', tell: 0.3, effect: 0.22, dash: 720, knock: 260, knockRadius: 60, stagger: 0.3, headFrom: 0.95, headTo: 0, color: 0xff9f1c },
  // Slow + big: long tell (easy to parry). A zig-zag SIDESTEP: it barely moves you toward the goal
  // (≈10px) but slides you ≈115px across the ice (85–155 by skill) — the way to create a shooting
  // angle on a goalie (and to get out of a defender's parry cone). Tuned numerically in the notes.
  deke: {
    id: 'deke', tell: 0.5, effect: 0.32, dash: 580, knock: 280, knockRadius: 70, stagger: 0.4,
    headFrom: 1.5, headTo: 1.5, zigAmp: 0.9, zigCycles: 1.5, color: 0xffd60a,
  },
  // Built but disabled (see ENABLED_MOVES).
  crossover: { id: 'crossover', tell: 0.35, effect: 0.18, dash: 760, knock: 280, knockRadius: 55, stagger: 0.3, headFrom: 0.9, headTo: 0.9, color: 0x4cc9f0 },
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

/**
 * Heading (rad) of the dash `ph` (0..1) of the way through the effect phase.
 *   Spin  → swings out sideways then CURVES back round (you wrap around the defender
 *           and exit past them, still facing your aim);
 *   Deke  → a straight line at a fixed angle off the aim (it fakes the other way, then
 *           cuts — you exit angled off to the side).
 * `side` is +1/−1 and is chosen to go AWAY from the nearest defender.
 */
export function dashHeading(def: MoveDef, aim: number, side: 1 | -1, ph: number): number {
  const p = Math.max(0, Math.min(1, ph));
  const smooth = p * p * (3 - 2 * p);
  // Zig-zag moves weave around the base line: starts leaning forward of it, swings back across it, …
  const zig = def.zigAmp ? -def.zigAmp * Math.cos(Math.PI * 2 * (def.zigCycles ?? 1) * p) : 0;
  return aim + side * (def.headFrom + (def.headTo - def.headFrom) * smooth + zig);
}

/**
 * Which way (screen-y sign: −1 up / +1 down / 0 = mostly along x) a move carries `aim`-facing
 * skater sideways overall. The goalie uses it to know which side is the FAKE (it bites the
 * opposite way) and which is OPEN (where the move ends up).
 */
export function lateralSignY(def: MoveDef, aim: number, side: 1 | -1): -1 | 0 | 1 {
  let y = 0;
  const N = 24;
  for (let i = 0; i < N; i++) y += Math.sin(dashHeading(def, aim, side, (i + 0.5) / N)) * (1 - 0.45 * (i / N) ** 2);
  const mean = y / N;
  return Math.abs(mean) < 0.18 ? 0 : mean > 0 ? 1 : -1;
}

/** Side (+1 = clockwise on screen, −1 = counter) a stick direction `dir` asks for, relative to `base` (null if not sideways enough). */
export function sideFromStick(base: number, dir: Vec2): 1 | -1 | null {
  const cross = Math.cos(base) * dir.y - Math.sin(base) * dir.x;
  return Math.abs(cross) < 0.5 ? null : cross > 0 ? 1 : -1;
}

/** Which way to go (+1 = clockwise on screen / −1) so the move heads AWAY from `threat`. */
export function sideAwayFrom(facing: number, pos: Vec2, threat: Vec2 | null): 1 | -1 {
  if (!threat) return 1;
  const cross = Math.cos(facing) * (threat.y - pos.y) - Math.sin(facing) * (threat.x - pos.x);
  return cross > 0 ? -1 : 1;
}

/** Is `at` inside the cone of half-angle `half` centred on `facing` from `from`? (a point on top of `from` counts) */
export function inFrontCone(facing: number, from: Vec2, at: Vec2, half: number): boolean {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  if (dx * dx + dy * dy < 16) return true;
  let d = Math.atan2(dy, dx) - facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= half;
}
