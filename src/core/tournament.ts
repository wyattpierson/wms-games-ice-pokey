import { ALL_TEAMS } from '../config/teams';
export interface TournamentBracket { year: number; rounds: string[][]; completed: number; rivalUpgraded: boolean }
/** The player's slot remains zero; the hidden team occupies the other half. */
export function createBracket(year: number, rivalUpgraded: boolean, random = Math.random): TournamentBracket {
  const pool = ALL_TEAMS.filter(t => t.role === 'tower' || t.role === 'boss' || (t.role === 'regular' && !t.id.endsWith('-coastal'))).map(t => t.id).filter(id => !['story-rival','story-villain','story-arceus','tower-origin'].includes(id));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  if (pool.length < 13) throw new Error('Tournament needs thirteen eligible teams');
  const rounds = [['player', 'story-rival', ...pool.slice(0, 13), 'story-villain']];
  while (rounds.at(-1)!.length > 2) {
    const previous = rounds.at(-1)!;
    const next: string[] = [];
    for (let i = 0; i < previous.length; i += 2) next.push(i === 0 ? 'player' : previous[i + 1] === 'story-villain' ? 'story-villain' : previous[i + (random() < .5 ? 0 : 1)]);
    rounds.push(next);
  }
  return { year, rounds, completed: 0, rivalUpgraded };
}
export const ROUND_NAMES = ['ROUND OF 16', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'];
export const ROUND_DIFFICULTY = [.97, .98, .995, 1];
export const bracketOpponent = (b: TournamentBracket) => b.rounds[Math.min(b.completed, 3)][1];
