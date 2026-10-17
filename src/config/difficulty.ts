/**
 * One knob — `level` 0..1 — drives how fast / sharp / aggressive the AI is.
 * Level 0 is the slow tutorial pace; level 1 is full speed. The campaign will
 * later map "wins so far" onto this (dev override: ?level=0..1).
 *
 * Every field is linearly interpolated between EASY (level 0) and HARD
 * (level 1), so there is exactly one place to tune the ramp.
 */

export interface Difficulty {
  level: number;
  /** Opponent skating speed multiplier. */
  aiSpeed: number;
  /** AI carrier tell length multiplier (longer = easier for you to read). */
  aiTellScale: number;
  /** Seconds before an AI defender can react to a tell (× a puckSense factor). A floor on press time. */
  aiReaction: number;
  /** Std-dev (s) of an AI press around the centre of the window. Big = often early/late → whiffs. */
  aiTimingError: number;
  /** Chance an AI defender tries a parry on a tell (× a puckSense factor). */
  aiParryRate: number;
  /** Chance an AI parry picks the RIGHT key (else it guesses the other move → whiff). */
  aiReadChance: number;
  /** Chance an AI defender answers a tell with a check (block) instead. */
  aiGuardRate: number;
  /** Per-second chance an AI defender plants a check in front of a non-juking carrier. */
  aiPressureGuard: number;
  /** Per-second chance an AI carrier jukes while a defender is within aiJukeRange. */
  aiJukeRate: number;
  aiJukeRange: number;
  /** Scales the AI carrier's move cooldown (lower = jukes more often). */
  aiMoveCdScale: number;
  /** Goalie reaction time (s) to a shot, × a puckSense factor (one-timers are slower still). */
  aiGoalieReact: number;
  /** Goalie skating-speed multiplier (the goalie must NOT be crippled by low levels). */
  aiGoalieSpeed: number;
  /** Chance an AI who receives a pass in shooting range one-times it. */
  aiOneTimerRate: number;
  /** Damage multiplier for checks thrown BY the opposing team (so level 0 doesn't punish). */
  aiCheckDamage: number;
  /** AI shot accuracy: aim is uniform in ±this × the goal mouth (>1 means it can shoot wide). */
  aiShotSpread: number;
  /** Show the key letter above a carrier's tell (learning aid; off at high levels). */
  showKeyHint: boolean;
}

type Numeric = Omit<Difficulty, 'level' | 'showKeyHint'>;

const EASY: Numeric = {
  aiSpeed: 0.55,
  aiTellScale: 1.7,
  aiReaction: 0.6,
  aiTimingError: 0.2,
  aiParryRate: 0.25,
  aiReadChance: 0.5,
  aiGuardRate: 0.2,
  aiPressureGuard: 0.4,
  aiJukeRate: 3.0,
  aiJukeRange: 170,
  aiMoveCdScale: 0.6,
  aiShotSpread: 1.4,
  aiGoalieReact: 0.2,
  aiGoalieSpeed: 0.9,
  aiOneTimerRate: 0.1,
  aiCheckDamage: 0.6,
};

const HARD: Numeric = {
  aiSpeed: 0.95,
  aiTellScale: 1.0,
  aiReaction: 0.17,
  aiTimingError: 0.035,
  aiParryRate: 0.4,
  aiReadChance: 0.95,
  aiGuardRate: 0.28,
  aiPressureGuard: 1.0,
  aiJukeRate: 1.8,
  aiJukeRange: 130,
  aiMoveCdScale: 1.0,
  aiShotSpread: 0.8,
  aiGoalieReact: 0.14,
  aiGoalieSpeed: 1.0,
  aiOneTimerRate: 0.45,
  aiCheckDamage: 1.0,
};

export const SHOW_KEY_HINT_BELOW_LEVEL = 0.7;
export const DEFAULT_LEVEL = 0;

export function difficultyAt(level: number): Difficulty {
  const t = Math.max(0, Math.min(1, level));
  const out: Record<string, number> = {};
  for (const k of Object.keys(EASY) as Array<keyof Numeric>) {
    out[k] = EASY[k] + (HARD[k] - EASY[k]) * t;
  }
  return { ...(out as unknown as Numeric), level: t, showKeyHint: t < SHOW_KEY_HINT_BELOW_LEVEL };
}
