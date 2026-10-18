/**
 * Stat comparison helpers for the poach screen. Pure, no Phaser, unit-tested.
 * "Taken" = the player being pulled from the beaten team; "dropped" = the
 * player leaving the user's roster. Compares the six base stats.
 */
import type { PlayerDef } from '../config/teams';
import type { BaseStats } from './stats';

/** The six stats in display order. */
export const POACH_STATS = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'ATK' },
  { key: 'specialAttack', label: 'SPA' },
  { key: 'defense', label: 'DEF' },
  { key: 'specialDefense', label: 'SDF' },
  { key: 'speed', label: 'SPD' },
] as const;

export interface StatDelta {
  key: keyof BaseStats;
  label: string;
  /** Value on the player being taken in. */
  taken: number;
  /** Value on the player being dropped. */
  dropped: number;
  /** taken - dropped; positive = the swap improves this stat. */
  diff: number;
}

export function compareStats(taken: PlayerDef, dropped: PlayerDef): StatDelta[] {
  return POACH_STATS.map(({ key, label }) => ({
    key,
    label,
    taken: taken.stats[key],
    dropped: dropped.stats[key],
    diff: taken.stats[key] - dropped.stats[key],
  }));
}

/** +1 per stat that improves, -1 per stat that gets worse. Positive = net upgrade. */
export function netUpgrade(deltas: StatDelta[]): number {
  return deltas.reduce((n, d) => n + (d.diff > 0 ? 1 : d.diff < 0 ? -1 : 0), 0);
}

/** One player's overall rating: the mean of its six stats, rounded. */
export function overall(player: PlayerDef): number {
  const total = POACH_STATS.reduce((sum, { key }) => sum + player.stats[key], 0);
  return Math.round(total / POACH_STATS.length);
}

/** Mean overall rating of a group (e.g. a whole roster). 0 for an empty group. */
export function averageOverall(group: readonly PlayerDef[]): number {
  if (group.length === 0) return 0;
  return Math.round(group.reduce((sum, p) => sum + overall(p), 0) / group.length);
}
