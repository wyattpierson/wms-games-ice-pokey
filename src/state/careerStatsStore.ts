/** Persistent career totals and run history. Kept separate from the active campaign save. */
export type CareerRunOutcome = 'loss' | 'forfeit' | 'victory';

export interface CareerPlayerIdentity {
  name: string;
  sprite: number;
  isStarter?: boolean;
  goalie?: boolean;
}

export interface PlayerStatLine extends CareerPlayerIdentity {
  key: string;
  goals: number;
  assists: number;
}

export interface CareerRunRecord {
  id: string;
  year: number;
  teamName: string;
  startedAt: string;
  endedAt?: string;
  outcome?: CareerRunOutcome;
  lostTo?: string;
  score?: { for: number; against: number };
  winsBeforeEnd?: number;
  lineup: CareerPlayerIdentity[];
  playerStats: Record<string, PlayerStatLine>;
  goalsFor: number;
  goalsAgainst: number;
}

export interface RunHistoryEntry {
  id: string;
  year: number;
  endedAt: string;
  outcome: CareerRunOutcome;
  teamName: string;
  lineup: CareerPlayerIdentity[];
  lostTo?: string;
  score?: { for: number; against: number };
  winsBeforeEnd: number;
}

interface CareerStore {
  version: 1;
  currentRun: CareerRunRecord | null;
  allTime: Record<string, PlayerStatLine>;
  history: RunHistoryEntry[];
  /** Snapshot taken at kickoff; a Second Chance retry discards the failed attempt's stat events. */
  matchSnapshot?: { currentRun: CareerRunRecord | null; allTime: Record<string, PlayerStatLine>; history: RunHistoryEntry[] };
}

const STORAGE_KEY = 'ice-pokey:career-stats:v1';
const emptyStore = (): CareerStore => ({ version: 1, currentRun: null, allTime: {}, history: [] });
let store: CareerStore = load();

function load(): CareerStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<CareerStore> | null;
    if (parsed?.version === 1 && parsed.allTime && Array.isArray(parsed.history)) {
      return { ...emptyStore(), ...parsed, allTime: parsed.allTime, history: parsed.history, currentRun: parsed.currentRun ?? null };
    }
  } catch { /* storage can be disabled or malformed; start clean */ }
  return emptyStore();
}
function persist(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* continue without persistence if storage is unavailable */ }
}
const cloneLine = (v: PlayerStatLine): PlayerStatLine => ({ ...v });
const cloneRun = (v: CareerRunRecord | null): CareerRunRecord | null => v ? ({
  ...v,
  lineup: v.lineup.map(p => ({ ...p })),
  playerStats: Object.fromEntries(Object.entries(v.playerStats).map(([k, row]) => [k, cloneLine(row)])),
  score: v.score ? { ...v.score } : undefined,
}) : null;
const cloneAllTime = (v: Record<string, PlayerStatLine>) => Object.fromEntries(Object.entries(v).map(([k, row]) => [k, cloneLine(row)]));

/** Evolving starter forms count as the same player; other species aggregate by sprite and name. */
export function careerPlayerKey(player: CareerPlayerIdentity): string {
  return player.isStarter ? 'starter:career-partner' : `${player.sprite}:${player.name.trim().toLowerCase()}`;
}

function ensureLine(rows: Record<string, PlayerStatLine>, player: CareerPlayerIdentity): PlayerStatLine {
  const key = careerPlayerKey(player);
  const row = rows[key] ?? { ...player, key, goals: 0, assists: 0 };
  // Keep the latest known form/name for the evolving starter.
  row.name = player.name;
  row.sprite = player.sprite;
  row.isStarter = player.isStarter;
  row.goalie = player.goalie;
  rows[key] = row;
  return row;
}

export function beginCareerRun(teamName: string, year: number, lineup: CareerPlayerIdentity[] = []): void {
  store.currentRun = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    year,
    teamName,
    startedAt: new Date().toISOString(),
    lineup: lineup.map(p => ({ ...p })),
    playerStats: {},
    goalsFor: 0,
    goalsAgainst: 0,
  };
  lineup.forEach(p => {
    ensureLine(store.currentRun!.playerStats, p);
    ensureLine(store.allTime, p);
  });
  delete store.matchSnapshot;
  persist();
}

/** Call at match creation so a retry can roll back that attempt's goals and assists. */
export function beginCareerMatch(teamName?: string, year?: number, lineup: CareerPlayerIdentity[] = []): void {
  if (!store.currentRun || store.currentRun.outcome) beginCareerRun(teamName ?? 'Puck Masters', year ?? 1, lineup);
  const run = store.currentRun!;
  const activeLineup = lineup.length ? lineup : run.lineup;
  // Recruits can join after a run has already started. Keep the live roster in
  // the current-run and all-time tables even before a player records a point.
  if (activeLineup.length) {
    run.lineup = activeLineup.map(p => ({ ...p }));
    activeLineup.forEach(p => {
      ensureLine(run.playerStats, p);
      ensureLine(store.allTime, p);
    });
  }
  store.matchSnapshot = {
    currentRun: cloneRun(store.currentRun),
    allTime: cloneAllTime(store.allTime),
    history: store.history.map(h => ({ ...h, lineup: h.lineup.map(p => ({ ...p })), score: h.score ? { ...h.score } : undefined })),
  };
  persist();
}

/** Record a goal's team score and, when known, the scorer and most recent passer. */
export function recordCareerGoal(scoringTeam: 0 | 1, scorer?: CareerPlayerIdentity | null, assister?: CareerPlayerIdentity | null): void {
  if (!store.currentRun) return;
  if (scoringTeam === 0) store.currentRun.goalsFor += 1;
  else store.currentRun.goalsAgainst += 1;
  if (scoringTeam !== 0 || !scorer || scorer.goalie) { persist(); return; }
  ensureLine(store.currentRun.playerStats, scorer).goals += 1;
  ensureLine(store.allTime, scorer).goals += 1;
  if (assister && !assister.goalie && careerPlayerKey(assister) !== careerPlayerKey(scorer)) {
    ensureLine(store.currentRun.playerStats, assister).assists += 1;
    ensureLine(store.allTime, assister).assists += 1;
  }
  persist();
}

/** Roll back the match whose Second Chance rematch was chosen. */
export function rollbackCareerMatch(): void {
  const snapshot = store.matchSnapshot;
  if (!snapshot) return;
  store.currentRun = cloneRun(snapshot.currentRun);
  store.allTime = cloneAllTime(snapshot.allTime);
  store.history = snapshot.history.map(h => ({ ...h, lineup: h.lineup.map(p => ({ ...p })), score: h.score ? { ...h.score } : undefined }));
  delete store.matchSnapshot;
  persist();
}

/** The match is final: retain its events and stop keeping a retry snapshot. */
export function finishCareerMatch(): void {
  delete store.matchSnapshot;
  persist();
}

export interface ArchiveCareerRunInput {
  outcome: CareerRunOutcome;
  teamName?: string;
  year?: number;
  lineup?: CareerPlayerIdentity[];
  lostTo?: string;
  score?: { for: number; against: number };
  winsBeforeEnd?: number;
}

export function archiveCareerRun(input: ArchiveCareerRunInput): void {
  const run = store.currentRun;
  if (!run) return;
  // Re-entering a result/game-over scene must not duplicate the same run.
  if (run.outcome && store.history.some(h => h.id === run.id)) return;
  const endedAt = new Date().toISOString();
  const lineup = (input.lineup ?? run.lineup).map(p => ({ ...p }));
  run.teamName = input.teamName ?? run.teamName;
  run.year = input.year ?? run.year;
  run.lineup = lineup;
  run.endedAt = endedAt;
  run.outcome = input.outcome;
  run.lostTo = input.lostTo;
  run.score = input.score ? { ...input.score } : undefined;
  run.winsBeforeEnd = input.winsBeforeEnd ?? run.winsBeforeEnd ?? 0;
  lineup.forEach(p => { ensureLine(run.playerStats, p); ensureLine(store.allTime, p); });
  const history: RunHistoryEntry = {
    id: run.id,
    year: run.year,
    endedAt,
    outcome: input.outcome,
    teamName: run.teamName,
    lineup,
    lostTo: input.lostTo,
    score: input.score ? { ...input.score } : undefined,
    winsBeforeEnd: run.winsBeforeEnd,
  };
  store.history = [history, ...store.history.filter(h => h.id !== run.id)].slice(0, 100);
  persist();
}

export function getCareerStats(): { currentRun: CareerRunRecord | null; allTime: Record<string, PlayerStatLine>; history: RunHistoryEntry[] } {
  return {
    currentRun: cloneRun(store.currentRun),
    allTime: cloneAllTime(store.allTime),
    history: store.history.map(h => ({ ...h, lineup: h.lineup.map(p => ({ ...p })), score: h.score ? { ...h.score } : undefined })),
  };
}

export function clearCareerStats(): void {
  store = emptyStore();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore storage errors */ }
}
