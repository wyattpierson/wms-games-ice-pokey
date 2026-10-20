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
export const FAST_PUCK_SPEED = 350; // above this, a grab is a skill contest, not automatic
export const SHOT_SPEED_MAX = 660;
export const SHOT_RANGE = 290; // AI shoots when closer than this to the goal

// Goalie
export const GOALIE_SAVE_RADIUS = 34;
export const GOALIE_SAVE_COOLDOWN = 0.6;
// Goalie AI: play the angle (stand between puck and goal centre), read the shot, then dive.
export const GOALIE_DEPTH = 90; // px "arc depth": shading = depth / puck distance from the goal line
export const GOALIE_DIVE_FACTOR = 1.35; // skating-speed multiplier while diving at a shot
export const GOALIE_SHOT_SPEED = 260; // puck speed at which it counts as a shot to react to
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
export const PARRY_CONE_HALF = 1.05; // rad (≈60°): a parry only counts from IN FRONT of the carrier (± this off its facing)
export const COUNTER_BURST = 330; // px/s a successful parry launches the defender
export const TUMBLE_TIME = 0.5; // s of tumble anim after a whiff / knockback

// Perfect shot: release with charge >= PERFECT_SHOT_CHARGE → bonus power + "!"
// The tell for the shooter is the enemy goalie flashing white while in the zone.
export const PERFECT_SHOT_CHARGE = 0.8;
export const PERFECT_SHOT_MULT = 1.18;
// The perfect zone is a WINDOW, not "hold long enough": after reaching full charge
// you get OVERCHARGE_GRACE seconds at full, then the charge bleeds away at
// OVERCHARGE_DECAY per second (dropping back under PERFECT_SHOT_CHARGE ends the window).
// Set OVERCHARGE_GRACE very large to get the old "holding is never worse" behaviour.
// ONE-TIMER: a shot right off a pass. While a pass is arriving, a Shoot press inside
// the window arms an instant, full-power shot that leaves the moment the puck touches
// the blade (a pre-/post-catch press both count). No wind-up → the goalie reads it late.
export const ONE_TIMER_LEAD = 0.45; // s before arrival the window opens
export const ONE_TIMER_GRACE = 0.18; // s after receiving that a press still counts
export const ONE_TIMER_MULT = 1.35; // shot speed multiplier (a perfect shot is 1.18) — instant AND hard
export const ONE_TIMER_RING_TIME = 0.9; // s of ring travel shown to the receiver
export const ONE_TIMER_REACT_MULT = 2.8; // the goalie reacts this much slower to one
export const OVERCHARGE_GRACE = 0.15;
export const OVERCHARGE_DECAY = 2.0;

// Shot aiming: while charging you are locked onto the goal; Up/Down slides a
// reticle along the goal mouth (-1 = top post … +1 = bottom post, always on net).
export const AIM_SLIDE_SPEED = 1.9; // reticle units per second while holding Up/Down
export const AIM_POST_MARGIN = 16; // px kept inside the posts at aim = ±1 (puck radius + slack)
export const CHARGE_SKATE = 0.6; // speed factor for left/right skating while charging (Up/Down aim instead)

// Check (defense, Enter/Shift) = a BLOCK. It never steals. The defender plants
// and becomes a wall: opponents can't push through, and a juke that resolves
// inside the wall is stuffed (burst cancelled, carrier staggered, puck kept).
export const CHECK_TIME = 0.55; // s the stance lasts
export const CHECK_COOLDOWN_BASE = 1.05; // s before the next check at 0 Defense…
export const CHECK_COOLDOWN_PER_DEF = 0.3; // …minus this × normalised Defense (a big checker can check again sooner)
export const CHECK_SLOW = 0.2; // speed factor while planted
// A check also HITS: an opponent who runs into the planted wall (or is within reach
// when the check is pressed) and isn't mid-move gets knocked back, stunned and damaged.
export const CHECK_HIT_REACH = 14; // px beyond the wall radius that a freshly-pressed check strikes
export const CHECK_RUNIN_MIN = 40; // px/s of closing speed that counts as "running into" the wall
// A check BUMPS: it stops the carrier's progress and sets them back a body or so, but NOT out of
// pressure range (skater friction is exp(-7t), so a bump of v px/s moves them ≈ v/7 px).
export const CHECK_BUMP_BASE = 110; // px/s bump at 0 Defense (× impact)…
export const CHECK_BUMP_PER_DEF = 90; // …+ this × normalised Defense
export const CHECK_PRESSURE_BASE = 0.28; // possession-pressure a landed check adds at 0 Defense (× impact)…
export const CHECK_PRESSURE_PER_DEF = 0.32; // …+ this × normalised Defense
export const CHECK_PREPLANT_GRACE = 0.1; // s: a check only STUFFS a juke if it was planted before the tell began (±this)
export const CHECK_STAGGER_BASE = 0.3; // s stun at 0 Defense (× impact)…
export const CHECK_STAGGER_PER_DEF = 0.25; // …+ this × normalised Defense
export const CHECK_DAMAGE_BASE = 12; // HP at 0 Defense…
export const CHECK_DAMAGE_PER_DEF = 22; // …+ this × normalised Defense; × impact (0.6–1.5 by closing speed)
export const HP_REGEN_DELAY = 3; // s without damage before HP starts to come back
export const HP_REGEN_RATE = 3; // HP per second once it does
export const CHECK_RADIUS_BASE = 30; // wall radius at 0 Defense…
export const CHECK_RADIUS_PER_DEF = 14; // …+ this × normalised Defense
export const CHECK_STUFF_REACH = 32; // a juke resolving within wall radius + this is stuffed (≥ PARRY_RANGE even at 0 Defense)
export const STUFF_STAGGER_BASE = 0.25; // s the stuffed carrier is stunned…
export const STUFF_STAGGER_PER_DEF = 0.3; // …+ this × normalised Defense

// ---------------------------------------------------------------------------
// Carrying the puck is a little slower than skating without it.
export const CARRY_SPEED_FACTOR = 0.9;

// Possession PRESSURE. A carrier who just skates with a defender on top of them
// slowly loses the puck: the meter fills while an opposing skater is within
// PRESSURE_RANGE, drains when nobody is, and resets on a pass / shot / juke.
// At 1.0 the puck is stripped loose toward the presser. A check adds to it.
export const PRESSURE_RANGE = 58; // px (centre to centre) at which a skater counts as pressing
export const PRESSURE_FILL_TIME = 1.6; // s one in-front presser needs to strip a standing carrier
export const PRESSURE_BEHIND_RATE = 0.5; // a presser BEHIND the carrier counts this much
export const PRESSURE_SECOND_PRESSER = 0.6; // each extra presser adds this × their own weight
export const PRESSURE_STAGGER_RATE = 1.5; // a stunned carrier is stripped this much faster
export const PRESSURE_DECAY = 1.5; // meter units / s when nobody is pressing
export const PRESSURE_LOCKOUT = 0.45; // s the stripped carrier can't re-grab (the presser gets first touch)
export const PRESSURE_STRIP_SPEED = 170; // px/s the puck pops toward the presser

// Goalies are part of the juke game too. A move started within GOALIE_FOOL_RANGE of the
// enemy goalie makes it roll a response once (core/goalie.ts):
//   READ  – it sees it coming. No bonus for you; if you land it within GOALIE_POKE_RANGE it SMOTHERS the puck.
//   BITE  – it commits to the fake side (GOALIE_BITE_OFFSET px off-centre, ignoring where the puck is). If the move lands, the goalie is
//           FOOLED for GOALIE_FOOL_TIME: slow, late to read a shot, and your next shot is a
//           snap shot (consumes the window). Open net on the side you cut to.
//   HOLD  – it just keeps tracking (with a little positioning lag).
// Every fool makes that goalie respect you more for a few seconds (more READs, esp. the same move).
export const GOALIE_FOOL_RANGE = 270;
export const GOALIE_POKE_RANGE = 70;
export const GOALIE_BITE_OFFSET = 40; // px from the CENTRE of the net the goalie commits to on the fake side (leaves the far corner open: net half-width is 60, save radius 34)
export const GOALIE_FOOL_TIME = 0.7;
export const GOALIE_FOOL_SPEED = 0.3; // goalie skating factor while fooled
export const GOALIE_FOOL_MIN_CHARGE = 0.8; // a tap during the window still leaves with this much charge (snap shot)
export const GOALIE_RESPECT_GAIN = 0.18;
export const GOALIE_RESPECT_MAX = 0.5;
export const GOALIE_RESPECT_DECAY = 0.07; // per second (≈ 6–7 s to forget a full fool)
export const GOALIE_REPEAT_READ = 0.15; // extra read chance for the SAME move that fooled it last
// The user's own goalie plays at a fixed, middling level (difficulty is about the OPPONENT's skill).
export const FRIENDLY_GOALIE_READ = 0.38;
export const FRIENDLY_GOALIE_BITE = 0.5;
export const FRIENDLY_GOALIE_LAG = 0.12;
