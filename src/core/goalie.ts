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
  GOALIE_REPEAT_READ, GOALIE_RESPECT_GAIN, GOALIE_RESPECT_MAX,
} from '../config/gameplay';
import type { MoveId } from './moves';

export type GoalieStance = 'read' | 'bite' | 'hold';

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
