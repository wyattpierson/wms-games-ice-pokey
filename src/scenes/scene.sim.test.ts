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
    on: () => {},
  };
  class Scene {
    add = H.U; tweens = H.U; time = H.U; cameras = H.U; textures = H.U; sys = H.U; scale = H.U;
    input = { keyboard: kb };
    events = { on: () => {}, once: () => {}, off: () => {} };
    constructor(_k?: unknown) {}
  }
  return {
    default: {
      Scene,
      // Base classes for UI objects (MenuButton/TextButton) evaluated at import time.
      // Never instantiated in these tests — empty stubs satisfy `extends`.
      GameObjects: { Text: class {}, Container: class {} },
      Input: { Keyboard: { JustDown: (k: any) => { const j = k._just; k._just = false; return j; }, JustUp: () => false } },
    },
  };
});

import { difficultyAt } from '../config/difficulty';
import { MOVE_DEFS, windowSeconds } from '../core/moves';
import * as C from '../config/gameplay';
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
  car.facing = Math.PI; // AI team attacks left: the defender is in front of it
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
    expect(car.hp).toBe(car.stats.maxHp); // …and a stuffed move is parry/stuff territory: no damage
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
  /** Distance travelled (straight-line) during the dash window, holding RIGHT the whole time. */
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
    const x0 = me.pos.x, y0 = me.pos.y;
    step(s, Math.round(windowSec * 60));
    H.keys.get('D').isDown = false;
    return Math.hypot(me.pos.x - x0, me.pos.y - y0);
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

// ---------------------------------------------------------------------------------------------
// Session 7: parry cone, one-timer, move paths, check hits / HP / down, goalie
// ---------------------------------------------------------------------------------------------

describe('parry cone: you must be in FRONT of the carrier', () => {
  const setup = (dx: number, dy: number) => {
    releaseAll();
    const { s, popups } = makeScene(0);
    const def = s.players[0], car = s.players[4];
    unfreeze(car, 690, 300); car.facing = Math.PI; // faces left
    unfreeze(def, 690 + dx, 300 + dy);
    s.grantPuck(car); s.puck.update(0.016);
    car.moveCd = 0; car.startMove('deke', 1); car.moveCd = 99;
    step(s, 1);
    expect(s.controlled).toBe(def);
    return { s, popups, def, car };
  };
  const parryAtCentre = (s: any, def: any, car: any) => {
    const win = windowSeconds(car.tellDur, def.stats.parryFrac);
    while (car.moveT < car.tellDur - win / 2) step(s);
    press('F'); step(s); release('F'); step(s, 2);
  };

  it('in front (even a bit off-axis) the parry works', () => {
    for (const [dx, dy] of [[-45, 0], [-45, 25], [-40, -28]]) {
      const { s, def, car } = setup(dx, dy);
      parryAtCentre(s, def, car);
      expect(s.puck.carriedBy).toBe(def);
    }
  });
  it('from the side or behind it does NOT count — it whiffs and says why', () => {
    for (const [dx, dy] of [[0, 45], [0, -45], [45, 0], [30, 40]]) {
      const { s, popups, def, car } = setup(dx, dy);
      parryAtCentre(s, def, car);
      expect(popups).toContain('NOT IN FRONT');
      expect(s.puck.carriedBy).toBe(car);
      expect(def.stagger).toBeGreaterThan(0.2);
    }
  });
  it('the cone on the tell is white when you are inside it and red when you are not', () => {
    const front = setup(-45, 10), side = setup(0, 45);
    step(front.s, 2); step(side.s, 2);
    expect(front.car.tellHint?.inCone).toBe(true);
    expect(side.car.tellHint?.inCone).toBe(false);
  });
  it('the AI is bound by the same cone (a mispositioned AI defender whiffs)', () => {
    // AI defender BESIDE the user's carrier, parrying at the right moment
    releaseAll();
    const { s } = makeScene(1); // level 1: reads well
    const me = s.players[0], ai = s.players[4];
    unfreeze(me, 500, 300); unfreeze(ai, 500, 345);
    s.grantPuck(me); s.puck.update(0.016);
    me.moveCd = 0; me.startMove('spin', 1);
    let parried = 0;
    for (let i = 0; i < 90; i++) { step(s); if (s.puck.carriedBy === ai) parried++; }
    expect(parried).toBe(0);
  });
});

describe('one-timer: a shot right off a pass', () => {
  const passSetup = (far = false) => {
    releaseAll();
    const { s, popups } = makeScene(0);
    const me = s.players[0], mate = s.players[1];
    unfreeze(me, 800, 336); unfreeze(mate, far ? 300 : 540, 336);
    s.grantPuck(mate); s.puck.update(0.016);
    s.doPass(mate, me); mate.stagger = 999;
    return { s, popups, me, mate };
  };
  const stepUntilEta = (s: any, me: any, eta: number) => {
    for (let i = 0; i < 240; i++) { step(s); const inc = s.incomingPass(me); if (inc && inc.eta <= eta) return true; }
    return false;
  };
  const stepUntil = (s: any, f: () => boolean, max = 240) => { for (let i = 0; i < max && !f(); i++) step(s); return f(); };

  it('passing hands you control of the receiver', () => {
    const { s, me } = passSetup();
    step(s);
    expect(s.controlled).toBe(me);
  });

  it('a Shoot press inside the window fires an instant, hard shot the moment the puck arrives', () => {
    const { s, popups, me } = passSetup();
    expect(stepUntilEta(s, me, 0.3)).toBe(true);
    press('SHIFT'); step(s); release('SHIFT');
    expect(s.oneTimerArmed?.player).toBe(me);
    expect(stepUntil(s, () => s.puck.quick, 120)).toBe(true);
    expect(popups).toContain('ONE-TIMER!');
    expect(s.puck.vel.x).toBeGreaterThan(400); // toward the goal
    expect(Math.hypot(s.puck.vel.x, s.puck.vel.y)).toBeGreaterThan(C.SHOT_SPEED_MAX * me.stats.shotPower * 0.85 * C.ONE_TIMER_MULT);
    expect(me.carrying).toBe(false);
  });

  it('with no press you just catch the pass', () => {
    const { s, me } = passSetup();
    expect(stepUntil(s, () => me.carrying, 200)).toBe(true);
    expect(s.puck.quick).toBe(false);
  });

  it('a press that is too EARLY does nothing: no one-timer, and it does NOT plant a check', () => {
    const { s, me } = passSetup(true);
    step(s, 3);
    expect(s.incomingPass(me)!.eta).toBeGreaterThan(C.ONE_TIMER_LEAD);
    press('SHIFT'); step(s); release('SHIFT');
    expect(s.oneTimerArmed).toBeNull();
    expect(me.guardT).toBe(0);
    expect(stepUntil(s, () => me.carrying, 300)).toBe(true);
    expect(s.puck.quick).toBe(false);
  });

  it('once ARMED, Up/Down picks the corner instead of skating you off the pass', () => {
    const { s, me } = passSetup();
    expect(stepUntilEta(s, me, 0.3)).toBe(true);
    const y0 = me.pos.y;
    press('SHIFT'); hold('DOWN'); step(s, 8); release('SHIFT');
    expect(Math.abs(me.pos.y - y0)).toBeLessThan(8); // (one frame of input leaks before the press arms the lock)
    expect(stepUntil(s, () => s.puck.quick, 120)).toBe(true);
    expect(s.puck.vel.y).toBeGreaterThan(0); // aimed at the bottom corner
    releaseAll();
  });

  it('a press just AFTER catching it (inside the grace) still fires; a late one starts a normal charge', () => {
    const a = passSetup();
    expect(stepUntil(a.s, () => a.me.carrying, 200)).toBe(true);
    step(a.s, 2);
    press('SHIFT'); step(a.s); release('SHIFT');
    expect(a.s.puck.quick).toBe(true);

    const b = passSetup();
    expect(stepUntil(b.s, () => b.me.carrying, 200)).toBe(true);
    step(b.s, Math.round((C.ONE_TIMER_GRACE + 0.15) * 60));
    press('SHIFT'); step(b.s, 3);
    expect(b.me.charging).toBe(true);
    expect(b.s.puck.quick).toBe(false);
    releaseAll();
  });

  it('the receiver gets a ring that turns white (ONE-TIMER!) as the pass arrives', () => {
    const { s, me } = passSetup(true);
    step(s, 2);
    expect(me.shotCue).not.toBeNull();
    expect(me.shotCue.inWindow).toBe(false);
    expect(stepUntilEta(s, me, C.ONE_TIMER_LEAD - 0.05)).toBe(true);
    step(s);
    expect(me.shotCue.inWindow).toBe(true);
    expect(me.shotCue.label).toBe('ONE-TIMER!');
  });

  it('AI receivers one-time it more often at higher levels', () => {
    const rate = (level: number) => {
      let fired = 0;
      const N = 60;
      for (let n = 0; n < N; n++) {
        releaseAll();
        const { s } = makeScene(level);
        const rec = s.players[5], mate = s.players[4]; // team 1 attacks LEFT
        unfreeze(rec, 300, 336); unfreeze(mate, 520, 336);
        s.grantPuck(mate); s.puck.update(0.016);
        s.doPass(mate, rec); mate.stagger = 999;
        for (let i = 0; i < 100 && !rec.carrying && !s.puck.quick; i++) step(s);
        if (s.puck.quick) fired++;
      }
      return fired / N;
    };
    const lo = rate(0), hi = rate(1);
    console.log(`\nAI one-timer rate: level 0 = ${(lo * 100).toFixed(0)}%, level 1 = ${(hi * 100).toFixed(0)}%`);
    expect(hi).toBeGreaterThan(lo + 0.15);
    expect(hi).toBeLessThan(0.8);
  });
});

describe('one-timer vs charged shot against a LIVE goalie (it must be the better play)', () => {
  const goalRate = (mode: 'charged' | 'onet', level: number, dx: number) => {
    let goals = 0, N = 0;
    for (const aim of ['UP', 'DOWN']) for (let n = 0; n < 8; n++) {
      N++;
      releaseAll();
      const s: any = new GameScene(); s.opponentIdx = 0; s.create(); s.diff = difficultyAt(level); s.state = 'live';
      for (const p of s.players) { p.vel = { x: 0, y: 0 }; if (!(p.team === 1 && p.isGoalie)) { p.pos = { x: 60, y: 60 }; p.stagger = 999; } }
      const me = s.players[0], mate = s.players[1];
      const y = 336 + (n - 4) * 36;
      unfreeze(me, 1136 - dx, y);
      if (mode === 'charged') {
        s.grantPuck(me); hold('SHIFT'); hold(aim); step(s, 36); hold('SHIFT', false); hold(aim, false);
      } else {
        unfreeze(mate, 1136 - dx - 260, y); s.grantPuck(mate); s.puck.update(0.016);
        s.doPass(mate, me); mate.stagger = 999;
        let armed = false;
        for (let i = 0; i < 200 && !s.puck.quick; i++) {
          step(s);
          const inc = s.incomingPass(me);
          if (!armed && inc && inc.eta <= 0.3) { press('SHIFT'); hold(aim); armed = true; step(s); release('SHIFT'); }
        }
        hold(aim, false);
      }
      step(s);
      for (let i = 0; i < 160 && s.score[0] === 0; i++) step(s);
      goals += s.score[0];
    }
    return goals / N;
  };
  it('is the better play: never worse than a charged perfect shot, and better overall', () => {
    let onetTotal = 0, chargedTotal = 0;
    for (const level of [0, 1]) {
      for (const dx of [220, 320]) {
        const c = goalRate('charged', level, dx), o = goalRate('onet', level, dx);
        console.log(`\nlevel ${level}, ${dx}px: charged ${(c * 100).toFixed(0)}% / one-timer ${(o * 100).toFixed(0)}%`);
        expect(o).toBeGreaterThanOrEqual(c - 0.07); // per-cell noise allowance (the catch contest is random)
        onetTotal += o;
        chargedTotal += c;
      }
    }
    expect(onetTotal).toBeGreaterThan(chargedTotal * 1.2); // a clear edge in aggregate
  });
});

describe('moves go to different places (offense feel)', () => {
  const dashRun = (move: 'spin' | 'deke', threat?: { dx: number; dy: number }) => {
    releaseAll();
    const { s } = makeScene(0);
    const me = s.players[0];
    unfreeze(me, 300, 336); s.grantPuck(me);
    if (threat) s.players[4].pos = { x: me.pos.x + threat.dx, y: me.pos.y + threat.dy }; // frozen opponent = the threat
    hold('RIGHT'); step(s, 30);
    const k = H.keys.get(move === 'spin' ? 'E' : 'F'); k._just = true; k.isDown = true; step(s); k.isDown = false;
    while (me.move && !me.moveResolved) step(s);
    const p0 = { x: me.pos.x, y: me.pos.y };
    const headings: number[] = [];
    for (let i = 0; i < 40 && me.dashing; i++) { step(s); if (me.dashDir) headings.push(Math.atan2(me.dashDir.y, me.dashDir.x)); }
    hold('RIGHT', false);
    return { headings, dx: me.pos.x - p0.x, dy: me.pos.y - p0.y };
  };

  it('Spin CURVES: it swings out and bends back round toward your aim', () => {
    const { headings } = dashRun('spin');
    expect(headings[0]).toBeGreaterThan(0.7);
    expect(headings[headings.length - 1]).toBeLessThan(0.3);
    for (let i = 1; i < headings.length; i++) expect(headings[i]).toBeLessThanOrEqual(headings[i - 1] + 1e-6);
  });
  it('Deke CUTS: a straight line at a fixed angle off your aim', () => {
    const { headings } = dashRun('deke');
    for (const h of headings) expect(h).toBeCloseTo(MOVE_DEFS.deke.headFrom, 1);
  });
  it('both go AWAY from the nearest defender', () => {
    for (const move of ['spin', 'deke'] as const) {
      const above = dashRun(move, { dx: 60, dy: -30 }); // defender up-right → go down
      const below = dashRun(move, { dx: 60, dy: 30 }); // defender down-right → go up
      expect(above.dy).toBeGreaterThan(5);
      expect(below.dy).toBeLessThan(-5);
    }
  });
  it('they end in different places (the move you pick matters, not just the button)', () => {
    const a = dashRun('spin'), b = dashRun('deke');
    expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThan(30);
    expect(Math.abs(b.dy)).toBeGreaterThan(Math.abs(a.dy)); // the cut ends further off-line than the curve
  });
});

describe('check = a hit (knock-back, stun, HP) — never a steal', () => {
  const checkSetup = (level = 0, carX = 680) => {
    releaseAll();
    const { s, popups } = makeScene(level);
    const def = s.players[0], car = s.players[4];
    unfreeze(def, 640, 300); unfreeze(car, carX, 300); car.facing = Math.PI;
    s.grantPuck(car); s.puck.update(0.016);
    car.moveCd = 99; car.decideTimer = 99;
    step(s, 1);
    expect(s.controlled).toBe(def);
    return { s, popups, def, car };
  };

  it('checking a carrier who is not mid-move knocks them back, stuns them and costs HP — but keeps the puck on them', () => {
    const { s, popups, def, car } = checkSetup();
    const hp0 = car.hp;
    car.vel = { x: 0, y: 0 }; // stationary → impact 0.6 exactly
    press('SHIFT'); step(s); release('SHIFT');
    const expected = (C.CHECK_DAMAGE_BASE + C.CHECK_DAMAGE_PER_DEF * def.stats.checkPower) * 0.6; // stationary → impact 0.6
    expect(hp0 - car.hp).toBeCloseTo(expected, 3);
    expect(car.vel.x).toBeGreaterThan(100); // thrown back, away from the defender
    expect(car.stagger).toBeGreaterThan(0.1);
    expect(s.puck.carriedBy).toBe(car); // never a steal
    expect(popups.some((t: string) => t.startsWith('-'))).toBe(true);
  });

  it('a carrier mid-move is NOT hit (that is parry / stuff territory)', () => {
    const { s, car } = checkSetup();
    car.moveCd = 0; car.startMove('deke', 1); car.moveCd = 99;
    const hp0 = car.hp;
    press('SHIFT'); step(s); release('SHIFT');
    expect(car.hp).toBe(hp0);
  });

  it('running into a planted defender hurts — once per stance, not every frame', () => {
    const { s, def, car } = checkSetup(0, 700); // 60px: outside the instant-strike reach
    car.stagger = 999; // (frozen AI: we drive it ourselves so the test is deterministic)
    press('SHIFT'); step(s); release('SHIFT');
    expect(car.hp).toBe(car.stats.maxHp); // not struck on the press
    car.vel = { x: -300, y: 0 }; // …now it barrels into the wall
    let hpAfterHit = -1;
    for (let i = 0; i < 20; i++) {
      step(s);
      if (hpAfterHit < 0 && car.hp < car.stats.maxHp) hpAfterHit = car.hp;
    }
    expect(hpAfterHit).toBeGreaterThan(0);
    expect(hpAfterHit).toBeLessThan(car.stats.maxHp);
    expect(def.checkHit.has(car)).toBe(true);
    car.vel = { x: -300, y: 0 }; step(s, 3); // shove it into the wall AGAIN, same stance
    expect(car.hp).toBeCloseTo(hpAfterHit, 5);
  });

  it('a harder hit does more damage than a gentle one', () => {
    const dmg = (carSpeed: number) => {
      const { s, car } = checkSetup(0, 680);
      car.vel = { x: -carSpeed, y: 0 };
      const hp0 = car.hp;
      press('SHIFT'); step(s); release('SHIFT');
      return hp0 - car.hp;
    };
    expect(dmg(300)).toBeGreaterThan(dmg(0) * 1.4);
  });

  it('at 0 HP a player is knocked down: drops the puck, lies there, stands back up healed', () => {
    const { s, popups, car } = checkSetup();
    s.damage(car, 99999);
    expect(car.down).toBe(true);
    expect(popups).toContain('DOWN!');
    expect(s.puck.carriedBy).toBeNull();
    expect(s.puck.state).toBe('loose');
    step(s, Math.round((C.DOWN_TIME - 0.5) * 60));
    expect(car.down).toBe(true);
    step(s, Math.round(1.0 * 60));
    expect(car.down).toBe(false);
    expect(car.hp).toBe(car.stats.maxHp);
  });

  it('a downed player does not block, push or pick up the puck', () => {
    const { s, def, car } = checkSetup();
    s.damage(car, 99999);
    unfreeze(def, car.pos.x, car.pos.y); // standing right on top of them
    const p0 = { x: car.pos.x, y: car.pos.y };
    s.puck.state = 'loose'; s.puck.carriedBy = null; s.puck.pos = { x: car.pos.x + 3, y: car.pos.y }; s.puck.vel = { x: 0, y: 0 };
    step(s, 5);
    expect(Math.hypot(car.pos.x - p0.x, car.pos.y - p0.y)).toBeLessThan(1);
    expect(s.puck.carriedBy).not.toBe(car);
  });

  it('HP comes back after a few quiet seconds', () => {
    const { s, car } = checkSetup();
    s.damage(car, 25);
    const low = car.hp;
    step(s, Math.round((C.HP_REGEN_DELAY - 0.5) * 60));
    expect(car.hp).toBe(low); // still waiting
    step(s, Math.round(2.5 * 60));
    expect(car.hp).toBeGreaterThan(low + 3);
    expect(car.hp).toBeLessThanOrEqual(car.stats.maxHp);
  });

  it('the AI hits softer at low levels (so level 0 does not punish)', () => {
    const lossAt = (level: number) => {
      releaseAll();
      const { s } = makeScene(level);
      const me = s.players[0], ai = s.players[4];
      unfreeze(me, 640, 300); unfreeze(ai, 675, 300);
      s.grantPuck(me); s.puck.update(0.016);
      me.moveCd = 99; me.decideTimer = 99;
      const hp0 = me.hp;
      s.doCheck(ai);
      return hp0 - me.hp;
    };
    const l0 = lossAt(0), l1 = lossAt(1);
    expect(l0).toBeGreaterThan(0);
    expect(l0 / l1).toBeCloseTo(difficultyAt(0).aiCheckDamage, 2);
  });

  it('HP is restored at every faceoff', () => {
    const { s, car } = checkSetup();
    s.damage(car, 99999);
    s.resetPositions();
    expect(car.down).toBe(false);
    expect(car.hp).toBe(car.stats.maxHp);
  });
});

describe('goalie: plays the angle, reads shots, is not slowed by difficulty', () => {
  const goalieOf = (s: any) => s.players.find((p: any) => p.team === 1 && p.isGoalie);
  const settle = (puckY: number, puckX: number) => {
    releaseAll();
    const { s } = makeScene(0);
    const g = goalieOf(s);
    unfreeze(g, g.home.x, g.home.y); // makeScene froze everyone
    s.puck.state = 'loose'; s.puck.carriedBy = null; s.puck.pos = { x: puckX, y: puckY }; s.puck.vel = { x: 0, y: 0 };
    step(s, 150);
    return g.pos.y;
  };

  it('keeps (nearly) full speed at level 0 — a slowed goalie just gives the net away', () => {
    const { s } = makeScene(0);
    step(s, 2);
    const g = goalieOf(s);
    expect(g.speedScale).toBeGreaterThanOrEqual(0.9);
    expect(g.speedScale).toBeGreaterThan(difficultyAt(0).aiSpeed);
  });

  it('plays the ANGLE: with the puck far away it stays near the middle instead of mirroring it', () => {
    const far = Math.abs(settle(536, 400) - 336); // puck 200 off-centre, far from the net
    const near = Math.abs(settle(536, 1000) - 336); // same height, close in
    expect(far).toBeLessThan(80);
    expect(near).toBeGreaterThan(far + 10);
  });

  it('ignores a PASS but reacts to a SHOT — and restarts its reaction clock on every new shot', () => {
    releaseAll();
    const { s } = makeScene(0);
    const me = s.players[0], mate = s.players[1], g = goalieOf(s);
    unfreeze(g, g.home.x, g.home.y);
    unfreeze(me, 800, 336); unfreeze(mate, 560, 336);
    s.grantPuck(mate); s.puck.update(0.016);
    s.doPass(mate, me); mate.stagger = 999;
    step(s, 12);
    expect(g.goalieReactAt).toBeNull(); // a pass at the net is not a shot
    for (let i = 0; i < 200 && !me.carrying; i++) step(s);
    s.shootPuck(me, 1, 0.9);
    step(s, 3);
    expect(g.goalieReactAt).not.toBeNull();
    const first = g.goalieReactAt;
    s.puck.launch({ x: 1, y: 0 }, 600, me); // a NEW shot
    step(s, 3);
    expect(g.goalieReactAt).toBeGreaterThan(first);
  });

  it('shots are scoreable but not free: centre is saved, long shots are saved, close corners can score', () => {
    const rate = (level: number, dx: number, aim: string | null) => {
      let goals = 0, N = 0;
      for (let n = 0; n < 12; n++) {
        N++;
        releaseAll();
        const s: any = new GameScene(); s.opponentIdx = 0; s.create(); s.diff = difficultyAt(level); s.state = 'live';
        for (const p of s.players) { p.vel = { x: 0, y: 0 }; if (!(p.team === 1 && p.isGoalie)) { p.pos = { x: 60, y: 60 }; p.stagger = 999; } }
        const me = s.players[0];
        unfreeze(me, 1136 - dx, 336 + (n - 6) * 28);
        s.grantPuck(me);
        hold('SHIFT'); if (aim) hold(aim);
        step(s, 36);
        hold('SHIFT', false); if (aim) hold(aim, false);
        step(s);
        for (let i = 0; i < 160 && s.score[0] === 0; i++) step(s);
        goals += s.score[0];
      }
      return goals / N;
    };
    const close0 = Math.max(rate(0, 220, 'UP'), rate(0, 220, 'DOWN'));
    const far0 = Math.max(rate(0, 600, 'UP'), rate(0, 600, 'DOWN'));
    const close1 = Math.max(rate(1, 220, 'UP'), rate(1, 220, 'DOWN'));
    console.log(`\ncorner goal rate: close L0 ${(close0 * 100).toFixed(0)}%, close L1 ${(close1 * 100).toFixed(0)}%, far L0 ${(far0 * 100).toFixed(0)}%`);
    expect(close0).toBeGreaterThan(0.1);
    expect(close0).toBeLessThan(0.65);
    expect(close1).toBeGreaterThan(0.05);
    expect(close1).toBeLessThanOrEqual(close0 + 0.05); // harder at higher levels
    expect(far0).toBeLessThan(0.1);
    expect(rate(0, 600, null)).toBeLessThan(0.1);
  });
});
