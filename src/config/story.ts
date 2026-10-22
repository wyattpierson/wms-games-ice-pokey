/** Author narrative here instead of in scene code. Story data is intentionally small and editable. */
export interface DialogueLine { speaker: string; text: string }
export interface DialogueBeat {
  id: string; when: 'run-start' | 'run-loss' | 'match-before' | 'match-after' | 'island-intro' | 'boss-win' | 'tower-open' | 'year-champion';
  text: string; requiresFlag?: string; requiresNoFlag?: string; setFlag?: string; matchId?: string;
}

/** The yearly arc repeats its shape, but dialogue changes as the world remembers past years. */
export function yearOpening(year: number): { flag: string; lines: DialogueLine[] } {
  const flag = `story-year-${year}-opening`;
  const lines: DialogueLine[] = year <= 1 ? [
    { speaker: 'COACH', text: 'The Circuit runs on a calendar. When the last day passes, the Battle Tower opens—and the whole league watches who is ready.' },
    { speaker: 'YOU', text: 'Four islands, one year. We choose where to spend our time.' },
    { speaker: 'COACH', text: 'And every boss guards something the shop can’t get anywhere else. Make this season count.' },
  ] : [
    { speaker: 'COACH', text: `Year ${year}. The Circuit remembers last season, even if the roster changes and the standings reset.` },
    { speaker: 'YOU', text: 'Then we do it differently this time. More bosses, better preparation, or a straight shot at the Tower.' },
    { speaker: 'UNKNOWN SIGNAL', text: year === 2 ? 'The signal from the Tower has returned. It was not part of the official broadcast.' : `The signal is stronger now. Someone—or something—inside the Tower knows you keep coming back.` },
  ];
  return { flag, lines };
}

export function islandOpening(zoneName: string, year: number): DialogueLine[] {
  return [
    { speaker: 'SCOUT', text: `${zoneName}. Every island has its own circuit, and the boss holds a resource unique to this place.` },
    { speaker: 'COACH', text: year > 1 ? `We have been here before. This year, we decide whether the prize is worth the days.` : 'We cannot play every match before the year ends. Pick your fights.' },
  ];
}

export function bossVictory(zoneName: string, resourceName: string, year: number): DialogueLine[] {
  return [
    { speaker: 'COACH', text: `${zoneName}'s boss is down. That makes this island's ${resourceName} ours.` },
    { speaker: 'SCOUT', text: 'The Locker Room can use these for special offers. The resource stays with you between years.' },
    { speaker: 'UNKNOWN SIGNAL', text: year === 1 ? 'One island cleared. The Tower’s signal changes as each boss falls.' : `Year ${year}: another boss defeated. The signal from the Tower answers again.` },
  ];
}

export function towerOpening(year: number, bossesDefeated: number): { flag: string; lines: DialogueLine[] } {
  return { flag: `story-year-${year}-tower-open`, lines: [
    { speaker: 'ANNOUNCER', text: `The calendar is out. Year ${year}'s Battle Tower is open.` },
    { speaker: 'COACH', text: `${bossesDefeated} island boss${bossesDefeated === 1 ? '' : 'es'} defeated this year. Whatever we missed out there, we carry into the ladder.` },
    { speaker: 'UNKNOWN SIGNAL', text: 'You made it to the Tower again. Come find out who has been calling.' },
  ] };
}

export function yearChampion(year: number): { flag: string; lines: DialogueLine[] } {
  return { flag: `story-year-${year}-champion`, lines: [
    { speaker: 'ANNOUNCER', text: `The Battle Tower has a champion for Year ${year}. The Circuit has a new name to remember.` },
    { speaker: 'COACH', text: 'We made it through the year. The roster, the resources, the islands we chose—all of it brought us here.' },
    { speaker: 'UNKNOWN SIGNAL', text: 'Enjoy the win. The signal was never coming from the stands. It is coming from below the Tower.' },
  ] };
}

export const STORY_BEATS: DialogueBeat[] = [
  { id: 'first-call', when: 'run-start', text: 'Coach: The Circuit is bigger than one rink. Keep your head up, and keep moving.' },
  { id: 'first-loss', when: 'run-loss', text: 'Coach: A bad night is still data. The next year starts with what you learned.' },
];
