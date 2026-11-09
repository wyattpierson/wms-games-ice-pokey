import { STORY_RULES } from '../config/storyCampaign';
export interface StoryProgress {
  villainAccesses: number; towerVisited: boolean; catastrophe: boolean;
  restorationWins: number; rivalBeaten: boolean; mimikyuKnown: boolean;
  happyEnding: boolean; arceusDefeated: boolean; settledYear: number;
  arceusAttemptYear: number;
}
export const freshStoryProgress = (): StoryProgress => ({ villainAccesses: 0, towerVisited: false, catastrophe: false, restorationWins: 0, rivalBeaten: false, mimikyuKnown: false, happyEnding: false, arceusDefeated: false, settledYear: 0, arceusAttemptYear: 0 });
export function settleStoryYear(story: StoryProgress, year: number, won: boolean): StoryProgress {
  if (story.settledYear >= year) return story;
  const next = { ...story, settledYear: year };
  if (won) {
    if (next.catastrophe) next.restorationWins++;
    else next.happyEnding = true;
  } else if (!next.happyEnding && !next.arceusDefeated) next.villainAccesses++;
  return checkCatastrophe(next);
}
export function checkCatastrophe(story: StoryProgress): StoryProgress {
  return { ...story, catastrophe: story.catastrophe || (!story.happyEnding && story.towerVisited && story.villainAccesses >= STORY_RULES.villainAccessesForCatastrophe) };
}
export const coastalMissing = (s: StoryProgress) => s.catastrophe && s.restorationWins < STORY_RULES.championshipsToRestoreCoastal;
export const summitCursed = (s: StoryProgress) => s.catastrophe && s.restorationWins < STORY_RULES.championshipsToRestoreSummit;
export const arceusAvailable = (s: StoryProgress, year: number) => s.restorationWins >= STORY_RULES.championshipsToFreeArceus && !s.arceusDefeated && s.arceusAttemptYear !== year;
