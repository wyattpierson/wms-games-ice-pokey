import type { CampaignState } from './campaign';
import type { BaseStats } from './stats';
import type { PlayerDef, Team } from '../config/teams';
import { ITEM_IDS, STARTER_EVOLUTIONS } from '../config/progression';
import type { StarterId } from '../state/metaStore';

const RAICHU_STATS: BaseStats = { hp: 60, attack: 90, specialAttack: 90, defense: 55, specialDefense: 80, speed: 110 };
const GOLDUCK_STATS: BaseStats = { hp: 80, attack: 82, specialAttack: 95, defense: 78, specialDefense: 80, speed: 85 };

/** Mega base stats based on Pokémon Champions' published Mega forms; the game maps these into hockey stats. */
export const MEGA_STARTER_FORMS: Record<StarterId, { name: string; sprite: number; stats: BaseStats }> = {
  larvitar: { name: 'Mega Tyranitar', sprite: 10049, stats: { hp: 100, attack: 164, defense: 150, specialAttack: 95, specialDefense: 120, speed: 71 } },
  gible: { name: 'Mega Garchomp', sprite: 10058, stats: { hp: 108, attack: 170, defense: 115, specialAttack: 120, specialDefense: 95, speed: 92 } },
  bagon: { name: 'Mega Salamence', sprite: 10089, stats: { hp: 95, attack: 145, defense: 130, specialAttack: 120, specialDefense: 90, speed: 120 } },
};

export function isStarterAtFinalEvolution(starter: StarterId | null, xp: Record<StarterId, number>): boolean {
  if (!starter) return false;
  const stages = STARTER_EVOLUTIONS[starter];
  return xp[starter] >= stages[stages.length - 1].at;
}

/** Apply permanent species upgrades to a single member of the player's roster. */
export function applyPermanentSpeciesEvolution(player: PlayerDef, unlocked: string[]): PlayerDef {
  if (unlocked.includes(ITEM_IDS.evolvePikachu) && (player.name === 'Pikachu' || player.sprite === 25)) {
    return { ...player, name: 'Raichu', sprite: 26, stats: { ...RAICHU_STATS } };
  }
  if (unlocked.includes(ITEM_IDS.evolvePsyduck) && (player.name === 'Psyduck' || player.sprite === 54)) {
    return { ...player, name: 'Golduck', sprite: 55, stats: { ...GOLDUCK_STATS } };
  }
  return player;
}

export function applyPermanentSpeciesEvolutionToTeam(team: Team, unlocked: string[]): Team {
  return { ...team, players: team.players.map(p => applyPermanentSpeciesEvolution(p, unlocked)) as Team['players'] };
}

export function applyPermanentSpeciesEvolutionToRun(state: CampaignState, unlocked: string[]): CampaignState {
  return {
    ...state,
    userTeam: applyPermanentSpeciesEvolutionToTeam(state.userTeam, unlocked),
    bench: (state.bench || []).map(p => applyPermanentSpeciesEvolution(p, unlocked)),
  };
}
