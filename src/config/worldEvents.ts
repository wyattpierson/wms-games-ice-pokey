import type { PlayerDef, Team } from './teams';
import type { ZoneDefinition } from './progression';

/**
 * Inputs that can drive story and world changes. Keep these as derived campaign facts;
 * story flags record presentation, while these fields represent actual world state.
 */
export interface WorldConditionState {
  year: number;
  towerFloor: number;
  bestTowerFloor: number;
  previousYearTowerFloor: number;
  yearStartingBestTowerFloor: number;
  starterStage: number;
  starterName: string | null;
  everEnteredZones: string[];
  zoneBossWins: Record<string, number>;
  zonesClearedEver: string[];
  allZonesClearedEver: boolean;
  flags: string[];
}

export interface WorldEventCondition {
  minYear?: number;
  maxYear?: number;
  minTowerFloor?: number;
  minBestTowerFloor?: number;
  minPreviousYearTowerFloor?: number;
  minYearStartingBestTowerFloor?: number;
  minStarterStage?: number;
  minBossWins?: Record<string, number>;
  requireAllZonesCleared?: boolean;
  requireZonesCleared?: string[];
  requireZonesEntered?: string[];
  requireFlags?: string[];
  forbidFlags?: string[];
}

export interface TeamWorldOverride {
  teamId: string;
  name?: string;
  color?: number;
  colorDark?: number;
  /** Replaces the full four-player roster while preserving the team's stable ID. */
  players?: Team['players'];
}

export interface ZoneWorldOverride {
  zoneId: string;
  name?: string;
  theme?: string;
  description?: string;
  difficulty?: number;
  opponents?: string[];
  bossId?: string;
  resourceName?: string;
  resourceUnitName?: string;
  resourceDescription?: string;
}

export interface WorldEventDefinition {
  id: string;
  description: string;
  when: WorldEventCondition;
  teamOverrides?: TeamWorldOverride[];
  zoneOverrides?: ZoneWorldOverride[];
}

const s = (hp:number, attack:number, specialAttack:number, defense:number, specialDefense:number, speed:number) => ({ hp, attack, specialAttack, defense, specialDefense, speed });

/**
 * World changes are data-driven. This first event is deliberately a modest example:
 * in Year 6+, once the player has cleared at least two Tower floors in any year,
 * the Coastal Circuit's Legendary Flyers return in their Galarian forms.
 *
 * Add more conditions/effects here. Stable team and zone IDs must not change, because
 * campaign results and saved world progression refer to those IDs.
 */
export const WORLD_EVENTS: WorldEventDefinition[] = [
  {
    id: 'galarian-legendary-flyers',
    description: 'After Year 5, reaching Tower floor 2 changes the Coastal boss to the Galarian Legendary Birds.',
    when: { minYear: 6, minBestTowerFloor: 2 },
    teamOverrides: [{
      teamId: 'sky-raiders-coastal',
      name: 'The Galarian Flyers',
      players: [
        { name: 'Zapdos (Galarian)', sprite: 10170, stats: s(90, 120, 75, 85, 75, 100) },
        { name: 'Moltres (Galarian)', sprite: 10171, stats: s(90, 85, 115, 80, 100, 90) },
        { name: 'Articuno (Galarian)', sprite: 10169, stats: s(90, 80, 120, 85, 100, 95) },
        { name: 'Lapras', sprite: 131, goalie: true, stats: s(100, 65, 75, 80, 90, 55) },
      ] as Team['players'],
    }],
  },
];

/** A narrow helper so type errors surface when adding a data override for the wrong field. */
export function applyZoneOverride(zone: ZoneDefinition, override: ZoneWorldOverride): ZoneDefinition {
  const { zoneId: _zoneId, ...changes } = override;
  return { ...zone, ...changes };
}

export function clonePlayerOverride(player: PlayerDef): PlayerDef {
  return { ...player, stats: { ...player.stats } };
}
