import { describe, expect, it } from 'vitest';
import { USER_TEAM } from '../config/teams';
import { newRun, recordResult, startMatch, applyPoach, type CampaignState as S } from './campaign';
import { parseRun, serializeRun, SAVE_VERSION } from './runSave';

/** Deep-ish mutation helper: returns a new object with one nested path replaced. */
function mutate(state: S, fn: (draft: any) => void): string {
  const draft: any = JSON.parse(JSON.stringify(state));
  fn(draft);
  return serializeRun(draft);
}

describe('serializeRun / parseRun round trip', () => {
  it('a fresh run survives the round trip', () => {
    const s = newRun();
    expect(parseRun(serializeRun(s))).toEqual(s);
  });

  it('a mid-run state (results, poach, pending poach) survives the round trip', () => {
    let s = startMatch(newRun(), 'tidal-wave');
    s = recordResult(s, 'tidal-wave', 'win');
    expect(s.pendingPoach).toBe('tidal-wave');
    expect(parseRun(serializeRun(s))).toEqual(s);
    s = applyPoach(s, 'field', 'tidal-wave', 1, 1);
    expect(parseRun(serializeRun(s))).toEqual(s);
    expect(s.userTeam.players[1].name).toBe('Lapras');
  });
});

describe('parseRun rejects bad input', () => {
  it('null / empty / non-JSON', () => {
    expect(parseRun(null)).toBeNull();
    expect(parseRun('')).toBeNull();
    expect(parseRun('not json')).toBeNull();
    expect(parseRun('42')).toBeNull();
    expect(parseRun('"a string"')).toBeNull();
  });

  it('wrong or missing version', () => {
    const s = newRun();
    const wrong = JSON.stringify({ version: SAVE_VERSION + 1, run: s });
    expect(parseRun(wrong)).toBeNull();
    const noVersion = JSON.stringify({ run: s });
    expect(parseRun(noVersion)).toBeNull();
  });

  it('unknown team id in results', () => {
    expect(parseRun(mutate(newRun(), (d) => (d.results = { 'evil-team': 'win' })))).toBeNull();
  });

  it('bad outcome value', () => {
    expect(parseRun(mutate(newRun(), (d) => (d.results = { 'tidal-wave': 'tie' })))).toBeNull();
  });

  it('non-boolean gameOver / victory', () => {
    expect(parseRun(mutate(newRun(), (d) => (d.gameOver = 'yes')))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => (d.victory = 1)))).toBeNull();
  });

  it('matchInProgress / pendingPoach must be a known team id', () => {
    expect(parseRun(mutate(newRun(), (d) => (d.matchInProgress = 'nope')))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => (d.pendingPoach = 7)))).toBeNull();
    // undefined and null are fine (JSON drops undefined keys entirely)
    const s = newRun();
    s.matchInProgress = undefined;
    expect(parseRun(serializeRun(s))).toEqual(s);
  });

  it('poaches entries must be well-formed', () => {
    const good = [
      { fromTeamId: 'tidal-wave', side: 'field', taken: 'Lapras', dropped: 'Charizard' },
    ];
    const ok = mutate(newRun(), (d) => (d.poaches = good));
    expect(parseRun(ok)).not.toBeNull();
    const badSide = mutate(newRun(), (d) => (d.poaches = [{ fromTeamId: 'tidal-wave', side: 'mid', taken: 'L', dropped: 'C' }]));
    expect(parseRun(badSide)).toBeNull();
    const missingField = mutate(newRun(), (d) => (d.poaches = [{ side: 'field', taken: 'L', dropped: 'C' }]));
    expect(parseRun(missingField)).toBeNull();
  });
});

describe('parseRun validates the user roster', () => {
  it('the roster must be 4 players with exactly 1 goalie and 3 field players', () => {
    expect(parseRun(mutate(newRun(), (d) => (d.userTeam.players = d.userTeam.players.slice(0, 3))))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => (d.userTeam.players = [...d.userTeam.players, d.userTeam.players[0]])))).toBeNull();
    expect(
      parseRun(mutate(newRun(), (d) => {
        // 2 goalies
        d.userTeam.players[0].goalie = true;
      })),
    ).toBeNull();
  });

  it('each player needs a name, a numeric sprite and all six stats', () => {
    expect(parseRun(mutate(newRun(), (d) => (d.userTeam.players[0].name = 42)))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => (d.userTeam.players[0].sprite = 'pikachu')))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => delete d.userTeam.players[0].stats.speed))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => (d.userTeam.players[0].stats.hp = 'a lot')))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => (d.userTeam.players[0].stats.hp = NaN)))).toBeNull();
  });

  it('the team record itself must be complete', () => {
    expect(parseRun(mutate(newRun(), (d) => delete d.userTeam.id))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => (d.userTeam.color = 'blue')))).toBeNull();
    expect(parseRun(mutate(newRun(), (d) => delete d.userTeam.colorDark))).toBeNull();
  });

  it('a saved roster with poached players (not in any campaign team) still parses', () => {
    // The save stores the roster verbatim; player names/sprites are not cross-checked
    // against campaign teams, so a poached Mewtwo on the user team is valid.
    let s = startMatch(newRun(), 'tidal-wave');
    s = recordResult(s, 'tidal-wave', 'win');
    s = applyPoach(s, 'field', 'tidal-wave', 1, 1);
    const raw = serializeRun(s);
    expect(parseRun(raw)).not.toBeNull();
    expect(USER_TEAM.players.map((p) => p.name)).not.toEqual(s.userTeam.players.map((p) => p.name));
  });
});
