import type { Team } from '../config/teams';
import { ITEM_IDS, STARTER_EVOLUTIONS } from '../config/progression';
import { applyPermanentSpeciesEvolutionToTeam } from './permanentItems';
import type { StarterId } from '../state/metaStore';

/**
 * Prepare an isolated Balance Lab roster using selected permanent items.
 * This never writes to meta state. Mega Band uses slot 1 as a synthetic,
 * fully-evolved starter so the player can reliably test all three Mega forms.
 */
export function buildBalanceLabPlayerTeam(team: Team, itemIds: readonly string[], megaStarter: StarterId): Team {
  let prepared = applyPermanentSpeciesEvolutionToTeam(team, [...itemIds]);
  if (!itemIds.includes(ITEM_IDS.megaEvolution)) return prepared;

  const stages = STARTER_EVOLUTIONS[megaStarter];
  const finalStage = stages[stages.length - 1];
  const players = prepared.players.map((player, index) => index === 0
    ? { ...player, name: finalStage.name, sprite: finalStage.sprite, stats: { ...finalStage.stats }, isStarter: true }
    : player) as Team['players'];
  prepared = { ...prepared, players };
  return prepared;
}

/** Second Chance in Balance Lab is deliberately a single replay of a lost test match. */
export function canRetryBalanceLabLoss(
  itemIds: readonly string[], retryUsed: boolean, playerScore: number, opponentScore: number,
): boolean {
  return itemIds.includes(ITEM_IDS.secondChance) && !retryUsed && playerScore < opponentScore;
}
