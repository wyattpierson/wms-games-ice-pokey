/** EDIT HERE: character identity and story pacing. Dialogue lives in story.ts. */
export const STORY_CHARACTERS = {
  player: { name: 'YOU', description: 'A young human coach determined to become the best.' },
  rival: { name: 'RILEY', description: 'A bratty young coach with a fully evolved partner.' },
  villain: { name: 'COACH VALEN', description: 'An extravagant champion who offers friendly advice.', revealedDescription: 'The same smiling coach, now openly cruel and hungry for power.' },
  signal: { name: 'UNKNOWN', revealedName: 'MIMIKYU', description: 'An escaped assistant to the captive Arceus, transmitting from the Tower.' },
  arceus: { name: 'ARCEUS', description: 'Weakened and confused; the true final opponent.' },
} as const;
export const STORY_RULES = {
  villainAccessesForCatastrophe: 2,
  championshipsToRestoreCoastal: 1,
  championshipsToRestoreSummit: 2,
  championshipsToFreeArceus: 3,
  mimikyuRevealAfterRound: 2,
  firstYearXpCap: 39,
  finalBossStatMultiplier: 1.25,
  matchXp: 5,
  bossXp: 10,
} as const;
export const RIVAL_STARTER = { larvitar: 'gible', gible: 'bagon', bagon: 'larvitar' } as const;

