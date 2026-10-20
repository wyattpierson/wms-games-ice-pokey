/**
 * Possession pressure (pure). A carrier with opposing skaters on top of them loses the puck
 * over time unless they DO something (pass, shoot, juke). See config/gameplay.ts.
 */

import {
  PRESSURE_BEHIND_RATE, PRESSURE_DECAY, PRESSURE_FILL_TIME, PRESSURE_SECOND_PRESSER, PRESSURE_STAGGER_RATE,
} from '../config/gameplay';

export interface Presser {
  /** True if the presser is in FRONT of (or beside) the carrier, false if chasing from behind. */
  front: boolean;
}

/** Meter units per second the given pressers add to a carrier (0 if none). Nearest presser first. */
export function pressureRate(pressers: Presser[], carrierStunned: boolean): number {
  let w = 0;
  pressers.forEach((p, i) => {
    let wt = p.front ? 1 : PRESSURE_BEHIND_RATE;
    if (i > 0) wt *= PRESSURE_SECOND_PRESSER;
    w += wt;
  });
  return (w / PRESSURE_FILL_TIME) * (carrierStunned ? PRESSURE_STAGGER_RATE : 1);
}

/** One step of the meter: fills at `rate × scale` while pressed, drains otherwise. Clamped 0..1. */
export function stepPressure(meter: number, pressers: Presser[], carrierStunned: boolean, scale: number, dt: number): number {
  if (pressers.length === 0) return Math.max(0, meter - PRESSURE_DECAY * dt);
  return Math.min(1, meter + pressureRate(pressers, carrierStunned) * scale * dt);
}
