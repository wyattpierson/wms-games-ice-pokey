/**
 * Pokémon base stats → in-game hockey stats (pure, tunable weights).
 *
 * User-facing mapping (locked direction):
 *   HP   → health (hits from checks before going down)
 *   Attack           → shot / pass power
 *   Special Attack   → stick skills (skill-move burst, cooldowns)
 *   Defense          → checking power (damage, pushback, dislodge)
 *   Special Defense  → puck sense (parry window, intercepts, goalie saves)
 *   Speed            → movement speed
 */

import { BASE_SPEED, PARRY_WINDOW_BASE, PARRY_WINDOW_PER_SPD, SPEED_PER_STAT } from '../config/gameplay';

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
  skill: number; // multiplier on skill-move burst / quality
  checkPower: number; // raw check damage (0–100 scale)
  parryWindow: number; // seconds — width of the successful-parry window
  puckSense: number; // 0..1 — intercept / save skill
  maxHp: number;
}

export function deriveStats(s: BaseStats): HockeyStats {
  return {
    moveSpeed: BASE_SPEED + s.speed * SPEED_PER_STAT,
    shotPower: 0.75 + (s.attack / 100) * 0.5,
    passPower: 0.9 + (s.attack / 100) * 0.2,
    skill: 0.8 + (s.specialAttack / 100) * 0.5,
    checkPower: s.defense,
    parryWindow: PARRY_WINDOW_BASE + (s.specialDefense / 100) * PARRY_WINDOW_PER_SPD,
    puckSense: s.specialDefense / 100,
    maxHp: 30 + s.hp,
  };
}
