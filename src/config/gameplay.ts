/**
 * Gameplay tuning knobs. Everything feel-related lives here so playtest
 * adjustments never hunt through logic.
 */

import type { MoveId } from '../core/moves';

/** Which skill moves exist right now. Crossover is built but disabled (2 moves are easier to learn). */
export const ENABLED_MOVES: MoveId[] = ['spin', 'deke'];

// Stat normalisation: a base stat is mapped onto 0..1 across [STAT_LO, STAT_HI]
// so the REAL spread of Pokémon stats (≈40–120) uses the whole derived range.
export const STAT_LO = 40;
export const STAT_HI = 120;

export const PLAYER_RADIUS = 15;
export const GOALIE_RADIUS = 18;
export const PUCK_RADIUS = 5;

// Puck physics (free puck)
export const PUCK_FRICTION = 0.4; // exponential velocity decay per second
export const PUCK_WALL_DAMPING = 0.72;
export const PICKUP_RADIUS = 30; // distance from player center to take the loose puck
export const PICKUP_DELAY = 0.3; // s before the last taker may take the puck again

// Skating
export const BASE_SPEED = 150; // px/s at the bottom of the stat range
export const SPEED_RANGE = 140; // + this × normalised Speed (so 150..290 px/s)
export const AI_SPEED_FACTOR = 0.9; // the user's AI TEAMMATES skate at this × stat speed (opponents: see difficulty.ts)

// Passing / shooting
export const PASS_SPEED = 470;
export const CHARGE_TIME = 0.65; // s from tap to full charge
export const SHOT_SPEED_MIN = 430;
export const SHOT_SPREAD = 0.5; // max corner angle (rad) when shooting at the goal
export const FAST_PUCK_SPEED = 350; // above this, a grab is a skill contest, not automatic
export const SHOT_SPEED_MAX = 660;
export const SHOT_RANGE = 290; // AI shoots when closer than this to the goal

// Goalie
export const GOALIE_SAVE_RADIUS = 34;
export const GOALIE_SAVE_COOLDOWN = 0.6;
export const GOALIE_SAVE_DEFLECT_SPEED = 230;

// Match
export const GOALS_TO_WIN = 3;
export const DROP_TIME = 1.3; // s of positioning after a puck drop
export const GOAL_PAUSE = 1.9; // s to celebrate a goal

// Parry layer
export const DOWN_TIME = 5; // s on the ice at 0 HP; full recovery on stand-up (not implemented yet)
// Parry window = a FRACTION of the tell, scaled by the defender's Special Defense.
// (A fraction — not seconds clamped to the tell — so SpD matters for every move.)
export const PARRY_FRAC_MIN = 0.35; // window / tell at the bottom of the stat range
export const PARRY_FRAC_MAX = 0.75; // window / tell at the top
export const PARRY_WINDOW_FLOOR = 0.07; // s — never narrower than this
export const WHIFF_TIME = 0.5; // stagger after a failed parry

// Skill moves (jukes) — see core/moves.ts for per-move tells/bursts
export const MOVE_COOLDOWN = 1.2; // s between skill moves (on top of tell+effect)
export const TELL_STEER = 0.45; // speed factor while winding up a move (you can still shuffle + aim the burst)
export const PARRY_RANGE = 62; // defender must be this close to parry/stuff a carrier
export const COUNTER_BURST = 330; // px/s a successful parry launches the defender
export const TUMBLE_TIME = 0.5; // s of tumble anim after a whiff / knockback

// Perfect shot: release with charge >= PERFECT_SHOT_CHARGE → bonus power + "!"
// The tell for the shooter is the enemy goalie flashing white while in the zone.
export const PERFECT_SHOT_CHARGE = 0.8;
export const PERFECT_SHOT_MULT = 1.18;

// Check (defense, Enter/Shift) = a BLOCK. It never steals. The defender plants
// and becomes a wall: opponents can't push through, and a juke that resolves
// inside the wall is stuffed (burst cancelled, carrier staggered, puck kept).
export const CHECK_TIME = 0.55; // s the stance lasts
export const CHECK_COOLDOWN = 1.1; // s before the next check
export const CHECK_SLOW = 0.2; // speed factor while planted
export const CHECK_RADIUS_BASE = 30; // wall radius at 0 Defense…
export const CHECK_RADIUS_PER_DEF = 14; // …+ this × normalised Defense
export const CHECK_STUFF_REACH = 32; // a juke resolving within wall radius + this is stuffed (≥ PARRY_RANGE even at 0 Defense)
export const STUFF_STAGGER_BASE = 0.25; // s the stuffed carrier is stunned…
export const STUFF_STAGGER_PER_DEF = 0.3; // …+ this × normalised Defense
