/**
 * How an AI defender decides to answer a carrier's tell (pure, testable).
 * Rolled ONCE per tell. The response is HONEST — it can fail:
 *   - it aims for the middle of the parry window but has TIMING ERROR
 *     (`aiTimingError`, shrinks with difficulty + puckSense), so it presses
 *     early or late and whiffs;
 *   - it can't press before `aiReaction` seconds, so a slow AI is simply late;
 *   - it can misread the move (picks the wrong key → whiff);
 *   - a check (guard) must be planted within CHECK_PREPLANT_GRACE of the tell starting to stuff the move.
 */

import type { Difficulty } from '../config/difficulty';
import { windowSeconds, type MoveId } from './moves';

export type AIPlan =
  | { kind: 'none' }
  | { kind: 'parry'; key: MoveId; at: number } // press `key` `at` seconds into the tell
  | { kind: 'guard'; at: number }; // plant a check `at` seconds into the tell

export interface PlanInput {
  moveId: MoveId;
  moves: MoveId[];
  /** The ACTUAL tell length of this carrier's move (seconds). */
  tell: number;
  /** The AI defender's parry window as a fraction of the tell (stats.parryFrac). */
  windowFrac: number;
  diff: Difficulty;
  puckSense: number; // 0..1 of THIS defender
  rng: () => number;
}

/** Standard normal from two uniforms (Box–Muller). */
function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

export function planAiResponse(i: PlanInput): AIPlan {
  const { diff, puckSense, rng, tell } = i;
  // Sharper defenders react faster and aim truer.
  const reaction = Math.max(0.03, diff.aiReaction * (1.05 - 0.5 * puckSense));
  const sigma = diff.aiTimingError * (1.25 - 0.5 * puckSense);

  const pParry = Math.min(1, diff.aiParryRate * (0.6 + 0.4 * puckSense));
  const r = rng();

  if (r < pParry) {
    // Aim for the middle of the window; can't press before reaction time.
    const win = windowSeconds(tell, i.windowFrac);
    const centre = tell - win / 2;
    const at = Math.max(reaction, centre) + gauss(rng) * sigma;
    let key = i.moveId;
    if (rng() >= diff.aiReadChance) {
      const others = i.moves.filter((m) => m !== i.moveId);
      if (others.length) key = others[Math.floor(rng() * others.length)];
    }
    return { kind: 'parry', key, at: Math.max(0.02, at) };
  }

  if (r < pParry + diff.aiGuardRate) {
    // A check only stuffs a move if it was up when the tell BEGAN (± CHECK_PREPLANT_GRACE), so a
    // reactive one is planted as early as the AI's reaction allows: quick/sharp defenders catch
    // you with it, slow ones are simply late and get juked (see GameScene.finishMove).
    return { kind: 'guard', at: Math.max(0.02, reaction * 0.9 + gauss(rng) * sigma * 0.35) };
  }
  return { kind: 'none' };
}
