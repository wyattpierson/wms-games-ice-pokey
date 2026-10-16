/**
 * Dumb-but-legal AI for step 1: one chaser per team, the rest zone behind the
 * puck, carriers skate to the goal and shoot/pass on a decision timer, goalies
 * track the puck on the goal line and break out after a save.
 * Parry-aware AI behavior lands in build step 5.
 */

import {
  AI_CHECK_CHANCE, AI_MOVE_RANGE, AI_MOVE_RATE, AI_PARRY_BASE, AI_PARRY_PER_SPD,
  PARRY_RANGE, SHOT_RANGE,
} from '../config/gameplay';
import {
  CENTER_X, CENTER_Y, GOAL_BOTTOM, GOAL_TOP, ICE_X, ICE_Y, RINK_H, RINK_W,
} from '../config/rink';
import { add, clamp, dist, len, norm, scale, sub, v, type Vec2 } from '../core/vec2';
import { ALL_MOVES, MOVE_DEFS, effectiveWindow } from '../core/moves';
import type { Player } from './entities/Player';
import type { Puck } from './entities/Puck';

export interface AIWorld {
  players: Player[];
  puck: Puck;
  dt: number;
  time: number;
  rng: () => number;
  pass: (from: Player, to: Player) => void;
  shoot: (from: Player, dir: Vec2, charge: number) => void;
  /** AI parry attempt (matched key; timing can still be early → whiff). */
  parry: (defender: Player, carrier: Player) => void;
  /** AI check (safe push / dislodge). */
  check: (defender: Player) => void;
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
 * 1v1 defense: when the carrier starts a move, roll once (keyed by
 * `moveSeq`) and maybe plan a parry press or a check at a specific tell
 * elapsed. The parry press timing is random inside the success window —
 * so AI defenders genuinely whiff sometimes, and a good user times their
 * own presses against the same rules.
 */
function this_step1v1(p: Player, w: AIWorld, carrier: Player): void {
  if (carrier.move) {
    const def = MOVE_DEFS[carrier.move];
    if (p.parryRollSeq !== carrier.moveSeq) {
      p.parryRollSeq = carrier.moveSeq;
      p.parryPlanT = null;
      p.checkPlanT = null;
      const r = w.rng();
      const pch = AI_PARRY_BASE + AI_PARRY_PER_SPD * p.stats.puckSense;
      if (r < pch) {
        const win = effectiveWindow(carrier.move, p.stats.parryWindow);
        // Press at a random point of the success window (0.05s min so it
        // isn't instant; can still land early → whiff if reaction is poor).
        p.parryPlanT = def.tell - win + 0.05 + w.rng() * (win - 0.05);
      } else if (r < pch + AI_CHECK_CHANCE) {
        p.checkPlanT = def.tell * 0.5;
      }
    }
    if (p.parryPlanT !== null && carrier.moveT >= p.parryPlanT && carrier.moveT <= def.tell) {
      p.parryPlanT = null;
      w.parry(p, carrier);
    }
    if (p.checkPlanT !== null && carrier.moveT >= p.checkPlanT && carrier.move) {
      p.checkPlanT = null;
      w.check(p);
    }
  }
  // Shadow: skate to a spot just behind the carrier (toward their own goal)
  // so parries/checks are in range without walling the lane.
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

  // Juke when a defender is in the way (chance per second).
  let td = AI_MOVE_RANGE;
  for (const e of w.players) {
    if (e.team === p.team || e.down) continue;
    td = Math.min(td, dist(e.pos, p.pos));
  }
  if (td < AI_MOVE_RANGE && p.canStartMove() && w.rng() < AI_MOVE_RATE * w.dt) {
    p.startMove(ALL_MOVES[Math.floor(w.rng() * ALL_MOVES.length)]);
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
        const jitter = v((w.rng() - 0.5) * 90, (w.rng() - 0.5) * 130);
        w.shoot(p, norm(add(sub(enemyGoal, p.pos), jitter)), 0.85 + w.rng() * 0.15);
      } else {
        w.pass(p, rec);
      }
    } else if (rec && w.rng() < 0.3) {
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

  // Stay on the goal line, mirror the puck vertically, hugging the net.
  const gx = p.team === 0 ? ICE_X + p.radius() + 4 : ICE_X + RINK_W - p.radius() - 4;
  const ty = clamp(w.puck.pos.y, GOAL_TOP - 16, GOAL_BOTTOM + 16);
  const d = v(gx - p.pos.x, ty - p.pos.y);
  if (len(d) > 5) p.applyInput(norm(d), w.dt);
  else p.coast(w.dt);
}
