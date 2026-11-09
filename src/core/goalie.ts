/**
 * How an AI goalie answers a skill move made near its net (pure, testable).
 * Rolled ONCE per move, like core/aiPlan.ts does for skaters:
 *   read  – the goalie sees it. No bonus for the carrier, and a smother if they land it point-blank.
 *   bite  – the goalie commits to the fake side; if the move lands the goalie is FOOLED (open net).
 *   hold  – no special reaction (it still tracks with a little lag).
 * Goalies the carrier has already beaten recently "respect" them (more reads), and a move that
 * fooled them last time is read even more — so one player can't just keep juking and scoring.
 */

import {
  SHOT_SPEED_MAX, GOALIE_REPEAT_READ, GOALIE_RESPECT_GAIN, GOALIE_RESPECT_MAX,
} from '../config/gameplay';
import type { MoveId } from './moves';

export type GoalieStance = 'read' | 'bite' | 'hold';

/** Inputs used to rank a goalie breakout option. Clearance distances are in rink pixels. */
export interface GoalieOutletOption {
  distance: number;
  /** Forward progress toward the opposing goal, normalized to -1..1. */
  forwardProgress: number;
  closestDefender: number;
  passLaneClearance: number;
}

/** Deterministic outlet score: safety matters more than moving up-ice quickly. */
export function goalieOutletScore(option: GoalieOutletOption): number {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const openReceiver = clamp01(option.closestDefender / 160);
  const clearLane = clamp01(option.passLaneClearance / 90);
  const forward = clamp01((option.forwardProgress + 1) / 2);
  const manageableRange = 1 - clamp01((option.distance - 80) / 320);
  return openReceiver * 0.42 + clearLane * 0.33 + forward * 0.17 + manageableRange * 0.08;
}

/** Pick the highest-scoring outlet among genuinely safe passing options. */
export function chooseGoalieOutlet<T extends GoalieOutletOption>(
  options: readonly T[],
  minReceiverClearance = 42,
  minPassLaneClearance = 22,
): T | null {
  return options
    .filter((option) => option.closestDefender >= minReceiverClearance && option.passLaneClearance >= minPassLaneClearance)
    .slice()
    .sort((a, b) => goalieOutletScore(b) - goalieOutletScore(a))[0] ?? null;
}

export interface GoalieReadInput {
  moveId: MoveId;
  /** The move that fooled this goalie last (null if none / forgotten). */
  lastFooled: MoveId | null;
  /** 0..GOALIE_RESPECT_MAX: how much this goalie respects the carrier right now. */
  respect: number;
  /** The goalie's puckSense 0..1. */
  puckSense: number;
  /** Base chance to read (difficulty), scaled by puckSense. */
  readBase: number;
  /** Of the moves NOT read, the share the goalie bites on (the rest it holds). */
  biteBase: number;
  rng: () => number;
}

/** Probability that the goalie READS this move. */
export function readChance(i: Pick<GoalieReadInput, 'moveId' | 'lastFooled' | 'respect' | 'puckSense' | 'readBase'>): number {
  const base = i.readBase * (0.55 + 0.9 * i.puckSense);
  const repeat = i.lastFooled === i.moveId ? GOALIE_REPEAT_READ : 0;
  return Math.max(0, Math.min(0.92, base + i.respect + repeat));
}

export function planGoalieResponse(i: GoalieReadInput): GoalieStance {
  const pRead = readChance(i);
  const r = i.rng();
  if (r < pRead) return 'read';
  const rest = (r - pRead) / Math.max(1e-6, 1 - pRead); // uniform 0..1 over the non-read mass
  return rest < i.biteBase ? 'bite' : 'hold';
}

/** Respect after being fooled once more. */
export function respectAfterFool(respect: number): number {
  return Math.min(GOALIE_RESPECT_MAX, respect + GOALIE_RESPECT_GAIN);
}

/** Earliest segment/circle contact, including a segment starting inside. */
export function segmentCircleContact(
  start: { x: number; y: number }, end: { x: number; y: number },
  centre: { x: number; y: number }, radius: number,
): number | null {
  const dx = end.x - start.x, dy = end.y - start.y;
  const ox = start.x - centre.x, oy = start.y - centre.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = ox * dx + oy * dy;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * A positioned goalie stops most shots; coverage and puck sense improve the
 * odds, while exceptional power can still beat it. One frame-independent roll.
 */
export function saveEncounterChance(
  sense: number, speed: number,
  start: { x: number; y: number }, end: { x: number; y: number },
  centre: { x: number; y: number }, radius: number,
): number {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const missDistance = length > 0 ? Math.abs(dx * (centre.y - start.y) - dy * (centre.x - start.x)) / length : radius;
  const coverage = Math.max(0, 1 - missDistance / radius);
  const powerPenalty = 0.1 * Math.max(0, speed / SHOT_SPEED_MAX - 1);
  return Math.max(0.55, Math.min(0.98, 0.82 + 0.12 * sense + 0.12 * coverage - powerPenalty));
}
