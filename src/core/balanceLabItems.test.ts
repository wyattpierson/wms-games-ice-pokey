import { describe, expect, it } from 'vitest';
import { ITEM_IDS, STARTER_EVOLUTIONS } from '../config/progression';
import { USER_TEAM } from '../config/teams';
import { buildBalanceLabPlayerTeam, canRetryBalanceLabLoss } from './balanceLabItems';

describe('Balance Lab item test harness', () => {
  it('applies species evolution items to a test roster without mutating the source team', () => {
    const originalNames = USER_TEAM.players.map(p => p.name);
    const team = buildBalanceLabPlayerTeam(USER_TEAM, [ITEM_IDS.evolvePikachu, ITEM_IDS.evolvePsyduck], 'larvitar');
    expect(team.players.find(p => p.name === 'Raichu')?.sprite).toBe(26);
    expect(team.players.find(p => p.name === 'Golduck')?.sprite).toBe(55);
    expect(USER_TEAM.players.map(p => p.name)).toEqual(originalNames);
  });

  it('inserts the selected final-form starter in slot one for Mega Band testing', () => {
    const team = buildBalanceLabPlayerTeam(USER_TEAM, [ITEM_IDS.megaEvolution], 'gible');
    const finalStage = STARTER_EVOLUTIONS.gible[STARTER_EVOLUTIONS.gible.length - 1];
    expect(team.players[0]).toMatchObject({ name: finalStage.name, sprite: finalStage.sprite, isStarter: true });
    expect(team.players[0].stats).toEqual(finalStage.stats);
    expect(USER_TEAM.players[0].name).toBe('Psyduck');
  });

  it('allows one retry only after a loss when Second Chance is selected', () => {
    expect(canRetryBalanceLabLoss([ITEM_IDS.secondChance], false, 2, 3)).toBe(true);
    expect(canRetryBalanceLabLoss([ITEM_IDS.secondChance], true, 2, 3)).toBe(false);
    expect(canRetryBalanceLabLoss([ITEM_IDS.secondChance], false, 3, 2)).toBe(false);
    expect(canRetryBalanceLabLoss([], false, 2, 3)).toBe(false);
  });
});
