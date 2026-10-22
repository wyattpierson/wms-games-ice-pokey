/**
 * Campaign (roguelike run) state machine. Pure, no Phaser, unit-tested.
 *
 * Rules (see DESIGN.md "Campaign / meta"):
 *   - 3 regular teams, fought in any order, each once per run.
 *   - The champion is always available and is the finale; beating it ends the run (victory).
 *   - Matches are first-to-3: no ties — every match is a win or a loss.
 *   - Losing a match ends the run (one-shot run, no retries).
 *   - After beating a regular team you may poach 1 of its players (swap: take 1,
 *     drop 1 of your own, same side — field or goalie). The taken player swaps
 *     into the dropped player's slot. The champion grants no poach.
 *
 * State is immutable: every transition returns a NEW CampaignState.
 */
import { BASE_LEVEL, CHAMPION_LEVEL, LEVEL_PER_WIN } from '../config/campaign';
import { ALL_TEAMS, CAMPAIGN_TEAMS, CHAMPION_TEAM, USER_TEAM, type PlayerDef, type Team } from '../config/teams';
import { STARTER_EVOLUTIONS, TOWER_STAGES, ZONES } from '../config/progression';
import type { BaseStats } from './stats';
import { getMeta } from '../state/metaStore';

/** How a match against a given team ended (no ties: first to 3 goals). */
export type MatchOutcome = 'win' | 'loss';

/** Which side of the roster a poach touches. */
export type Side = 'field' | 'goalie';

/** A completed poach, kept for the end-of-run summary. */
export interface Poach {
  fromTeamId: string;
  side: Side;
  taken: string; // name of the player taken from the beaten team
  dropped: string; // name of the player dropped from the user's roster
}

export interface CampaignState {
  /** The player's current roster (cloned — never the original USER_TEAM). */
  userTeam: Team;
  /** Recruited players not currently in the four-player match lineup. */
  bench: PlayerDef[];
  /** Teams already faced this run: teamId -> outcome. */
  results: Record<string, MatchOutcome>;
  poaches: Poach[];
  gameOver: boolean;
  victory: boolean;
  /**
   * Set from the moment a match starts until its result is recorded. A SAVED run found in this
   * state means the match was abandoned (refresh / closed tab) — see core/runSave + state/runStore.
   */
  matchInProgress?: string;
  /** A just-beaten regular team whose player hasn't been taken (or skipped) yet. */
  pendingPoach?: string;
}

export function cloneStats(s: BaseStats): BaseStats {
  return { ...s };
}

export function clonePlayer(p: PlayerDef): PlayerDef {
  return { ...p, stats: cloneStats(p.stats) };
}

export function cloneTeam(t: Team): Team {
  return { ...t, players: t.players.map(clonePlayer) as Team['players'] };
}

/** A fresh run: the starting roster, no results. */
export function newRun(): CampaignState {
  const team = cloneTeam(USER_TEAM);
  const starter = getMeta().starter;
  const starterDefs = STARTER_EVOLUTIONS;
  const xp = starter ? getMeta().starterXp[starter] : 0;
  const stages = starter ? starterDefs[starter] : undefined;
  if (starter && stages) { const stage = [...stages].reverse().find(x => xp >= x.at)!; team.players[2] = { name: stage.name, sprite: stage.sprite, isStarter: true, stats: { ...stage.stats, hp: stage.stats.hp + getMeta().starterBonusHp } }; }
  return { userTeam: team, bench: [], results: {}, poaches: [], gameOver: false, victory: false };
}


export function teamById(id: string): Team {
  const team = ALL_TEAMS.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team: ${id}`);
  return team;
}

export function isChampion(teamId: string): boolean {
  return teamId === CHAMPION_TEAM.id;
}

/** Island bosses are challenging milestones but do not end the whole run. */
export function isIslandBoss(teamId: string): boolean {
  return teamById(teamId).role === 'boss';
}

/** How many matches the player has won this run. */
export function wins(state: CampaignState): number {
  return Object.values(state.results).filter((r) => r === 'win').length;
}

/** Record a match outcome. A loss ends the run; a champion win is the victory. */
export function recordResult(state: CampaignState, teamId: string, outcome: MatchOutcome): CampaignState {
  if (state.gameOver || state.victory) throw new Error('The run is already over');
  if (state.results[teamId]) throw new Error(`Team ${teamId} was already faced`);
  const next: CampaignState = { ...state, results: { ...state.results, [teamId]: outcome } };
  next.matchInProgress = undefined;
  next.pendingPoach = outcome === 'win' && !isChampion(teamId) ? teamId : undefined;
  if (outcome === 'loss') next.gameOver = true;
  if (outcome === 'win' && isChampion(teamId)) next.victory = true;
  return next;
}

/** Mark a match as started (so abandoning it later can be detected). */
export function startMatch(state: CampaignState, teamId: string): CampaignState {
  const isLegacyAvailable = availableOpponents(state).some((t) => t.id === teamId);
  const zone = ZONES.find((z) => z.id === getMeta().selectedZoneId);
  const islandTeamIds = zone ? [...zone.opponents, zone.bossId] : [];
  const isSelectedIslandAvailable = islandTeamIds.includes(teamId) && !state.results[teamId] && !state.gameOver && !state.victory;
  const isTournamentStageAvailable = getMeta().daysRemaining <= 0 && TOWER_STAGES.some(stage => stage.opponentId === teamId) && !state.gameOver && !state.victory;
  if (!isLegacyAvailable && !isSelectedIslandAvailable && !isTournamentStageAvailable) throw new Error(`Team ${teamId} is not available`);
  return { ...state, matchInProgress: teamId };
}

/** Treat a match that was started but never finished as a forfeit (a loss; the run is over). */
export function abandonMatch(state: CampaignState): CampaignState {
  return state.matchInProgress ? recordResult(state, state.matchInProgress, 'loss') : state;
}

/** Give up the pending poach. The beaten team is consumed either way. */
export function skipPoach(state: CampaignState): CampaignState {
  return { ...state, pendingPoach: undefined };
}

/** Can this run be continued? (Not over, and at least one team left to face.) */
export function isResumable(state: CampaignState): boolean {
  return !state.gameOver && !state.victory && availableOpponents(state).length > 0;
}

/** Teams that can still be challenged: not yet faced (the champion included, always). */
export function availableOpponents(state: CampaignState): Team[] {
  if (state.gameOver || state.victory) return [];
  return CAMPAIGN_TEAMS.filter((t) => !state.results[t.id]);
}

/** The `side` players of a team, in roster order. */
export function sidePlayers(team: Team, side: Side): PlayerDef[] {
  return team.players.filter((p) => (side === 'goalie' ? p.goalie : !p.goalie));
}

/**
 * Swap one of the player's roster entries for one from the just-beaten team (same side).
 * The taken player keeps its stats and moves into the dropped player's slot.
 */
export function applyPoach(
  state: CampaignState,
  side: Side,
  fromTeamId: string,
  takenIndex: number,
  droppedIndex: number,
): CampaignState {
  if (state.results[fromTeamId] !== 'win') throw new Error('Can only poach from a team you just beat');
  if (isChampion(fromTeamId)) throw new Error('The champion grants no players');
  const source = sidePlayers(teamById(fromTeamId), side);
  const taken = source[takenIndex];
  const own = sidePlayers(state.userTeam, side);
  const dropped = own[droppedIndex];
  if (!taken || !dropped) throw new Error('Bad roster index');

  // Find the slot of the dropped player in the 4-wide roster tuple and move the
  // taken player into it (roster order / formation slots are preserved).
  let slot = -1;
  let seen = 0;
  state.userTeam.players.forEach((p, i) => {
    const isSide = side === 'goalie' ? p.goalie : !p.goalie;
    if (isSide && seen === droppedIndex) slot = i;
    if (isSide) seen += 1;
  });
  if (slot < 0) throw new Error('Bad roster index');

  const players = state.userTeam.players.map((p, i) => (i === slot ? clonePlayer(taken) : p)) as Team['players'];
  return {
    ...state,
    userTeam: { ...state.userTeam, players },
    poaches: [...state.poaches, { fromTeamId, side, taken: taken.name, dropped: dropped.name }],
    pendingPoach: undefined,
  };
}

/** Apply permanent starter XP/evolution to whichever roster slot currently holds them. */
export function syncStarterEvolution(state: CampaignState): CampaignState {
  const meta = getMeta(); if (!meta.starter) return state;
  const stages = STARTER_EVOLUTIONS[meta.starter];
  const stage = [...stages].reverse().find(s => meta.starter && meta.starterXp[meta.starter] >= s.at)!;
  const evolve = (p: PlayerDef): PlayerDef => p.isStarter ? {...p,name:stage.name,sprite:stage.sprite,stats:{...stage.stats,hp:stage.stats.hp+meta.starterBonusHp}} : p;
  return {...state,userTeam:{...state.userTeam,players:state.userTeam.players.map(evolve) as Team['players']},bench:(state.bench||[]).map(evolve)};
}

/** Add a recruited player to the bench without disturbing the active lineup. */
export function recruitToBench(state: CampaignState, side: Side, fromTeamId: string, takenIndex: number): CampaignState {
  if (state.results[fromTeamId] !== 'win') throw new Error('Can only recruit from a team you just beat');
  if (isChampion(fromTeamId)) throw new Error('The champion grants no players');
  const taken = sidePlayers(teamById(fromTeamId), side)[takenIndex];
  if (!taken) throw new Error('Bad roster index');
  return { ...state, bench: [...(state.bench || []), clonePlayer(taken)], poaches: [...state.poaches, { fromTeamId, side, taken: taken.name, dropped: '(sent to bench)' }], pendingPoach: undefined };
}

/**
 * AI level (0..1, see config/difficulty.ts) for a matchup: the per-win ramp for
 * regular teams, a fixed high level for the champion.
 */
export function difficultyLevel(state: CampaignState, teamId: string): number {
  const base = isChampion(teamId) ? CHAMPION_LEVEL : BASE_LEVEL + wins(state) * LEVEL_PER_WIN;
  return Math.max(0, Math.min(1, base));
}
