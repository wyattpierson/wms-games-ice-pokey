/**
 * Skill-move (juke) + parry timing model (pure — no Phaser).
 *
 * A move has a TELL phase (the stick flashes the move's color; this is what the
 * defender reads) followed by an EFFECT phase (burst / spin / cut). The
 * parryable window is the LAST `effectiveWindow` seconds of the tell — the
 * stick's bright phase is the visual for it. Pressing the matching key inside
 * that window succeeds; early/late/wrong-key = whiff.
 *
 * Visual readability contract (see Player.draw):
 *   - tell progress <  0.45  → dim flicker ("a move is coming, which one?")
 *   - tell progress >= 0.45  → bright flash ("NOW is the parry window")
 * The 0.45 mark is generous vs the stat-scaled window (<= 0.7 × tell) so the
 * bright phase always contains the actual window.
 */

export type MoveId = 'spin' | 'crossover' | 'deke';

export interface MoveDef {
  id: MoveId;
  /** Tell (flash) duration in seconds — longer tell = bigger payoff. */
  tell: number;
  /** Effect (animation/rotation) duration in seconds. */
  effect: number;
  /** Burst (px/s added to the carrier) if unparried, scaled by skill. */
  burst: number;
  /** Knockback strength applied to defenders in range. */
  knock: number;
  /** Radius around the carrier that gets knocked back. */
  knockRadius: number;
  /** Tell flash color (the readability layer). */
  color: number;
}

export const MOVE_DEFS: Record<MoveId, MoveDef> = {
  spin: { id: 'spin', tell: 0.3, effect: 0.22, burst: 170, knock: 260, knockRadius: 55, color: 0xff9f1c },
  crossover: { id: 'crossover', tell: 0.35, effect: 0.18, burst: 220, knock: 280, knockRadius: 55, color: 0x4cc9f0 },
  deke: { id: 'deke', tell: 0.45, effect: 0.22, burst: 260, knock: 340, knockRadius: 75, color: 0xffd60a },
};

export const ALL_MOVES: MoveId[] = ['spin', 'crossover', 'deke'];

/**
 * The parry window is scaled by the DEFENDER's SpD (puckSense), so clamp it to
 * fit inside the tell.
 */
export function effectiveWindow(id: MoveId, window: number): number {
  return Math.min(Math.max(window, 0.05), MOVE_DEFS[id].tell * 0.7);
}

export type ParryTiming = 'early' | 'success' | 'late';

/**
 * Classify a parry press made `tellElapsed` seconds after the tell started.
 * The window is the last `effectiveWindow(id, window)` seconds of the tell.
 */
export function parryTiming(id: MoveId, tellElapsed: number, window: number): ParryTiming {
  const def = MOVE_DEFS[id];
  const open = def.tell - effectiveWindow(id, window);
  if (tellElapsed < open) return 'early';
  if (tellElapsed <= def.tell) return 'success';
  return 'late';
}

/** Which phase of the move is `tellElapsed` seconds in. */
export function movePhase(id: MoveId, tellElapsed: number): 'tell' | 'effect' | 'done' {
  const def = MOVE_DEFS[id];
  if (tellElapsed < def.tell) return 'tell';
  if (tellElapsed < def.tell + def.effect) return 'effect';
  return 'done';
}
