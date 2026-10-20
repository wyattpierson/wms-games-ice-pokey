/**
 * AI: one chaser per team, the rest zone behind the puck, carriers skate to the
 * goal and shoot/pass on a decision timer, goalies track the puck.
 *
 * Defense vs a carrier is HONEST (see core/aiPlan.ts): when a tell starts the
 * defender rolls a response — parry (can misread / mistime → whiffs), check
 * (block), or nothing — and also plants checks in front of a carrier who is
 * just dribbling at them, so jukes are the way past. Everything is scaled by
 * the difficulty level (config/difficulty.ts).
 */

import {
  FRIENDLY_GOALIE_BITE, FRIENDLY_GOALIE_LAG, FRIENDLY_GOALIE_READ, GOALIE_BITE_OFFSET, GOALIE_DEPTH,
  GOALIE_DIVE_FACTOR, GOALIE_FOOL_RANGE, GOALIE_FOOL_SPEED, GOALIE_SHOT_SPEED, ONE_TIMER_REACT_MULT,
  PARRY_RANGE, SHOT_RANGE,
} from '../config/gameplay';
import type { Difficulty } from '../config/difficulty';
import {
  CENTER_X, CENTER_Y, GOAL_BOTTOM, GOAL_TOP, ICE_X, ICE_Y, RINK_H, RINK_W,
} from '../config/rink';
import { add, clamp, dist, dot, len, norm, scale, sub, v, type Vec2 } from '../core/vec2';
import { ALL_MOVES, lateralSignY, MOVE_DEFS, type MoveId } from '../core/moves';
import { planGoalieResponse } from '../core/goalie';
import { planAiResponse } from '../core/aiPlan';
import type { Player } from './entities/Player';
import type { Puck } from './entities/Puck';

/** Position of the nearest opposing skater within `maxD` px (what a juke goes AWAY from), or null. */
export function nearestThreat(p: Player, players: Player[], maxD = 170): Vec2 | null {
  let best: Vec2 | null = null;
  let bd = maxD;
  for (const e of players) {
    if (e.team === p.team || e.isGoalie || e.down) continue;
    const d = dist(e.pos, p.pos);
    if (d < bd) {
      bd = d;
      best = e.pos;
    }
  }
  return best;
}

/** An AI defender plants a check when a dribbling carrier is this close and heading at them. */
const DRIBBLE_GUARD_RANGE = 70;

export interface AIWorld {
  players: Player[];
  puck: Puck;
  dt: number;
  time: number;
  rng: () => number;
  diff: Difficulty;
  pass: (from: Player, to: Player) => void;
  /** aimY: -1..1 along the goal mouth (beyond ±1 = wide). */
  shoot: (from: Player, aimY: number, charge: number) => void;
  /** AI parry attempt with a specific key (it may be the wrong one, or badly timed). */
  parry: (defender: Player, carrier: Player, key: MoveId) => void;
  /** AI check (block stance). */
  check: (defender: Player) => void;
  /** Where the puck was `lag` seconds ago (goalies position off this). Optional: falls back to the live puck. */
  puckAt?: (lag: number) => Vec2;
}

export function stepAI(p: Player, w: AIWorld): void {
  if (p.down || p.stagger > 0) {
    p.coast(w.dt); // staggered: no decisions, just glide to a stop
    return;
  }
  if (p.isGoalie) return stepGoalie(p, w);
  if (p.carrying) return stepCarrier(p, w);

  if (w.puck.state === 'loose' && p.aiChase) {
    const d = sub(w.puck.pos, p.pos);
    if (len(d) > 6) p.applyInput(norm(d), w.dt);
    else p.coast(w.dt);
    return;
  }

  // 1v1 vs the enemy carrier: plan a parry or a check against their tells,
  // and shadow from behind while doing it.
  const carrier = w.puck.state === 'carried' ? w.puck.carriedBy : null;
  if (carrier && carrier.team !== p.team) {
    const d = dist(p.pos, carrier.pos);
    if (d < PARRY_RANGE + 40) {
      this_step1v1(p, w, carrier);
      return;
    }
  }
  stepZone(p, w);
}

/**
 * 1v1 defense. When the carrier starts a move, roll ONE response (keyed by
 * `moveSeq`) and carry it out at its planned time. With no move in progress,
 * maybe plant a check in front of a carrier who is dribbling straight at us.
 */
function this_step1v1(p: Player, w: AIWorld, carrier: Player): void {
  if (carrier.move) {
    if (p.aiPlanSeq !== carrier.moveSeq) {
      p.aiPlanSeq = carrier.moveSeq;
      p.aiPlan = planAiResponse({
        moveId: carrier.move,
        moves: ALL_MOVES,
        tell: carrier.tellDur,
        windowFrac: p.stats.parryFrac,
        diff: w.diff,
        puckSense: p.stats.puckSense,
        rng: w.rng,
      });
    }
    const plan = p.aiPlan;
    if (plan.kind !== 'none' && carrier.moveT >= plan.at) {
      p.aiPlan = { kind: 'none' };
      if (plan.kind === 'parry') w.parry(p, carrier, plan.key);
      else w.check(p);
    }
  } else if (p.checkCd <= 0 && dist(p.pos, carrier.pos) < DRIBBLE_GUARD_RANGE) {
    // Dribbling straight at me? Plant and block forward progress.
    const toMe = norm(sub(p.pos, carrier.pos));
    const heading = norm(carrier.vel);
    if (len(carrier.vel) > 30 && dot(heading, toMe) > 0.3 && w.rng() < w.diff.aiPressureGuard * w.dt) {
      w.check(p);
    }
  }
  // Shadow: skate to a spot between the carrier and our own goal (i.e. in front
  // of the carrier) so parries / checks are in range.
  const ownGoal = v(p.team === 0 ? ICE_X : ICE_X + RINK_W, CENTER_Y);
  const back = norm(sub(ownGoal, carrier.pos));
  const spot = add(carrier.pos, scale(back, 40));
  const d = sub(spot, p.pos);
  if (len(d) > 8) p.applyInput(norm(d), w.dt);
  else p.coast(w.dt);
}

/**
 * Role-based positioning. Each field player has a distinct job (by roster
 * slot) instead of mirroring the puck in a fixed triangle:
 *   Offense:  slot 0 = slot player (in front of the enemy goal, weak side)
 *             slot 1 = receiver (safe spot behind the carrier, open side)
 *             slot 2 = roamer (neutral-zone support behind the play)
 *   Defense:  slot 0 = net-front (guards the slot in front of own goal)
 *             slot 1 = support (one step behind the puck toward own goal)
 *             slot 2 = cover (mirror side, ready to cut off the flip)
 */
function stepZone(p: Player, w: AIWorld): void {
  const atkRight = p.team === 0;
  const s = atkRight ? 1 : -1;
  const enemyGoal = v(atkRight ? ICE_X + RINK_W : ICE_X, CENTER_Y);
  const ownGoal = v(atkRight ? ICE_X : ICE_X + RINK_W, CENTER_Y);
  const carrier = w.puck.state === 'carried' ? w.puck.carriedBy : null;
  const onOffense = carrier !== null && carrier.team === p.team;

  let target: Vec2;
  if (onOffense) {
    const c = carrier!.pos;
    if (p.slot === 0) {
      // Slot: in front of the enemy goal, on the weak side (fewer defenders).
      target = v(enemyGoal.x - s * 135, CENTER_Y + weakSide(w, p.team) * 85);
    } else if (p.slot === 1) {
      // Receiver: a safe spot behind the carrier, on the open side.
      const back = norm(sub(ownGoal, c));
      const base = add(c, scale(back, 150));
      const perp = v(-back.y, back.x);
      const threat = nearestOpponent(w, p.team, base);
      const a = add(base, scale(perp, 95));
      const b = add(base, scale(perp, -95));
      target = threat
        ? (dist(a, threat.pos) >= dist(b, threat.pos) ? a : b)
        : (w.rng() < 0.5 ? a : b);
    } else {
      // Roamer: neutral support behind the play, hugging center ice.
      target = v(
        clamp(c.x - s * 175, ICE_X + 60, ICE_X + RINK_W - 60),
        CENTER_Y + (c.y - CENTER_Y) * 0.4,
      );
    }
  } else {
    const px = w.puck.pos.x;
    const py = w.puck.pos.y;
    if (p.slot === 0) {
      // Net-front: protect the slot in front of own goal, follow the puck.
      target = v(ownGoal.x + s * 140, CENTER_Y + clamp(py - CENTER_Y, -150, 150) * 0.7);
    } else if (p.slot === 1) {
      // Support: one step behind the puck toward own goal, offset to the side
      // so the carrier→goal lane isn't a full wall (passes should get through).
      const back = norm(sub(ownGoal, w.puck.pos));
      const side = scale(v(-back.y, back.x), p.seed < 0.5 ? -70 : 70);
      target = add(add(w.puck.pos, scale(back, 130)), side);
    } else {
      // Cover: mirror the puck's side, drift toward own goal.
      target = v(px + (ownGoal.x - px) * 0.3, CENTER_Y - (py - CENTER_Y) * 0.7);
    }
  }

  // Don't clump with teammates.
  for (const m of w.players) {
    if (m === p || m.team !== p.team || m.isGoalie) continue;
    const d = dist(target, m.pos);
    if (d > 0.01 && d < 64) target = add(target, scale(norm(sub(target, m.pos)), (64 - d) * 0.8));
  }

  target = v(
    clamp(target.x, ICE_X + 30, ICE_X + RINK_W - 30),
    clamp(target.y, ICE_Y + 30, ICE_Y + RINK_H - 30),
  );
  const d = sub(target, p.pos);
  if (len(d) > 12) p.applyInput(norm(d), w.dt, 0.95);
  else p.coast(w.dt);
}

/** -1 (top) or 1 (bottom): whichever side has fewer live opponents. */
function weakSide(w: AIWorld, team: number): number {
  let top = 0;
  let bottom = 0;
  for (const q of w.players) {
    if (q.team === team || q.down) continue;
    if (q.pos.y < CENTER_Y) top += 1;
    else bottom += 1;
  }
  return top <= bottom ? -1 : 1;
}

function nearestOpponent(w: AIWorld, team: number, at: Vec2): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const q of w.players) {
    if (q.team === team || q.down) continue;
    const d = dist(q.pos, at);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

function stepCarrier(p: Player, w: AIWorld): void {
  // Committed to a juke: ride it out (tell → effect), no steering.
  if (p.move && !p.moveResolved) {
    p.coast(w.dt);
    return;
  }

  const enemyGoal = p.team === 0 ? v(ICE_X + RINK_W, CENTER_Y) : v(ICE_X, CENTER_Y);

  // The goalie just got fooled by our move: take the open net while the window lasts.
  const eg = w.players.find((e) => e.team !== p.team && e.isGoalie);
  if (eg && eg.fooledT > 0 && !eg.foolSpent && eg.openSign !== 0 && dist(p.pos, enemyGoal) < SHOT_RANGE + 60 && w.rng() < w.diff.aiFoolShotRate * w.dt) {
    w.shoot(p, eg.openSign * (0.75 + w.rng() * 0.2), 0.5);
    return;
  }

  // Pressure: a defender on top of us is stripping the puck — do SOMETHING (juke sooner, or dump it off).
  const pr = p.pressure;
  if (pr > 0.55 && p.decideTimer > 0.15) p.decideTimer = 0.15;

  // Juke when a defender is in the way (chance per second; difficulty-scaled; more when pressured).
  const range = w.diff.aiJukeRange;
  let td = range;
  for (const e of w.players) {
    if (e.team === p.team || e.down) continue;
    td = Math.min(td, dist(e.pos, p.pos));
  }
  if (td < range && p.canStartMove() && w.rng() < w.diff.aiJukeRate * (1 + 2.5 * pr) * w.dt) {
    if (p.startMove(ALL_MOVES[Math.floor(w.rng() * ALL_MOVES.length)], w.diff.aiTellScale, nearestThreat(p, w.players))) {
      p.moveCd *= w.diff.aiMoveCdScale; // easy levels juke more often (so you can practise defending)
    }
    p.coast(w.dt);
    return;
  }

  // Decision: shoot or pass on a timer.
  p.decideTimer -= w.dt;
  if (p.decideTimer <= 0) {
    p.decideTimer = 0.55 + w.rng() * 0.6;
    const mates = w.players.filter((m) => m.team === p.team && !m.isGoalie && !m.down && m !== p);
    const rec = pickReceiver(p, mates, w.rng);
    const dGoal = dist(p.pos, enemyGoal);
    if (dGoal < SHOT_RANGE) {
      if (w.rng() < 0.6 || !rec) {
        // Pick a spot on the goal mouth; low levels are sloppy (can shoot wide).
        w.shoot(p, (w.rng() * 2 - 1) * w.diff.aiShotSpread, 0.85 + w.rng() * 0.15);
      } else {
        w.pass(p, rec);
      }
    } else if (rec && w.rng() < (pr > 0.55 ? 0.9 : 0.3)) {
      w.pass(p, rec);
    }
  }

  // Skate: toward the goal with a weave, steered away from close enemies.
  const t = w.time * 0.001;
  const wob = Math.sin(t * 1.6 + p.seed * 6.28) * 120;
  const target = v(enemyGoal.x, clamp(enemyGoal.y + wob, ICE_Y + 50, ICE_Y + RINK_H - 50));
  let away: Vec2 | null = null;
  let ad = 70;
  for (const e of w.players) {
    if (e.team === p.team || e.down) continue;
    const d = dist(e.pos, p.pos);
    if (d < ad) {
      ad = d;
      away = norm(sub(p.pos, e.pos));
    }
  }
  const dir = away ? norm(add(norm(sub(target, p.pos)), scale(away, 0.9))) : norm(sub(target, p.pos));
  p.applyInput(dir, w.dt);
}

function pickReceiver(p: Player, mates: Player[], rng: () => number): Player | null {
  const atkX = p.team === 0 ? 1 : -1;
  let best: Player | null = null;
  let bestScore = 0.25;
  for (const m of mates) {
    const d = dist(p.pos, m.pos);
    if (d < 40 || d > 300) continue;
    const forward = ((m.pos.x - p.pos.x) * atkX) / d;
    const score = forward - d / 500 + rng() * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function stepGoalie(p: Player, w: AIWorld): void {
  if (p.carrying) {
    // Breakout: skate the puck out of the crease, pass once forward.
    const center = v(CENTER_X, CENTER_Y);
    const d = sub(center, p.pos);
    if (len(d) > 30) p.applyInput(norm(d), w.dt);
    else p.coast(w.dt);
    p.decideTimer -= w.dt;
    if (p.decideTimer <= 0 && dist(p.pos, center) < 260) {
      p.decideTimer = 0.6;
      const mates = w.players.filter((m) => m.team === p.team && !m.isGoalie && !m.down);
      if (mates.length) {
        const atkRight = p.team === 0;
        let best = mates[0];
        for (const m of mates) {
          if ((m.pos.x - best.pos.x) * (atkRight ? 1 : -1) > 0) best = m;
        } // most advanced toward the enemy goal
        w.pass(p, best);
      }
    }
    return;
  }

  // Hug the goal line and play the ANGLE: stand between the puck and the centre of
  // the net (shading toward the puck more the closer it is) instead of mirroring it,
  // which left the far corner wide open. When a shot is launched, read where it will
  // cross the line (after a stat-scaled reaction delay) and dive at it.
  const gx = p.team === 0 ? ICE_X + p.radius() + 4 : ICE_X + RINK_W - p.radius() - 4;
  const goalX = p.team === 0 ? ICE_X : ICE_X + RINK_W;
  const puck = w.puck;

  // --- Skill moves near my net: roll a response ONCE per move (read / bite / hold).
  const carrier = puck.state === 'carried' && puck.carriedBy && puck.carriedBy.team !== p.team ? puck.carriedBy : null;
  if (carrier && carrier.move && (p.goaliePlan.owner !== carrier || p.goaliePlan.seq !== carrier.moveSeq) && dist(carrier.pos, p.pos) <= GOALIE_FOOL_RANGE) {
    const friendly = p.team === 0;
    p.goaliePlan = {
      owner: carrier,
      seq: carrier.moveSeq,
      stance: planGoalieResponse({
        moveId: carrier.move,
        lastFooled: p.lastFooled,
        respect: p.respect,
        puckSense: p.stats.puckSense,
        readBase: friendly ? FRIENDLY_GOALIE_READ : w.diff.aiGoalieRead,
        biteBase: friendly ? FRIENDLY_GOALIE_BITE : w.diff.aiGoalieBite,
        rng: w.rng,
      }),
    };
  }
  const plan = p.goaliePlan;
  const live = !!carrier && plan.owner === carrier && plan.seq === carrier.moveSeq && !!carrier.move;
  const reading = live && plan.stance === 'read';
  // Where the carrier's move ends up (screen-y): the goalie bites the OTHER way.
  let biteDir = 0;
  if (live && plan.stance === 'bite' && carrier && carrier.move) {
    const aim = carrier.move === 'deke' ? carrier.moveBase : carrier.facing;
    biteDir = -lateralSignY(MOVE_DEFS[carrier.move], aim, carrier.moveSide);
  } else if (p.fooledT > 0) biteDir = -p.openSign; // keeps leaning out of position until the window ends

  // Positioning lags the puck a little (a read goalie is locked on; a fast sidestep catches the rest leaning).
  const lag = reading ? 0 : (p.team === 0 ? FRIENDLY_GOALIE_LAG : w.diff.aiGoalieLag) * (1.25 - 0.5 * p.stats.puckSense);
  const track = lag > 0 && w.puckAt ? w.puckAt(lag) : puck.pos;
  const dx = Math.max(1, Math.abs(track.x - gx));
  const shade = clamp(GOALIE_DEPTH / dx, 0.2, 0.9);
  let ty = clamp(CENTER_Y + (track.y - CENTER_Y) * shade, GOAL_TOP - 6, GOAL_BOTTOM + 6);
  // Biting = committed to the fake side outright (not just nudged): that is what leaves the other corner open.
  if (biteDir !== 0) ty = clamp(CENTER_Y + biteDir * GOALIE_BITE_OFFSET, GOAL_TOP - 6, GOAL_BOTTOM + 6);

  const sp = len(puck.vel);
  // A pass is not a shot. And a NEW launch restarts the reaction clock (otherwise the
  // goalie would dive with zero delay on a one-timer that follows a pass).
  if (puck.launchSeq !== p.goalieSeq) {
    p.goalieSeq = puck.launchSeq;
    p.goalieReactAt = null;
  }
  const incoming =
    puck.state === 'loose' &&
    !puck.pass &&
    sp > GOALIE_SHOT_SPEED &&
    puck.lastTaker?.team !== p.team &&
    Math.sign(goalX - puck.pos.x) === Math.sign(puck.vel.x);
  let dive = false;
  if (incoming) {
    if (p.goalieReactAt === null) {
      const react = w.diff.aiGoalieReact * (1.25 - 0.5 * p.stats.puckSense) * (puck.quick ? ONE_TIMER_REACT_MULT : 1);
      p.goalieReactAt = w.time * 0.001 + react;
    }
    if (w.time * 0.001 >= p.goalieReactAt) {
      const t = (gx - puck.pos.x) / puck.vel.x;
      ty = clamp(puck.pos.y + puck.vel.y * t, GOAL_TOP - 14, GOAL_BOTTOM + 14);
      dive = true;
    }
  } else {
    p.goalieReactAt = null;
  }
  const d = v(gx - p.pos.x, ty - p.pos.y);
  // Fooled: caught leaning, it skates slowly until the window ends.
  const speedMul = (dive ? GOALIE_DIVE_FACTOR : 1) * (p.fooledT > 0 ? GOALIE_FOOL_SPEED : 1);
  if (len(d) > 5) p.applyInput(norm(d), w.dt, speedMul);
  else p.coast(w.dt);
}
