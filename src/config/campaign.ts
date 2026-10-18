/**
 * Campaign difficulty-ramp knobs (used by core/campaign.ts).
 *
 * The ramp maps "wins so far" onto the single AI `level` knob (0 = slow
 * tutorial pace, 1 = full speed, see config/difficulty.ts). The bigger
 * difficulty source is the CHAMPION team itself: elite player stats on top of
 * the highest AI level.
 */

/** AI level for the first match of a run. */
export const BASE_LEVEL = 0.15;

/** Extra AI level for every team beaten this run. */
export const LEVEL_PER_WIN = 0.25;

/** AI level for the champion, regardless of wins (it is already elite on paper). */
export const CHAMPION_LEVEL = 0.9;

/**
 * Saved-run rule: if the game is closed or refreshed while a match is being
 * played, is the run over (true: keeps "one-shot run" honest) or does the match
 * simply restart (false: forgiving)?
 */
export const ABANDONED_MATCH_ENDS_RUN = true;
