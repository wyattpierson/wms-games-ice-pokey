import { ACHIEVEMENTS, type AchievementDefinition } from '../config/achievements';

export const ACHIEVEMENTS_STORAGE_KEY = 'ice-pokey:achievements:v1';
interface AchievementState {
  version: 1;
  migrated: boolean;
  starterGoals: number;
  islands: string[];
  tournamentWon: boolean;
  earned: Record<string, string>;
}
const fresh = (): AchievementState => ({ version: 1, migrated: false, starterGoals: 0, islands: [], tournamentWon: false, earned: {} });
function load(): AchievementState {
  try {
    const saved = JSON.parse(localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY) || 'null');
    if (saved?.version !== 1) return fresh();
    return {
      ...fresh(), migrated: saved.migrated === true,
      starterGoals: Number.isSafeInteger(saved.starterGoals) && saved.starterGoals >= 0 ? saved.starterGoals : 0,
      islands: Array.isArray(saved.islands) ? saved.islands.filter((id: unknown) => typeof id === 'string') : [],
      tournamentWon: saved.tournamentWon === true,
      earned: Object.fromEntries(Object.entries(saved.earned || {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1])))),
    };
  } catch { return fresh(); }
}
let state = load();
const pending: AchievementDefinition[] = [];
function save(): void {
  try { localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(state)); } catch { /* Session achievements still work without storage. */ }
}
function evaluate(): void {
  for (const achievement of ACHIEVEMENTS) {
    const m = achievement.milestone;
    const qualifies = m.kind === 'island' ? state.islands.includes(m.zoneId)
      : m.kind === 'tournament' ? state.tournamentWon : state.starterGoals >= m.goals;
    if (qualifies && !state.earned[achievement.id]) {
      state.earned[achievement.id] = new Date().toISOString();
      pending.push(achievement);
    }
  }
  save();
}

/** Import existing save evidence once. Never re-import career totals after a data wipe. */
export function migrateAchievements(evidence: { starterGoals: number; zoneBossWins: Record<string, number>; tournamentWon: boolean }): void {
  if (!state.migrated) {
    state.starterGoals = Math.max(state.starterGoals, Math.max(0, Math.floor(evidence.starterGoals)) || 0);
    state.islands = [...new Set([...state.islands, ...Object.keys(evidence.zoneBossWins).filter(id => evidence.zoneBossWins[id] > 0)])];
    state.tournamentWon ||= evidence.tournamentWon;
    state.migrated = true;
  }
  // Re-evaluate even after migration, so new catalogue entries can use saved progress.
  evaluate();
}
/** Goals actually scored stay credited here, including before a Max Revive retry. */
export function recordAchievementStarterGoal(): void { state.starterGoals++; evaluate(); }
export function recordAchievementIslandWin(zoneId: string): void {
  if (!state.islands.includes(zoneId)) state.islands.push(zoneId);
  evaluate();
}
export function recordAchievementTournamentWin(): void { state.tournamentWon = true; evaluate(); }
export function getAchievements(): AchievementState {
  return { ...state, islands: [...state.islands], earned: { ...state.earned } };
}
export function takeAchievementPopup(): AchievementDefinition | undefined { return pending.shift(); }
