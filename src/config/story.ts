/** Author narrative here instead of in scene code. Keep beats short, sparse, and easy to extend. */
import type { WorldStateSnapshot } from '../core/worldState';

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Optional future portrait texture key; omitted for all current story beats. */
  portraitKey?: string;
  portraitScale?: number;
}
export interface DialogueBeat {
  id: string; when: 'run-start' | 'run-loss' | 'match-before' | 'match-after' | 'island-intro' | 'boss-win' | 'tower-open' | 'year-champion';
  text: string; requiresFlag?: string; requiresNoFlag?: string; setFlag?: string; matchId?: string;
}
export interface StoryDialogue {
  flag: string;
  /** All flags are committed after the full dialogue completes, or immediately when lines is empty. */
  flags?: string[];
  lines: DialogueLine[];
}

/**
 * Annual opening examples:
 * - Year one has exactly one mysterious opening line.
 * - Later seasons are silent unless a meaningful saved-world milestone applies.
 * - Each milestone is a separate, short, copyable conditional beat.
 */
export function yearOpening(year: number, world?: WorldStateSnapshot): StoryDialogue {
  const flag = `story-year-${year}-opening`;
  const lines: DialogueLine[] = year === 1
    ? [{ speaker: 'UNKNOWN', text: 'Your first year begins. The Tower is listening.' }]
    : [];
  const flags = [flag];

  if (world?.bestTowerFloor && world.bestTowerFloor > 0) {
    lines.push({
      speaker: 'UNKNOWN',
      text: `You reached ${world.bestTowerFloor} Tower team${world.bestTowerFloor === 1 ? '' : 's'}. The next one is waiting.`,
    });
  }
  if (world?.allZonesClearedEver) {
    lines.push({ speaker: 'YOU', text: 'Every realm has fallen once. What is the Tower hiding?' });
  }
  if (world && world.starterStage > 0 && world.starterName) {
    lines.push({ speaker: world.starterName.toUpperCase(), text: 'I have changed. Something below is waiting.' });
  }
  if (world?.activeEventIds.includes('galarian-legendary-flyers') && !world.flags.includes('world-event-seen-galarian-legendary-flyers')) {
    lines.push({ speaker: 'UNKNOWN', text: 'The birds have changed. So has the world.' });
    flags.push('world-event-seen-galarian-legendary-flyers');
  }
  return { flag, flags, lines };
}

/** Most island visits are intentionally silent. Add a zone-specific beat here when one is ready. */
export function islandOpening(_zoneName: string, _year: number): DialogueLine[] {
  return [];
}

/** One-time, save-wide first visit to The Abyss. */
export function abyssFirstVisit(): DialogueLine[] {
  return [{ speaker: 'UNKNOWN', text: 'The fog moves against the wind. Something below knows your name.' }];
}

/** Short reward aftermath. The second-Coastal victory beat can replace this with a rarer line. */
export function bossVictory(zoneName: string, resourceName: string, _year: number, reward: 'resource' | 'recruit' | 'skipped' = 'resource'): DialogueLine[] {
  if (reward === 'resource') return [{ speaker: 'UNKNOWN', text: `${zoneName} is quiet now. The resource is yours.` }];
  if (reward === 'recruit') return [{ speaker: 'UNKNOWN', text: 'You took one of theirs. The resource remains.' }];
  return [{ speaker: 'UNKNOWN', text: `You left the ${resourceName}. It will wait.` }];
}

/** Fires exactly on the second all-time win against Coastal Circuit's boss. */
export function secondCoastalBossVictory(): DialogueLine[] {
  return [{ speaker: 'YOU', text: 'Last time, we survived. This time, we knew what to do.' }];
}

export function towerOpening(year: number, bossesDefeated: number): StoryDialogue {
  return {
    flag: `story-year-${year}-tower-open`,
    lines: [{ speaker: 'UNKNOWN', text: `Year ${year}. ${bossesDefeated} boss${bossesDefeated === 1 ? '' : 'es'} down. The Tower noticed.` }],
  };
}

/** Called when the year ends below its starting Tower record. */
export function yearEndReflection(world: WorldStateSnapshot): StoryDialogue | undefined {
  if (world.yearStartingBestTowerFloor <= 0 || world.towerFloor >= world.yearStartingBestTowerFloor) return undefined;
  return {
    flag: `story-year-${world.year}-fell-short-of-record`,
    lines: [{ speaker: 'YOU', text: 'I chased the old record and lost sight of the next shift.' }],
  };
}

export function yearChampion(year: number): StoryDialogue {
  return {
    flag: `story-year-${year}-champion`,
    lines: [{ speaker: 'UNKNOWN', text: `Year ${year} ends. The signal came from below the Tower.` }],
  };
}

/** Small templates for future story triggers. Actual one-off logic lives in the named functions above. */
export const STORY_BEATS: DialogueBeat[] = [
  { id: 'first-call', when: 'run-start', text: 'UNKNOWN: The Tower is listening.', requiresNoFlag: 'story-first-call-shown', setFlag: 'story-first-call-shown' },
  { id: 'first-loss', when: 'run-loss', text: 'YOU: I should have seen that coming.', requiresNoFlag: 'story-first-loss-shown', setFlag: 'story-first-loss-shown' },
];
