export interface AchievementDefinition {
  id: string;
  name: string;
  criteria: string;
  color: number;
  milestone: { kind: 'island'; zoneId: string } | { kind: 'tournament' } | { kind: 'starterGoals'; goals: number };
}

/** Add new trophies here; IDs are permanent save identifiers. */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'island-coastal', name: 'Seas the Day', criteria: 'Defeat the Coastal Circuit island boss for the first time.', color: 0x75bde0, milestone: { kind: 'island', zoneId: 'coastal' } },
  { id: 'island-summit', name: 'Peak Performance', criteria: 'Defeat the Summit League island boss for the first time.', color: 0xd5e8fa, milestone: { kind: 'island', zoneId: 'summit' } },
  { id: 'island-haunted', name: 'Boo, You Win!', criteria: 'Defeat the Haunted Rinks island boss for the first time.', color: 0xc5a1ed, milestone: { kind: 'island', zoneId: 'haunted' } },
  { id: 'island-abyss', name: 'Deep Sea Superstar', criteria: 'Defeat the Abyss island boss for the first time.', color: 0x73d2bb, milestone: { kind: 'island', zoneId: 'abyss' } },
  { id: 'tournament-champion', name: 'The Big Cup', criteria: 'Win all four rounds of the year-end tournament.', color: 0xf4c95d, milestone: { kind: 'tournament' } },
  { id: 'starter-goals-10', name: 'Little Goal Getter', criteria: 'Score 10 career goals with your starter, across any forms or saves.', color: 0x73d2a4, milestone: { kind: 'starterGoals', goals: 10 } },
  { id: 'starter-goals-20', name: 'Partner in Prime', criteria: 'Score 20 career goals with your starter, across any forms or saves.', color: 0x75bde0, milestone: { kind: 'starterGoals', goals: 20 } },
  { id: 'starter-goals-50', name: 'Fifty & Fabulous', criteria: 'Score 50 career goals with your starter, across any forms or saves.', color: 0xf4c95d, milestone: { kind: 'starterGoals', goals: 50 } },
];
