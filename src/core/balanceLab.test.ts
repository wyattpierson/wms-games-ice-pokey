import { describe, expect, it } from 'vitest';
import { balanceSummariesToCsv, summarizeBalanceMetrics, type BalanceMatchSummary } from './balanceLab';

const row: BalanceMatchSummary = {
  id: 'one', date: '2026-10-20T12:00:00.000Z', opponentId: 'test', opponentName: 'Team, "A"', playerTeamName: 'Player',
  result: 'win', playerScore: 3, opponentScore: 2, liveSeconds: 90, shots: 8, passes: 5, jukes: 3, parries: 1,
  checks: 4, checkHits: 2, goalsFor: 3, goalsAgainst: 2, powerIds: ['clean-break'], itemIds: ['super-shot', 'mega-band'], powerActivations: 2, activationNames: ['Clean Break', 'Clean Break'],
};

describe('Balance Lab metrics', () => {
  it('derives simple comparable rates', () => {
    expect(summarizeBalanceMetrics(row)).toEqual({ winRate: 1, goalDifferential: 1, goalsPerMinute: 2, shotsPerMinute: 16 / 3, passesPerMinute: 10 / 3, powerActivations: 2 });
  });
  it('exports CSV with proper escaping and stable headers', () => {
    const csv = balanceSummariesToCsv([row]);
    expect(csv.startsWith('date,opponentId,opponentName')).toBe(true);
    expect(csv).toContain('"Team, ""A"""');
    expect(csv).toContain('clean-break');
    expect(csv).toContain('super-shot;mega-band');
  });
});
