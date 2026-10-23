export interface BalanceMatchSummary {
  id: string;
  date: string;
  opponentId: string;
  opponentName: string;
  playerTeamName: string;
  result: 'win' | 'loss';
  playerScore: number;
  opponentScore: number;
  liveSeconds: number;
  shots: number;
  passes: number;
  jukes: number;
  parries: number;
  checks: number;
  checkHits: number;
  goalsFor: number;
  goalsAgainst: number;
  powerIds: string[];
  /** Permanent-item toggles used for this isolated test match. Optional for older history rows. */
  itemIds?: string[];
  powerActivations: number;
  activationNames: string[];
}

export interface BalanceLabSession {
  label: string;
  opponentId: string;
  powerIds: string[];
  startedAt: string;
}

export function summarizeBalanceMetrics(summary: BalanceMatchSummary): Record<string, number> {
  return {
    winRate: summary.result === 'win' ? 1 : 0,
    goalDifferential: summary.playerScore - summary.opponentScore,
    goalsPerMinute: summary.liveSeconds > 0 ? summary.playerScore / (summary.liveSeconds / 60) : 0,
    shotsPerMinute: summary.liveSeconds > 0 ? summary.shots / (summary.liveSeconds / 60) : 0,
    passesPerMinute: summary.liveSeconds > 0 ? summary.passes / (summary.liveSeconds / 60) : 0,
    powerActivations: summary.powerActivations,
  };
}

export function balanceSummariesToCsv(rows: readonly BalanceMatchSummary[]): string {
  const headers: (keyof BalanceMatchSummary)[] = [
    'date', 'opponentId', 'opponentName', 'playerTeamName', 'result', 'playerScore', 'opponentScore',
    'liveSeconds', 'shots', 'passes', 'jukes', 'parries', 'checks', 'checkHits', 'goalsFor', 'goalsAgainst',
    'powerIds', 'itemIds', 'powerActivations', 'activationNames',
  ];
  const cell = (value: unknown): string => {
    const text = Array.isArray(value) ? value.join(';') : String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\n');
}
