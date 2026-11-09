import { ONBOARDING } from '../config/training';
import { TIME_COSTS, zoneThreatLevel } from '../config/progression';
import { startMatch, teamById } from '../core/campaign';
import { resolveWorldZone } from '../core/worldState';
import { getMeta, updateMeta } from './metaStore';
import { getRun, setRun } from './runStore';

/** Existing careers and abandoned opening matches must not be forced through onboarding. */
export function needsFirstRunIntro(): boolean {
  const meta = getMeta(), run = getRun();
  return !!meta.starter && meta.yearStarted && meta.seasonYear === 1 && meta.totalRuns <= 1 && meta.totalMatches === 0
    && !meta.flags.includes(ONBOARDING.firstMatchStarted) && !run.gameOver && !run.matchInProgress
    && !run.pendingPoach && !meta.activeIslandId && Object.keys(run.results).length === 0 && meta.everEnteredZones.length === 0;
}

/** Enter the real first island using its usual travel cost, match cost, roster and threat level. */
export function prepareFirstCoastalMatch() {
  if (!needsFirstRunIntro()) return null;
  const zone = resolveWorldZone('coastal');
  if (!zone?.opponents.length) return null;
  const meta = getMeta(), before = getRun();
  const opponent = teamById(zone.opponents[0]);
  const level = zoneThreatLevel(zone.difficulty, 0, false);
  const state = startMatch(before, opponent.id, { level });
  if (state.matchInProgress !== opponent.id) return null;
  setRun(state);
  updateMeta({
    selectedZoneId: zone.id, activeIslandId: zone.id,
    daysRemaining: Math.max(0, meta.daysRemaining - TIME_COSTS.islandVisit - TIME_COSTS.match),
    everEnteredZones: [...new Set([...meta.everEnteredZones, zone.id])],
    flags: [...new Set([...meta.flags, ONBOARDING.introDone, ONBOARDING.firstMatchStarted,
      `story-year-${meta.seasonYear}-island-${zone.id}`])],
  });
  return { userTeam: state.userTeam, opponent, level };
}
