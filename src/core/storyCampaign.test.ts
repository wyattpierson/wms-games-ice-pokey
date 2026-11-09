import { beforeEach, describe, expect, it } from 'vitest';
import { freshStoryProgress, settleStoryYear, checkCatastrophe, coastalMissing, summitCursed, arceusAvailable } from './storyCampaign';
import { createBracket, bracketOpponent } from './tournament';
import { resetMetaState, updateMeta, getMeta, awardMatch, beginNewYear } from '../state/metaStore';
import { pendingStory } from '../config/story';
import { teamById } from './campaign';

beforeEach(() => resetMetaState());
describe('story campaign', () => {
  it('counts losses once, waits for a Tower visit, and never triggers after an early happy ending', () => {
    let s = settleStoryYear(freshStoryProgress(), 1, false);
    expect(settleStoryYear(s, 1, false)).toEqual(s);
    s = settleStoryYear(s, 2, false);
    expect(s.villainAccesses).toBe(2);
    expect(s.catastrophe).toBe(false);
    expect(checkCatastrophe({ ...s, towerVisited: true }).catastrophe).toBe(true);
    const happy = settleStoryYear(freshStoryProgress(), 1, true);
    expect(settleStoryYear({ ...happy, towerVisited: true }, 2, false).catastrophe).toBe(false);
  });
  it('restores the two islands in order and keeps Arceus available in later years after a defeat', () => {
    let s = { ...freshStoryProgress(), catastrophe: true };
    expect(coastalMissing(s)).toBe(true);
    s = settleStoryYear(s, 3, true);
    expect(coastalMissing(s)).toBe(false);
    expect(summitCursed(s)).toBe(true);
    s = settleStoryYear(s, 4, true);
    expect(summitCursed(s)).toBe(false);
    s = settleStoryYear(s, 5, true);
    expect(arceusAvailable(s, 5)).toBe(true);
    s.arceusAttemptYear = 5;
    expect(arceusAvailable(s, 5)).toBe(false);
    expect(arceusAvailable(s, 6)).toBe(true);
    expect(arceusAvailable({ ...s, arceusDefeated: true }, 6)).toBe(false);
  });
  it('caps first-year XP below evolution, then resumes growth in year two', () => {
    updateMeta({ starter: 'gible', yearStarted: true });
    for (let i = 0; i < 30; i++) awardMatch(true, true);
    expect(getMeta().starterXp.gible).toBe(39);
    beginNewYear(); awardMatch(true);
    expect(getMeta().starterXp.gible).toBe(44);
  });
  it('uses a different fully evolved rival partner and improves the rematch roster', () => {
    updateMeta({ starter: 'larvitar' });
    const first = teamById('story-rival');
    expect(first.players[0].name).toBe('Garchomp');
    updateMeta({ story: { ...getMeta().story, rivalBeaten: true } });
    expect(teamById('story-rival').players[1].name).not.toBe(first.players[1].name);
  });
  it('reveals Mimikyu without spoiling the catastrophe, and prioritizes the disaster when needed', () => {
    updateMeta({ story: { ...getMeta().story, mimikyuKnown: true } });
    expect(pendingStory()?.flag).toBe('story-mimikyu');
    expect(pendingStory()?.lines.map(l => l.text).join(' ')).not.toContain('captured');
    updateMeta({ story: { ...getMeta().story, catastrophe: true } });
    expect(pendingStory()?.flag).toBe('story-catastrophe');
  });
});

describe('sixteen-team tournament', () => {
  it('generates unique entrants and consistent advancement with rival first and villain last', () => {
    for (let n = 0; n < 20; n++) {
      const b = createBracket(n, false);
      expect(b.rounds.map(r => r.length)).toEqual([16,8,4,2]);
      expect(new Set(b.rounds[0]).size).toBe(16);
      expect(bracketOpponent(b)).toBe('story-rival');
      expect(b.rounds[3]).toEqual(['player','story-villain']);
      for (let r = 1; r < 4; r++) b.rounds[r].forEach((id, i) => expect(b.rounds[r-1].slice(i*2,i*2+2)).toContain(id));
      expect(b.rounds[1][1]).not.toBe(b.rounds[2][1]);
      expect(JSON.parse(JSON.stringify(b))).toEqual(b);
    }
  });
});
