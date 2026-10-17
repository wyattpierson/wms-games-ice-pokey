/**
 * Pokémon base stats → in-game hockey stats (pure, tunable).
 *
 *   HP              → health (not used yet)
 *   Attack          → shot / pass power
 *   Special Attack  → stick skills: juke burst size AND how fast the tell is
 *   Defense         → check strength: wall size + how long a stuffed juke stuns
 *   Special Defense → puck sense: parry window (fraction of the tell), goalie
 *                     saves, fast-puck grabs, AI read quality
 *   Speed           → skating speed
 *
 * Every mapping goes through `statNorm`, which stretches the REAL spread of
 * Pokémon stats (≈40–120) over the whole derived range — a 50 and a 100 should
 * play differently, for every move.
 */

import {
  BASE_SPEED, CHECK_RADIUS_BASE, CHECK_RADIUS_PER_DEF, CHECK_STUFF_REACH,
  PARRY_FRAC_MAX, PARRY_FRAC_MIN, SPEED_RANGE, STAT_HI, STAT_LO,
} from '../config/gameplay';

export interface BaseStats {
  hp: number;
  attack: number;
  specialAttack: number;
  defense: number;
  specialDefense: number;
  speed: number;
}

export interface HockeyStats {
  moveSpeed: number; // px/s
  shotPower: number; // multiplier on shot speed
  passPower: number; // multiplier on pass speed
  skill: number; // multiplier on skill-move burst
  tellMult: number; // multiplier on YOUR move's tell length (<1 = snappier, harder to read)
  checkPower: number; // 0..1 — check wall size / stuff stun
  parryFrac: number; // fraction of the attacker's tell that is the parry window
  puckSense: number; // 0..1 — saves / grabs / AI read
  maxHp: number;
}

/** 0..1 position of a base stat within the realistic stat range. */
export function statNorm(x: number): number {
  return Math.max(0, Math.min(1, (x - STAT_LO) / (STAT_HI - STAT_LO)));
}

export function deriveStats(s: BaseStats): HockeyStats {
  const n = statNorm;
  return {
    moveSpeed: BASE_SPEED + SPEED_RANGE * n(s.speed),
    shotPower: 0.75 + 0.6 * n(s.attack),
    passPower: 0.9 + 0.2 * n(s.attack),
    skill: 0.75 + 0.6 * n(s.specialAttack),
    tellMult: 1.1 - 0.25 * n(s.specialAttack),
    checkPower: n(s.defense),
    parryFrac: PARRY_FRAC_MIN + (PARRY_FRAC_MAX - PARRY_FRAC_MIN) * n(s.specialDefense),
    puckSense: 0.2 + 0.8 * n(s.specialDefense),
    maxHp: 30 + s.hp,
  };
}

/** Radius of a planted defender's wall (px). */
export function guardRadiusFor(checkPower: number): number {
  return CHECK_RADIUS_BASE + CHECK_RADIUS_PER_DEF * checkPower;
}

/** A juke resolving within this distance of a planted defender is stuffed. */
export function stuffRangeFor(checkPower: number): number {
  return guardRadiusFor(checkPower) + CHECK_STUFF_REACH;
}
