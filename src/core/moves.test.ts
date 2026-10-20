import { describe, expect, it } from 'vitest';
import {
  ALL_MOVES, dashHeading, dashSpeedAt, dekeAxis, dekeVerticalDir, inFrontCone, lateralSignY, MOVE_DEFS, movePhase,
  parryTiming, sideAwayFrom, verticalFromStick, windowSeconds,
} from './moves';
import { PARRY_CONE_HALF } from '../config/gameplay';
import { v } from './vec2';

describe('windowSeconds', () => {
  it('is a fraction of the tell', () => {
    expect(windowSeconds(0.5, 0.5)).toBeCloseTo(0.25, 5);
    expect(windowSeconds(1.0, 0.35)).toBeCloseTo(0.35, 5);
  });
  it('has a floor and never swallows the whole tell', () => {
    expect(windowSeconds(0.3, 0.01)).toBeCloseTo(0.07, 5);
    expect(windowSeconds(0.3, 5)).toBeCloseTo(0.27, 5);
  });
  it('scales with the tell (longer tell → longer window at the same stat)', () => {
    expect(windowSeconds(0.9, 0.5)).toBeGreaterThan(windowSeconds(0.3, 0.5));
  });
});

describe('parryTiming', () => {
  const TELL = 0.5;
  const FRAC = 0.5; // window = last 0.25s → opens at 0.25
  it('presses before the window opens are early', () => {
    expect(parryTiming(TELL, 0.01, FRAC)).toBe('early');
    expect(parryTiming(TELL, 0.24, FRAC)).toBe('early');
  });
  it('presses inside the window succeed (inclusive at both ends)', () => {
    expect(parryTiming(TELL, 0.25, FRAC)).toBe('success');
    expect(parryTiming(TELL, 0.4, FRAC)).toBe('success');
    expect(parryTiming(TELL, TELL, FRAC)).toBe('success');
  });
  it('presses after the tell ends are late', () => {
    expect(parryTiming(TELL, TELL + 0.01, FRAC)).toBe('late');
  });
});

describe('movePhase', () => {
  it('walks tell → effect → done for a given tell/effect length', () => {
    expect(movePhase(0.5, 0.2, 0)).toBe('tell');
    expect(movePhase(0.5, 0.2, 0.49)).toBe('tell');
    expect(movePhase(0.5, 0.2, 0.5)).toBe('effect');
    expect(movePhase(0.5, 0.2, 0.69)).toBe('effect');
    expect(movePhase(0.5, 0.2, 0.7)).toBe('done');
  });
});

describe('move set', () => {
  it('ships with exactly 2 moves enabled: a fast one and a slow, bigger one', () => {
    expect(ALL_MOVES).toEqual(['spin', 'deke']);
    expect(MOVE_DEFS.deke.tell).toBeGreaterThan(MOVE_DEFS.spin.tell);
    expect(MOVE_DEFS.deke.dash * MOVE_DEFS.deke.effect).toBeGreaterThan(MOVE_DEFS.spin.dash * MOVE_DEFS.spin.effect);
  });
});

describe('dashSpeedAt', () => {
  it('starts at full speed, eases out, never goes backwards', () => {
    expect(dashSpeedAt(500, 0)).toBe(500);
    expect(dashSpeedAt(500, 1)).toBeCloseTo(275, 5);
    expect(dashSpeedAt(500, 0.5)).toBeLessThan(500);
    expect(dashSpeedAt(500, 0.5)).toBeGreaterThan(dashSpeedAt(500, 1));
    expect(dashSpeedAt(500, 9)).toBeCloseTo(275, 5); // clamped
  });
  it('a landed move carries you well past a body-width (≥70px even at the bottom of the skill range)', () => {
    for (const id of ALL_MOVES) {
      const d = MOVE_DEFS[id];
      let dist = 0;
      const N = 100;
      for (let i = 0; i < N; i++) dist += dashSpeedAt(d.dash * 0.75, i / N) * (d.effect / N);
      expect(dist).toBeGreaterThan(70);
    }
  });
});

describe('move paths: Spin curves round, Deke zig-zags sideways', () => {
  const spin = MOVE_DEFS.spin, deke = MOVE_DEFS.deke;
  const path = (m: typeof spin, side: 1 | -1 = 1) => {
    let x = 0, y = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const h = dashHeading(m, 0, side, i / N);
      x += Math.cos(h) * m.dash * (m.effect / N);
      y += Math.sin(h) * m.dash * (m.effect / N);
    }
    return { x, y, exit: dashHeading(m, 0, side, 1) };
  };

  it('Spin is a CURVE: it swings out and bends back round, changing heading smoothly and monotonically', () => {
    const start = dashHeading(spin, 0, 1, 0), end = dashHeading(spin, 0, 1, 1);
    expect(Math.abs(start - end)).toBeGreaterThan(0.8);
    let prev = start;
    for (let i = 1; i <= 20; i++) {
      const h = dashHeading(spin, 0, 1, i / 20);
      expect(h).toBeLessThanOrEqual(prev + 1e-9); // swings back toward the aim, never wobbles
      prev = h;
    }
  });
  it('Spin EXITS facing the aim (you wrap round the defender and keep going)', () => {
    expect(Math.abs(path(spin).exit)).toBeLessThan(0.1);
  });
  it('Deke is a SIDESTEP: it goes mostly across your travel and barely toward the goal', () => {
    const p = path(deke);
    expect(Math.abs(p.y)).toBeGreaterThan(90); // a real lateral shift (angle on the goalie)
    expect(Math.abs(p.x)).toBeLessThan(35); // …without zooming forward into the crease
    expect(Math.abs(p.y)).toBeGreaterThan(Math.abs(p.x) * 3);
  });
  it('Deke ZIG-ZAGS: the heading weaves back and forth across the sideways line', () => {
    const lateral = deke.headFrom;
    let crossings = 0;
    let prev = Math.sign(dashHeading(deke, 0, 1, 0) - lateral);
    for (let i = 1; i <= 100; i++) {
      const sgn = Math.sign(dashHeading(deke, 0, 1, i / 100) - lateral);
      if (sgn !== 0 && sgn !== prev) crossings++;
      if (sgn !== 0) prev = sgn;
    }
    expect(crossings).toBeGreaterThanOrEqual(2); // out, back, out
    // …but it never turns around: the whole weave stays on the same side of the travel line.
    for (let i = 0; i <= 100; i++) {
      const h = dashHeading(deke, 0, 1, i / 100);
      expect(Math.sin(h)).toBeGreaterThan(0.2);
    }
  });
  it('Deke is unaffected by the weave when zigAmp is absent (Spin is still a smooth monotonic curve)', () => {
    expect(spin.zigAmp).toBeUndefined();
  });
  it('side flips the direction symmetrically', () => {
    for (const m of [spin, deke]) {
      const a = path(m, 1), b = path(m, -1);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(-a.y, 6);
    }
  });
  it('the two moves end in genuinely different places and exit in different directions', () => {
    const a = path(spin), b = path(deke);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(60); // different end points
    expect(Math.abs(a.exit - b.exit)).toBeGreaterThan(0.6); // different exit headings
    expect(Math.abs(b.y)).toBeGreaterThan(Math.abs(a.y)); // deke ends further off to the side
    expect(a.x).toBeGreaterThan(b.x + 60); // …while Spin is the one that carries you FORWARD past a defender
  });
});

describe('Deke direction: always across the net, toward the open side', () => {
  it('lateralSignY says which way a move ends up on screen, mirrored by side', () => {
    expect(lateralSignY(MOVE_DEFS.deke, 0, 1)).toBe(1); // facing right, clockwise side → down
    expect(lateralSignY(MOVE_DEFS.deke, 0, -1)).toBe(-1);
    expect(lateralSignY(MOVE_DEFS.deke, Math.PI, 1)).toBe(-1); // facing left it mirrors
  });
  it('verticalFromStick: UP / DOWN are absolute screen directions; sideways pushes are ignored', () => {
    expect(verticalFromStick(v(0, 1))).toBe(1);
    expect(verticalFromStick(v(0, -1))).toBe(-1);
    expect(verticalFromStick(v(0.6, -0.8))).toBe(-1);
    expect(verticalFromStick(v(1, 0))).toBeNull();
    expect(verticalFromStick(v(0.95, 0.3))).toBeNull();
  });
});

describe('dekeVerticalDir / dekeAxis', () => {
  it('skating LOW it cuts HIGH, and skating high it cuts low (toward the more open side)', () => {
    expect(dekeVerticalDir(500, 336, null)).toBe(-1); // low on screen → up
    expect(dekeVerticalDir(150, 336, null)).toBe(1); // high → down
  });
  it('right on the middle there is no open side: away from the nearest defender, else down', () => {
    expect(dekeVerticalDir(336, 336, 300)).toBe(1); // defender above → go down
    expect(dekeVerticalDir(336, 336, 380)).toBe(-1);
    expect(dekeVerticalDir(340, 336, null)).toBe(1);
  });
  it('dekeAxis makes the zig-zag go the asked way for BOTH teams, mostly vertical, weaving toward their attacking end', () => {
    for (const team of [0, 1] as const) {
      for (const dirY of [-1, 1] as const) {
        const { base, side } = dekeAxis(team, dirY);
        expect(lateralSignY(MOVE_DEFS.deke, base, side)).toBe(dirY);
        for (let i = 0; i <= 20; i++) {
          const h = dashHeading(MOVE_DEFS.deke, base, side, i / 20);
          expect(Math.sign(Math.sin(h))).toBe(dirY); // never turns back across the net
        }
      }
    }
    expect(Math.cos(dekeAxis(0, 1).base)).toBeGreaterThan(0); // team 0 attacks right
    expect(Math.cos(dekeAxis(1, 1).base)).toBeLessThan(0);
  });
});

describe('sideAwayFrom', () => {
  it('heads away from the threat, whichever side it is on', () => {
    // facing +x (right); y grows downward on screen
    expect(sideAwayFrom(0, v(0, 0), v(30, 20))).toBe(-1); // threat below-right → go up (counter-clockwise)
    expect(sideAwayFrom(0, v(0, 0), v(30, -20))).toBe(1); // threat above-right → go down
    expect(sideAwayFrom(Math.PI, v(0, 0), v(-30, 20))).toBe(1); // mirrored when facing left
    expect(sideAwayFrom(0, v(0, 0), null)).toBe(1); // nobody near: default
  });
});

describe('parry cone', () => {
  const o = v(100, 100);
  it('counts in front, not beside or behind', () => {
    expect(inFrontCone(0, o, v(150, 100), PARRY_CONE_HALF)).toBe(true); // dead ahead
    expect(inFrontCone(0, o, v(150, 130), PARRY_CONE_HALF)).toBe(true); // ahead, a bit off
    expect(inFrontCone(0, o, v(100, 150), PARRY_CONE_HALF)).toBe(false); // directly beside (90°)
    expect(inFrontCone(0, o, v(50, 100), PARRY_CONE_HALF)).toBe(false); // behind
    expect(inFrontCone(Math.PI, o, v(50, 100), PARRY_CONE_HALF)).toBe(true); // facing left: left is front
  });
  it('is symmetric and wraps around ±π', () => {
    expect(inFrontCone(Math.PI - 0.1, o, v(50, 110), PARRY_CONE_HALF)).toBe(true);
    expect(inFrontCone(-Math.PI + 0.1, o, v(50, 90), PARRY_CONE_HALF)).toBe(true);
  });
  it('is a real cone: wide enough to be fair, narrow enough that the side is out', () => {
    expect(PARRY_CONE_HALF).toBeGreaterThan(0.7); // ≥ ~40° each side
    expect(PARRY_CONE_HALF).toBeLessThan(Math.PI / 2); // < 90°: the side is never in
  });
  it('a point on top of the carrier counts (no divide-by-zero)', () => {
    expect(inFrontCone(0, o, v(100, 100), PARRY_CONE_HALF)).toBe(true);
  });
});
