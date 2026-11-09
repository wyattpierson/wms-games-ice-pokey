import { STORY_CHARACTERS as C, STORY_RULES } from './storyCampaign';
import { getMeta } from '../state/metaStore';
/** Author narrative here instead of in scene code. Keep beats short, sparse, and easy to extend. */
import type { WorldStateSnapshot } from '../core/worldState';

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Optional inline portrait override; speakers otherwise use the story portrait stage. */
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
export function yearOpening(year: number, _world?: WorldStateSnapshot): StoryDialogue {
  const flag = `story-year-${year}-opening`;
  const lines: DialogueLine[] = year === 1 ? [
    { speaker: 'INVITATION', text: 'You are invited to the year-end Battle Tower championship. Sixteen teams. One champion. Your season starts now.' },
    { speaker: C.player.name, text: 'This is our chance. We’re going to be the best team in the world.' },
    { speaker: C.rival.name, text: 'You brought THAT little thing? Mine’s already fully evolved. Try not to cry when we meet at the Tower.' },
    { speaker: C.villain.name, text: 'Everyone starts somewhere. Visit the islands, strengthen your team, and make every day count.' },
    { speaker: C.signal.name, text: '…can you hear… hurry…' },
  ] : year === 2 && !getMeta().story.catastrophe && !getMeta().story.happyEnding ? [{ speaker: C.signal.name, text: "Please… get to the Tower. There isn’t much time." }] : [];
  const flags = [flag];
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

export function towerOpening(year: number, _bossesDefeated: number): StoryDialogue {
  return {
    flag: `story-year-${year}-tower-open`,
    lines: [{ speaker: 'ANNOUNCER', text: `Welcome to the Year ${year} championship! Sixteen teams enter. Your first opponent is ${C.rival.name}.` }],
  };
}

/** Called when the year ends below its starting Tower record. */
export function yearEndReflection(world: WorldStateSnapshot): StoryDialogue | undefined {
  if (getMeta().story.settledYear === world.year && getMeta().towerFloor >= 4) return undefined;
  return {
    flag: `story-year-${world.year}-loss-reflection`,
    lines: [{ speaker: C.player.name, text: world.towerFloor >= 3
      ? 'One match away. That hurts. But now I know we can win this.'
      : world.towerFloor >= 1 ? 'We belong in that tournament. Next year, we go further.'
      : getMeta().story.towerVisited ? 'I hate losing to that kid. We need more training. We’ll be back.'
      : 'We didn’t even make the tournament. I’m upset, but I’m not giving up.' }],
  };
}

export function yearChampion(year: number): StoryDialogue {
  const story = getMeta().story;
  const text = !story.catastrophe
    ? 'We’re champions! Everything feels peaceful… like we stopped something terrible before it could happen.'
    : story.restorationWins === STORY_RULES.championshipsToRestoreCoastal
    ? 'The coast is back. I can hear the waves again. There’s more we can fix.'
    : story.restorationWins === STORY_RULES.championshipsToRestoreSummit
    ? 'The Summit is calm again. The birds have kept their new forms. They look magnificent.'
    : story.restorationWins >= STORY_RULES.championshipsToFreeArceus
    ? 'The seal is broken. Arceus is free… but it doesn’t recognize us. There’s one last match.'
    : 'The Tower’s power is healing the world. We have to keep going.';
  return { flag: `story-year-${year}-champion`, lines: [{ speaker: C.player.name, text }] };
}

/** EDIT HERE: milestone dialogue. Flags are identifiers, not character names. */
export function pendingStory(): StoryDialogue | undefined {
  const { story: s, flags } = getMeta();
  if (s.catastrophe && !flags.includes('story-catastrophe')) return {
    flag: 'story-catastrophe', lines: [
      { speaker: C.villain.name, text: 'Such promising little coaches. You were so busy chasing a trophy that you never asked what it unlocks.' },
      { speaker: C.villain.name, text: 'Yveltal. Darkrai. Giratina. Zygarde. The Tower is ours. Let the world learn who its champion is!' },
      { speaker: C.player.name, text: 'The coast… it’s gone. And something’s wrong with the Summit.' },
      { speaker: s.mimikyuKnown ? C.signal.revealedName : C.signal.name, text: 'I tried to warn you. Win the Tower. You can still put this right.' },
    ],
  };
  if (s.mimikyuKnown && !flags.includes('story-mimikyu')) return {
    flag: 'story-mimikyu', lines: [
      { speaker: C.signal.revealedName, text: 'It was me. The signal. I’ve been trying to help you reach this place.' },
      { speaker: C.player.name, text: 'You’re a Mimikyu? Why are you hiding here?' },
      { speaker: C.signal.revealedName, text: s.catastrophe ? 'I served Arceus. They captured it, and I escaped. The champion’s power can heal what it has broken.' : 'Someone I care about is trapped here. Please keep winning. I’ll explain when it’s safe.' },
    ],
  };
  if (s.arceusDefeated && !flags.includes('story-restored')) return { flag: 'story-restored', lines: [
    { speaker: C.arceus.name, text: 'I mistook your strength for theirs. Now I understand. You and Mimikyu brought me home.' },
    { speaker: C.signal.revealedName, text: 'You heard me. Even through all that noise.' },
    { speaker: C.player.name, text: 'The world is whole again. Come on, everyone. Let’s go home.' },
  ] };
  return undefined;
}

export function arceusOpening(): DialogueLine[] { return [
  { speaker: C.arceus.name, text: 'Another coach seeking my power? Then face my judgment.' },
  { speaker: C.signal.revealedName, text: 'It’s still confused. Show it who you are. I’ll be here if you need to try again.' },
]; }

/** Small templates for future story triggers. Actual one-off logic lives in the named functions above. */
export const STORY_BEATS: DialogueBeat[] = [
  { id: 'first-call', when: 'run-start', text: 'UNKNOWN: The Tower is listening.', requiresNoFlag: 'story-first-call-shown', setFlag: 'story-first-call-shown' },
  { id: 'first-loss', when: 'run-loss', text: 'YOU: I should have seen that coming.', requiresNoFlag: 'story-first-loss-shown', setFlag: 'story-first-loss-shown' },
];

/** Quiet advice on the map, rather than another interrupting conversation. */
export function coachAdvice(): string {
  return getMeta().story.catastrophe ? '' : `${C.villain.name}: A good coach prepares. Train, recruit, and visit the shop before tournament day.`;
}
