/**
 * Save-file format for a campaign run. Pure (no localStorage, no Phaser): turns a
 * CampaignState into a string and back, validating everything on the way in so a
 * corrupt, hand-edited, or out-of-date save is simply ignored instead of crashing
 * the game. (state/runStore.ts does the actual browser storage.)
 */
import type { CampaignState, MatchOutcome } from './campaign';
import { POACH_STATS } from './poach';
import { ALL_TEAMS, USER_TEAM } from '../config/teams';

/** Bump when CampaignState (or Team/PlayerDef) changes shape; older saves are then discarded. */
export const SAVE_VERSION = 2;

const OUTCOMES: readonly string[] = ['win', 'loss'] satisfies MatchOutcome[];
const TEAM_IDS: readonly string[] = ALL_TEAMS.map((t) => t.id);
const FIELD_COUNT = USER_TEAM.players.filter((p) => !p.goalie).length;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOptionalTeamId = (v: unknown): boolean => v === undefined || v === null || (isString(v) && TEAM_IDS.includes(v));

function isStats(v: unknown): boolean {
  return isRecord(v) && POACH_STATS.every(({ key }) => isFiniteNumber(v[key]));
}

function isPlayer(v: unknown): boolean {
  return isRecord(v) && isString(v.name) && isFiniteNumber(v.sprite) && (v.goalie === undefined || typeof v.goalie === 'boolean') && (v.isStarter === undefined || typeof v.isStarter === 'boolean') && isStats(v.stats);
}

function isRoster(v: unknown): boolean {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(isPlayer)) return false;
  const goalies = v.filter((p) => (p as { goalie?: boolean }).goalie).length;
  return goalies === 1 && v.filter((p) => !(p as { goalie?: boolean }).goalie).length === FIELD_COUNT;
}

function isTeam(v: unknown): boolean {
  return isRecord(v) && isString(v.id) && isString(v.name) && isFiniteNumber(v.color) && isFiniteNumber(v.colorDark) && isRoster(v.players);
}

function isPoach(v: unknown): boolean {
  return (
    isRecord(v) &&
    isString(v.fromTeamId) && isString(v.taken) && isString(v.dropped) &&
    (v.side === 'field' || v.side === 'goalie')
  );
}

export function serializeRun(state: CampaignState): string {
  return JSON.stringify({ version: SAVE_VERSION, run: state });
}

/** Parse a saved run. Returns null for anything missing, corrupt, or from another save version. */
export function parseRun(raw: string | null): CampaignState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== SAVE_VERSION || !isRecord(data.run)) return null;

  const run = data.run;
  if (!isTeam(run.userTeam)) return null;
  if (run.bench !== undefined && (!Array.isArray(run.bench) || !run.bench.every(isPlayer))) return null;
  if (!isRecord(run.results) || !Object.entries(run.results).every(([id, outcome]) => TEAM_IDS.includes(id) && OUTCOMES.includes(outcome as string))) return null;
  if (!Array.isArray(run.poaches) || !run.poaches.every(isPoach)) return null;
  if (typeof run.gameOver !== 'boolean' || typeof run.victory !== 'boolean') return null;
  if (!isOptionalTeamId(run.matchInProgress) || !isOptionalTeamId(run.pendingPoach)) return null;

  if (!Array.isArray(run.bench)) run.bench = [];
  return run as unknown as CampaignState;
}
