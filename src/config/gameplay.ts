/**
 * Gameplay tuning knobs. Everything feel-related lives here so playtest
 * adjustments never hunt through logic.
 */

export const PLAYER_RADIUS = 15;
export const GOALIE_RADIUS = 18;
export const PUCK_RADIUS = 5;

// Puck physics (free puck)
export const PUCK_FRICTION = 0.4; // exponential velocity decay per second
export const PUCK_WALL_DAMPING = 0.72;
export const PICKUP_RADIUS = 30; // distance from player center to take the loose puck
export const PICKUP_DELAY = 0.3; // s before the last taker may take the puck again

// Skating
export const BASE_SPEED = 150; // px/s at 0 Speed stat
export const SPEED_PER_STAT = 1.05; // moveSpeed = BASE_SPEED + speed * SPEED_PER_STAT
export const AI_SPEED_FACTOR = 0.9; // AI skates a touch slower than the same stat

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

// Parry layer (values locked by design, tuning later)
export const DOWN_TIME = 5; // s on the ice at 0 HP; full recovery on stand-up
export const PARRY_WINDOW_BASE = 0.16; // s
export const PARRY_WINDOW_PER_SPD = 0.2; // added at 100 Special Defense
export const WHIFF_TIME = 0.5; // stagger after a failed parry
export const CHECK_RANGE = 40;
export const CHECK_COOLDOWN = 1.0;

// Skill moves (jukes) — see core/moves.ts for per-move tells/bursts
export const MOVE_COOLDOWN = 1.2; // s between skill moves (on top of tell+effect)
export const PARRY_RANGE = 62; // defender must be this close to parry/check a carrier
export const COUNTER_BURST = 330; // px/s a successful parry launches the defender
export const TUMBLE_TIME = 0.5; // s of tumble anim after a whiff / knockback

// Perfect shot: release with charge >= PERFECT_SHOT_CHARGE → bonus power + "!"
// The tell for the shooter is the enemy goalie flashing white while in the zone.
export const PERFECT_SHOT_CHARGE = 0.8;
export const PERFECT_SHOT_MULT = 1.18;

// Checking (defense, Enter/Shift): safe push, chance to dislodge the puck
export const CHECK_PUSH = 260; // px/s added to the carrier
export const CHECK_DISLODGE_BASE = 0.35; // + 0.4 × (checker Defense / 100)

// AI parry layer
export const AI_PARRY_BASE = 0.12; // chance an AI defender commits to a parry
export const AI_PARRY_PER_SPD = 0.35; // + this × puckSense
export const AI_CHECK_CHANCE = 0.18; // else chance they plan a check instead
export const AI_MOVE_RATE = 0.9; // per-second chance an AI carrier jukes when threatened
export const AI_MOVE_RANGE = 110; // "threatened" = opponent closer than this
