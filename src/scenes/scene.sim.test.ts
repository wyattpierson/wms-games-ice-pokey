/**
 * Headless integration tests: the REAL GameScene / Player / ai.ts running with
 * Phaser replaced by a chainable no-op stub (no rendering). Keys are scripted.
 * This verifies rules + AI behaviour end to end; it can't verify how things LOOK.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => {
  const keys = new Map<string, any>();
  const U: any = new Proxy(function () {}, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => 0 : U),
    apply: () => U,
    construct: () => U,
  });
  return { keys, U };
});

vi.mock('phaser', () => {
  const kb = {
    addKey: (c: string) => {
      if (!H.keys.has(c)) H.keys.set(c, { code: c, isDown: false, _just: false });
      return H.keys.get(c);
    },
    addListener: () => {},
  };
  class Scene {
    add = H.U; tweens = H.U; time = H.U; cameras = H.U; textures = H.U; sys = H.U; scale = H.U;
    input = { keyboard: kb };
    constructor(_k?: unknown) {}
  }
  return {
    default: {
      Scene,
      Input: { Keyboard: { JustDown: (k: any) => { const j = k._just; k._just = false; return j; }, JustUp: () => false } },
    },
  };
});

import { difficultyAt } from '../config/difficulty';
import { MOVE_DEFS, windowSeconds } from '../core/moves';
import { GameScene } from './GameScene';

const DT = 1000 / 60;
let clock = 0;
const press = (code: string) => { const k = H.keys.get(code); k._just = true; k.isDown = true; };
const release = (code: string) => { const k = H.keys.get(code); k.isDown = false; k._just = false; };

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh live scene with every player parked/frozen far away, ready to be arranged. */
function makeScene(level: number) {
  const s: any = new GameScene();
  s.opponentIdx = 0;
  s.create();
  s.diff = difficultyAt(level);
  s.state = 'live';
  for (const p of s.players) { p.pos = { x: 60 + Math.random() * 40, y: 60 }; p.vel = { x: 0, y: 0 }; p.stagger = 999; }
  const popups: string[] = [];
  s.popup = (t: string) => popups.push(t);
  return { s, popups };
}
const unfreeze = (p: any, x: number, y: number) => { p.pos = { x, y }; p.vel = { x: 0, y: 0 }; p.stagger = 0; p.facing = 0; };
const step = (s: any, n = 1) => { for (let i = 0; i < n; i++) { clock += DT; s.update(clock, DT); } };
const speed = (p: any) => Math.hypot(p.vel.x, p.vel.y);

beforeAll(() => { vi.spyOn(Math, 'random').mockImplementation(mulberry(1234)); });

/** User defender (players[0]) vs an AI carrier (players[4]) who has just started `move`. */
function defenseSetup(move: 'spin' | 'deke') {
  const { s, popups } = makeScene(0);
  const def = s.players[0], car = s.players[4];
  unfreeze(def, 640, 300); unfreeze(car, 690, 300);
  s.grantPuck(car);
  car.moveCd = 0;
  expect(car.startMove(move, 1)).toBe(true);
  car.moveCd = 99;
  step(s, 1); // lets the scene hand control to the defender
  expect(s.controlled).toBe(def);
  return { s, popups, def, car };
}

describe('human defense', () => {
  it('right key in the window steals the puck', () => {
    const { s, def, car } = defenseSetup('deke');
    const win = windowSeconds(car.tellDur, def.stats.parryFrac);
    while (car.moveT < car.tellDur - win / 2) step(s);
    press('F'); step(s); release('F'); step(s, 2);
    expect(s.puck.carriedBy).toBe(def);
    expect(car.move).toBeNull();
  });

  it('pressing too early whiffs (and says why) — carrier keeps the puck', () => {
    const { s, popups, def, car } = defenseSetup('deke');
    step(s, 5);
    press('F'); step(s); release('F');
    expect(popups).toContain('TOO EARLY');
    expect(def.stagger).toBeGreaterThan(0.3);
    expect(s.puck.carriedBy).toBe(car);
  });

  it('wrong key whiffs', () => {
    const { s, popups, def, car } = defenseSetup('deke');
    const win = windowSeconds(car.tellDur, def.stats.parryFrac);
    while (car.moveT < car.tellDur - win / 2) step(s);
    press('E'); step(s); release('E');
    expect(popups).toContain('WRONG MOVE');
    expect(s.puck.carriedBy).toBe(car);
  });

  it('CHECK stuffs the juke: burst cancelled, carrier stunned, puck NOT stolen', () => {
    const { s, popups, def, car } = defenseSetup('deke');
    step(s, 10);
    press('ENTER'); step(s); release('ENTER');
    expect(def.guardT).toBeGreaterThan(0);
    while (car.move && !car.moveResolved) step(s);
    step(s, 2);
    expect(popups).toContain('BLOCKED');
    expect(car.move).toBeNull();
    expect(car.stagger).toBeGreaterThan(0.2);
    expect(speed(car)).toBeLessThan(120);
    expect(s.puck.carriedBy).toBe(car); // a check never steals
  });

  it('an unanswered juke works: dash + defender knocked back AND stunned', () => {
    const { s, def, car } = defenseSetup('deke');
    while (car.move && !car.moveResolved) step(s);
    step(s, 1);
    // dash speed is HELD (not an impulse that friction eats): still ≥ 85% of launch speed a few frames in
    expect(speed(car)).toBeGreaterThan(MOVE_DEFS.deke.dash * car.stats.skill * 0.85);
    expect(def.stagger).toBeGreaterThan(0.2);
  });

  it('a planted defender is a wall: a skater cannot push through it', () => {
    const { s, def, car } = defenseSetup('spin');
    car.move = null; car.moveResolved = true; // no juke this time
    unfreeze(def, 640, 300); unfreeze(car, 760, 300);
    car.vel = { x: -260, y: 0 };
    def.guardT = 5;
    const R = def.guardRadius();
    let minD = Infinity;
    for (let i = 0; i < 40; i++) {
      def.guardT = 5; car.carryingGuard = 0;
      step(s);
      minD = Math.min(minD, Math.hypot(car.pos.x - def.pos.x, car.pos.y - def.pos.y));
    }
    expect(minD).toBeGreaterThan(R - 3);
  });
});

describe('human offense vs AI defender (Monte Carlo, 1 defender, 45px away, you press Spin)', () => {
  function trial(level: number) {
    const { s, popups } = makeScene(level);
    const me = s.players[0], ai = s.players[4];
    unfreeze(me, 500, 300); unfreeze(ai, 545, 300);
    s.grantPuck(me);
    s.diff = difficultyAt(level);
    press('E'); step(s); release('E');
    step(s, 100);
    const stolen = s.puck.carriedBy?.team === 1;
    const ev = popups.find((p) => ['PARRY!', 'BLOCKED', 'TOO EARLY', 'TOO LATE', 'WRONG MOVE'].includes(p));
    if (stolen) return 'stolen';
    if (ev === 'BLOCKED') return 'stuffed';
    if (ev) return 'ai-whiffed';
    return 'clean';
  }
  const run = (level: number, n = 150) => {
    const c: Record<string, number> = { stolen: 0, stuffed: 0, 'ai-whiffed': 0, clean: 0 };
    for (let i = 0; i < n; i++) c[trial(level)]++;
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
  };

  it('ramps from forgiving to hard, and the AI visibly whiffs on the way', () => {
    const r: any[] = [0, 0.5, 1].map((l) => ({ l, ...run(l) }));
    console.log('\nhuman Spin vs 1 AI defender  (stolen / stuffed / AI whiffed / clean escape)');
    for (const x of r) console.log(`  level ${x.l}:  ${(x.stolen * 100).toFixed(0)}% / ${(x.stuffed * 100).toFixed(0)}% / ${(x['ai-whiffed'] * 100).toFixed(0)}% / ${(x.clean * 100).toFixed(0)}%`);
    const neutral = (x: any) => x.stolen + x.stuffed;
    expect(neutral(r[0])).toBeLessThan(0.3);
    expect(neutral(r[2])).toBeGreaterThan(neutral(r[0]) + 0.2);
    expect(neutral(r[2])).toBeLessThan(0.85); // still beatable at full level
    expect(r[1]['ai-whiffed'] + r[0]['ai-whiffed']).toBeGreaterThan(0.03); // baiting a bad parry is possible
  });
});

describe('AI carrier actually tests your defense', () => {
  it('jukes soon after a defender gets close (easy levels especially)', () => {
    const firstJukeTime = (level: number) => {
      const { s } = makeScene(level);
      const def = s.players[0], car = s.players[4];
      unfreeze(def, 560, 300); unfreeze(car, 760, 300);
      s.grantPuck(car);
      for (let i = 0; i < 60 * 6; i++) { step(s); if (car.moveSeq > 0) return i / 60; }
      return 6;
    };
    const avg = (l: number) => { let t = 0; for (let i = 0; i < 25; i++) t += firstJukeTime(l); return t / 25; };
    const a0 = avg(0), a1 = avg(1);
    console.log(`\nmean seconds until the AI carrier's first juke: level 0 = ${a0.toFixed(2)}s, level 1 = ${a1.toFixed(2)}s`);
    expect(a0).toBeLessThan(2.5);
    expect(a1).toBeLessThan(4);
  });

  it('opponents skate slower at low levels', () => {
    const dist = (level: number) => {
      const { s } = makeScene(level);
      const car = s.players[4];
      unfreeze(car, 900, 300); s.grantPuck(car);
      car.moveCd = 99;
      const x0 = car.pos.x;
      step(s, 60);
      return Math.abs(car.pos.x - x0);
    };
    const d0 = dist(0), d1 = dist(1);
    console.log(`distance an AI carrier covers in 1s: level 0 = ${d0.toFixed(0)}px, level 1 = ${d1.toFixed(0)}px`);
    expect(d0).toBeLessThan(d1 * 0.75);
  });
});

describe('juke payoff for the player (the "moves felt bad" regression)', () => {
  /** Distance covered during the dash window (the effect phase), holding RIGHT the whole time. */
  function dashWindowDistance(move: 'spin' | 'deke' | null, windowSec: number) {
    const { s } = makeScene(0);
    const me = s.players[0];
    unfreeze(me, 300, 300); s.grantPuck(me);
    H.keys.get('D').isDown = true;
    step(s, 40);
    if (move) {
      const k = H.keys.get(move === 'spin' ? 'E' : 'F'); k._just = true; k.isDown = true; step(s); k.isDown = false;
      while (me.move && !me.moveResolved) step(s);
      step(s); // resolution frame has applied the dash
    }
    const x0 = me.pos.x;
    step(s, Math.round(windowSec * 60));
    H.keys.get('D').isDown = false;
    return me.pos.x - x0;
  }
  it('a landed move out-runs a plain sprint by a clear margin over the same time (old impulse: ~+7px total)', () => {
    const spinT = MOVE_DEFS.spin.effect, dekeT = MOVE_DEFS.deke.effect;
    const sprintSpin = dashWindowDistance(null, spinT), spin = dashWindowDistance('spin', spinT);
    const sprintDeke = dashWindowDistance(null, dekeT), deke = dashWindowDistance('deke', dekeT);
    console.log(`\nover the dash window:  spin ${spin.toFixed(0)}px vs sprint ${sprintSpin.toFixed(0)}px  ·  deke ${deke.toFixed(0)}px vs sprint ${sprintDeke.toFixed(0)}px`);
    expect(spin).toBeGreaterThan(sprintSpin + 30);
    expect(deke).toBeGreaterThan(sprintDeke + 55);
    expect(deke).toBeGreaterThan(spin); // the slow move pays off more
  });

  it('you can aim the dash: point DOWN at the end of the tell and the dash goes down', () => {
    const { s } = makeScene(0);
    const me = s.players[0];
    unfreeze(me, 300, 200); s.grantPuck(me);
    H.keys.get('D').isDown = true; step(s, 20);
    const k = H.keys.get('F'); k._just = true; k.isDown = true; step(s); k.isDown = false;
    H.keys.get('D').isDown = false; H.keys.get('S').isDown = true; // swap direction mid-tell
    const y0 = me.pos.y;
    while (me.move && !me.moveResolved) step(s);
    step(s, 12);
    H.keys.get('S').isDown = false;
    expect(me.pos.y - y0).toBeGreaterThan(40);
  });
});

const hold = (code: string, on = true) => { const k = H.keys.get(code); k.isDown = on; if (on) k._just = true; };
const releaseAll = () => { for (const k of H.keys.values()) { k.isDown = false; k._just = false; } };

describe('controls: arrows + left-hand E/F', () => {
  const offense = () => {
    releaseAll();
    const { s, popups } = makeScene(0);
    const me = s.players[0];
    unfreeze(me, 400, 300); s.grantPuck(me);
    return { s, popups, me };
  };
  it('arrow keys skate', () => {
    for (const [code, axis, sign] of [['RIGHT', 'x', 1], ['LEFT', 'x', -1], ['UP', 'y', -1], ['DOWN', 'y', 1]] as const) {
      const { s, me } = offense();
      const p0 = me.pos[axis];
      hold(code); step(s, 30); hold(code, false);
      expect((me.pos[axis] - p0) * sign).toBeGreaterThan(30);
    }
  });
  it('E = Spin and F = Deke (J / K still work as alternates)', () => {
    for (const [code, move] of [['E', 'spin'], ['F', 'deke'], ['J', 'spin'], ['K', 'deke']] as const) {
      const { s, me } = offense();
      press(code); step(s); release(code);
      expect(me.move).toBe(move);
    }
  });
  it('the on-screen key hint shows the primary keys (E / F)', async () => {
    const { ACTION_KEYS } = await import('../config/bindings');
    expect(ACTION_KEYS.spin[0]).toBe('E');
    expect(ACTION_KEYS.deke[0]).toBe('F');
  });
});

describe('shooting: lock-on aim + a real release window', () => {
  const setup = (x = 700, y = 300) => {
    releaseAll();
    const { s, popups } = makeScene(0);
    const me = s.players[0];
    unfreeze(me, x, y); s.grantPuck(me);
    const goalie = s.players.find((p: any) => p.team === 1 && p.isGoalie);
    return { s, popups, me, goalie };
  };
  /** Charge for `frames` with optional held keys, then release; return the puck's launch speed. */
  const shoot = (s: any, frames: number, keys: string[] = []) => {
    hold('SHIFT'); for (const k of keys) hold(k);
    step(s, frames);
    hold('SHIFT', false); for (const k of keys) hold(k, false);
    step(s, 1);
    return Math.hypot(s.puck.vel.x, s.puck.vel.y);
  };

  it('UP/DOWN slide the aim reticle while charging and do NOT skate you vertically', () => {
    const { s, me } = setup();
    hold('SHIFT'); hold('DOWN');
    step(s, 12); // 0.2s
    expect(me.aimY).toBeGreaterThan(0.25);
    expect(me.aimY).toBeLessThan(0.55);
    step(s, 20);
    expect(Math.abs(me.pos.y - 300)).toBeLessThan(3);
    hold('DOWN', false); hold('UP');
    step(s, 30);
    expect(me.aimY).toBeLessThan(0.2); // it slid back up
    releaseAll();
  });

  it('LEFT/RIGHT still skate while charging, but slower than normal', () => {
    const run = (charge: boolean) => {
      const { s, me } = setup(500, 300);
      if (charge) hold('SHIFT');
      hold('RIGHT'); step(s, 30);
      const x = me.pos.x; releaseAll();
      return x - 500;
    };
    const free = run(false), charging = run(true);
    expect(charging).toBeGreaterThan(15);
    expect(charging).toBeLessThan(free * 0.85);
  });

  it('aim is ALWAYS on net: full-up, centre and full-down shots all score, from every angle', () => {
    for (const [x, y] of [[900, 300], [800, 140], [800, 460], [600, 300], [980, 200]]) {
      for (const keys of [['UP'], [], ['DOWN']]) {
        const { s } = setup(x, y);
        shoot(s, 40, keys); // 0.67s ≈ full charge
        for (let i = 0; i < 160 && s.score[0] === 0; i++) step(s);
        expect({ from: [x, y], aim: keys[0] ?? 'centre', scored: s.score[0] }).toEqual({ from: [x, y], aim: keys[0] ?? 'centre', scored: 1 });
      }
    }
  });

  it('release inside the window is PERFECT (and faster); over-holding past it is not', () => {
    const early = setup(); const perfect = setup(); const late = setup();
    const vEarly = shoot(early.s, 12);
    const vPerfect = shoot(perfect.s, 36); // 0.6s — inside the window
    const vLate = shoot(late.s, 100); // 1.67s — charge has bled away
    expect(perfect.popups).toContain('!');
    expect(early.popups).not.toContain('!');
    expect(late.popups).not.toContain('!');
    expect(vPerfect).toBeGreaterThan(vEarly);
    expect(vPerfect).toBeGreaterThan(vLate * 1.3); // holding too long is worse than releasing on time
  });

  it('the goalie shows the release window while you charge — and only then', () => {
    const { s, goalie } = setup();
    step(s, 3);
    expect(goalie.shotCue).toBeNull();
    hold('SHIFT');
    step(s, 15);
    expect(goalie.shotCue).not.toBeNull();
    expect(goalie.shotCue.inWindow).toBe(false);
    expect(goalie.shotCue.progress).toBeGreaterThan(0);
    step(s, 25); // ~0.67s
    expect(goalie.shotCue.inWindow).toBe(true);
    step(s, 40); // over-held: window has closed again
    expect(goalie.shotCue.inWindow).toBe(false);
    hold('SHIFT', false);
    step(s, 2);
    expect(goalie.shotCue).toBeNull();
  });

  it('starting a juke cancels a charge in progress', () => {
    const { s, me } = setup();
    hold('SHIFT'); step(s, 20);
    expect(me.charging).toBe(true);
    press('F'); step(s); release('F');
    expect(me.charging).toBe(false);
    expect(me.move).toBe('deke');
    releaseAll();
  });
});
