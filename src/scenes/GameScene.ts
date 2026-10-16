import Phaser from 'phaser';
import {
  CHARGE_TIME, CHECK_COOLDOWN, CHECK_DISLODGE_BASE, CHECK_PUSH, COUNTER_BURST,
  DROP_TIME, GOALIE_SAVE_COOLDOWN, GOALIE_SAVE_DEFLECT_SPEED,
  GOALIE_SAVE_RADIUS, GOALS_TO_WIN, GOAL_PAUSE, PARRY_RANGE, PASS_SPEED, PICKUP_DELAY,
  PICKUP_RADIUS, PERFECT_SHOT_CHARGE, PERFECT_SHOT_MULT, SHOT_SPEED_MAX,
  SHOT_SPEED_MIN, SHOT_SPREAD, FAST_PUCK_SPEED, TUMBLE_TIME,
} from '../config/gameplay';
import { CENTER_X, CENTER_Y, GAME_HEIGHT, ICE_X, RINK_W } from '../config/rink';
import { OPPONENTS, USER_TEAM, type Team } from '../config/teams';
import { add, clamp, clampLen, dist, dot, len, norm, scale, sub, v, type Vec2 } from '../core/vec2';
import { ALL_MOVES, MOVE_DEFS, parryTiming, type MoveId } from '../core/moves';
import { deriveStats } from '../core/stats';
import { stepAI, type AIWorld } from '../gameplay/ai';
import { Controls } from '../gameplay/controls';
import { Player } from '../gameplay/entities/Player';
import { Puck } from '../gameplay/entities/Puck';
import { drawRink } from '../gameplay/entities/Rink';

type MatchState = 'drop' | 'live' | 'goal' | 'over';

interface GameData {
  opponentIndex: number;
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  private controls!: Controls;
  private players: Player[] = [];
  private puck!: Puck;
  private score: [number, number] = [0, 0];
  private state: MatchState = 'drop';
  private stateTimer = 0;
  private controlled: Player | null = null;
  private switchIndex = 0;
  private opponentIdx = 0;
  private oppTeam: Team = OPPONENTS[0];
  private scoreText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;

  init(data: GameData): void {
    this.opponentIdx = data?.opponentIndex ?? readOpponentParam();
  }

  create(): void {
    drawRink(this);

    this.oppTeam = OPPONENTS[this.opponentIdx] ?? OPPONENTS[0];
    this.players = [];
    USER_TEAM.players.forEach((pd, i) => this.players.push(this.makePlayer(USER_TEAM, 0, i, pd)));
    this.oppTeam.players.forEach((pd, i) => this.players.push(this.makePlayer(this.oppTeam, 1, i, pd)));

    this.puck = new Puck(this, CENTER_X, CENTER_Y);
    this.controls = new Controls(this);

    this.scoreText = this.add
      .text(CENTER_X, 14, '', { fontFamily: 'monospace', fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5);
    this.bannerText = this.add
      .text(CENTER_X, CENTER_Y, '', {
        fontFamily: 'monospace',
        fontSize: '42px',
        color: '#ffd166',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.add
      .text(CENTER_X, GAME_HEIGHT - 12,
        'WASD move · SPACE pass / switch · hold Enter/Shift = shoot (≥80% = perfect “!” — the goalie flash is the tell) · J/K/L juke (defense: parry) · Enter check (defense) · R restart',
        {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#8b98ab',
        })
      .setOrigin(0.5, 1);

    this.input.keyboard!.addListener('R', () => {
      if (this.state === 'over') this.restart();
    });

    this.setState('drop');
  }

  update(time: number, dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);

    if (this.state === 'drop') {
      this.stateTimer -= dt;
      for (const p of this.players) {
        const d = sub(p.home, p.pos);
        if (len(d) > 4) p.applyInput(norm(d), dt);
        else p.coast(dt);
        p.update(dt, this.puck.pos);
      }
      this.puck.update(dt);
      if (this.stateTimer <= 0) this.setState('live');
      return;
    }

    if (this.state === 'goal') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.score[0] >= GOALS_TO_WIN || this.score[1] >= GOALS_TO_WIN) this.setState('over');
        else this.setState('drop');
      }
      return;
    }

    if (this.state === 'over') return;

    this.updateLive(time, dt);
  }

  // ---------- live play ----------

  private updateLive(time: number, dt: number): void {
    // 1. Who does the user control: carrier on offense, else nearest field
    //    player (X cycles through the field players).
    const userCarrier = this.players.find((p) => p.team === 0 && p.carrying) ?? null;
    let desired: Player | null = userCarrier;
    if (!desired) {
      const field = this.players
        .filter((p) => p.team === 0 && !p.isGoalie && !p.down)
        .sort((a, b) => dist(a.pos, this.puck.pos) - dist(b.pos, this.puck.pos));
      if (this.controls.justPressed('pass') && field.length) {
        this.switchIndex = (this.switchIndex + 1) % field.length;
      }
      if (this.switchIndex >= field.length) this.switchIndex = 0;
      desired = field[this.switchIndex] ?? null;
    }
    if (desired && desired !== this.controlled) {
      this.controlled?.setControlled(false);
      this.controlled = desired;
      desired.setControlled(true);
    }

    // 2. User input on the controlled player.
    if (this.controlled) {
      const c = this.controlled;
      const dir = this.controls.direction();
      const committed = c.move && !c.moveResolved; // riding out a juke
      if (c.stagger > 0 || committed) c.coast(dt);
      else if (dir.x || dir.y) c.applyInput(dir, dt);
      else c.coast(dt);

      if (c.carrying) {
        // Offense: pass, charge-shot (perfect at >= 80%), juke (J/K/L).
        if (this.controls.justPressed('pass') && !committed) this.userPass(c);
        if (this.controls.held('shoot') && !committed) {
          c.charging = true;
          c.charge = Math.min(1, c.charge + dt / CHARGE_TIME);
          // Charging snaps the stick toward the goal; up/down while holding
          // adjusts the corner (applied at release in shootPuck).
          const gx = c.team === 0 ? ICE_X + RINK_W : ICE_X;
          const target = Math.atan2(CENTER_Y - c.pos.y, gx - c.pos.x);
          let diff = target - c.facing;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          c.facing += diff * Math.min(1, dt * 14);
        } else if (c.charging || c.charge > 0) {
          this.shootPuck(c, dir, c.charge);
          c.charging = false;
          c.charge = 0;
        }
        for (const id of ALL_MOVES) {
          if (!c.move && this.controls.justPressed(id)) c.startMove(id);
        }
      } else {
        // Defense: check (Enter/Shift), parry (J/K/L = the move's key).
        if (c.charging) {
          c.charging = false;
          c.charge = 0;
        }
        if (this.controls.justPressed('shoot')) this.doCheck(c);
        for (const id of ALL_MOVES) {
          if (this.controls.justPressed(id)) this.tryParry(c, id);
        }
      }

      // Perfect-shot tell: the enemy goalie flashes white while the user's
      // charge is in the perfect zone.
      for (const p of this.players) p.shotTell = false;
      const eg = this.players.find((p) => p.team === 1 && p.isGoalie);
      if (eg && c.carrying && c.charging && c.charge >= PERFECT_SHOT_CHARGE) eg.shotTell = true;
    }

    // 3. AI: one chaser per team; everyone else zones / carries / goalies.
    const chaserOf: Array<Player | null> = [null, null];
    if (this.puck.state === 'loose') {
      for (const t of [0, 1] as const) {
        let best: Player | null = null;
        let bd = Infinity;
        for (const p of this.players) {
          if (p.team !== t || p.isGoalie || p.down || p === this.controlled) continue;
          const d = dist(p.pos, this.puck.pos);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        chaserOf[t] = best;
      }
    }
    const world: AIWorld = {
      players: this.players,
      puck: this.puck,
      dt,
      time,
      rng: Math.random,
      pass: (f, m) => this.doPass(f, m),
      shoot: (f, dir, charge) => this.shootPuck(f, dir, charge),
      parry: (d, carrier) => this.tryParry(d, carrier.move!),
      check: (d) => this.doCheck(d),
    };
    for (const p of this.players) {
      p.aiChase = p === chaserOf[0] || p === chaserOf[1];
      if (p !== this.controlled) stepAI(p, world);
      p.update(dt, this.puck.pos);
    }

    // A juke's tell ends → apply its effect (if it wasn't parried away).
    for (const p of this.players) {
      if (p.move && !p.moveResolved && p.moveT >= MOVE_DEFS[p.move].tell) {
        p.moveResolved = true;
        this.finishMove(p);
      }
    }

    // 4. Puck: physics, pickups, goalie saves, body separation.
    this.puck.update(dt);
    this.tryPickup();
    this.goalieSaves();
    this.separate();

    if (this.puck.scoredBy !== null) this.onGoal(this.puck.scoredBy);
  }

  private tryPickup(): void {
    if (this.puck.state !== 'loose') return;
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.down || p.pickupCooldown > 0) continue;
      const reach = p.isGoalie ? PICKUP_RADIUS + 6 : PICKUP_RADIUS;
      const d = dist(p.pos, this.puck.pos);
      if (d <= reach && d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) return;
    const sp = len(this.puck.vel);
    if (sp < FAST_PUCK_SPEED) {
      // Slow puck: it's yours.
      this.grantPuck(best);
      return;
    }
    // Fast puck (shot / hard pass): a skill contest. A puck moving faster
    // than the grabber can handle can fly past a flailing stick.
    if (best.whiffCooldown > 0) return; // already flailed at this puck
    const chance = clamp(0.9 + 0.5 * best.stats.puckSense - (sp - FAST_PUCK_SPEED) / 700, 0.12, 0.95);
    if (Math.random() < chance) this.grantPuck(best);
    else best.whiffCooldown = 0.45;
  }

  private grantPuck(p: Player): void {
    this.puck.give(p);
    p.pickupCooldown = PICKUP_DELAY;
    this.puck.lastTaker = p;
  }

  private goalieSaves(): void {
    if (this.puck.state !== 'loose') return;
    const sp = len(this.puck.vel);
    if (sp < 140) return;
    for (const g of this.players) {
      if (!g.isGoalie || g.saveCooldown > 0) continue;
      const d = dist(g.pos, this.puck.pos);
      if (d > GOALIE_SAVE_RADIUS) continue;
      const goalX = g.team === 0 ? ICE_X : ICE_X + RINK_W;
      if (Math.sign(goalX - this.puck.pos.x) !== Math.sign(this.puck.vel.x)) continue;
      // Stat-driven base save: SpD (puckSense) vs. shot speed.
      const saveChance = 0.25 + 0.5 * g.stats.puckSense - 0.1 * (sp / SHOT_SPEED_MAX);
      if (Math.random() > saveChance) continue; // shot beats the save
      g.saveCooldown = GOALIE_SAVE_COOLDOWN;
      g.stickSwing = 0.3;
      const out = norm(
        v(CENTER_X - this.puck.pos.x, CENTER_Y - this.puck.pos.y + (Math.random() - 0.5) * 240),
      );
      this.puck.vel = scale(out, GOALIE_SAVE_DEFLECT_SPEED);
      g.pickupCooldown = 0.35; // beat before the breakout — user gets the pass
    }
  }

  private separate(): void {
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const d = dist(a.pos, b.pos);
        const min = a.radius() + b.radius() - 2;
        if (d > 1e-3 && d < min) {
          const n = norm(sub(b.pos, a.pos));
          const push = (min - d) / 2;
          a.pos = v(a.pos.x - n.x * push, a.pos.y - n.y * push);
          b.pos = v(b.pos.x + n.x * push, b.pos.y + n.y * push);
        }
      }
    }
  }

  // ---------- actions ----------

  private userPass(c: Player): void {
    const dirIn = this.controls.direction();
    const aim = dirIn.x || dirIn.y ? dirIn : v(Math.cos(c.facing), Math.sin(c.facing));
    const mates = this.players.filter((p) => p.team === c.team && !p.isGoalie && !p.down && p !== c);
    if (!mates.length) return;
    // Always pass: best teammate by aim alignment minus a soft distance
    // penalty. No threshold — a teammate ahead of you is always an option.
    let best = mates[0];
    let bestScore = -Infinity;
    for (const m of mates) {
      const d = dist(c.pos, m.pos);
      if (d < 24) continue;
      const to = norm(sub(m.pos, c.pos));
      const score = aim.x * to.x + aim.y * to.y - d / 900;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    this.doPass(c, best);
  }

  private doPass(from: Player, to: Player): void {
    // Lead the pass: aim at where the receiver is skating, not where they are.
    const speed = PASS_SPEED * from.stats.passPower;
    const d = dist(from.pos, to.pos);
    const flight = (d / speed) * 0.75;
    const lead = v(to.pos.x + to.vel.x * flight, to.pos.y + to.vel.y * flight);
    this.puck.launch(norm(sub(lead, from.pos)), speed, from);
    from.pickupCooldown = Math.max(from.pickupCooldown, 0.25);
  }

  private shootPuck(from: Player, dirIn: Vec2, charge: number): void {
    // Goal-anchored aim: the base direction is the goal-mouth center and the
    // input's lateral component picks the corner. Most of the range is the
    // net itself; holding up/down at full can still shoot a bit wide.
    const goalX = from.team === 0 ? ICE_X + RINK_W : ICE_X;
    const toGoal = norm(sub(v(goalX, CENTER_Y), from.pos));
    const perp = v(-toGoal.y, toGoal.x);
    const lateral = clamp(dirIn.x * perp.x + dirIn.y * perp.y, -1, 1);
    const a = Math.atan2(toGoal.y, toGoal.x) + lateral * SHOT_SPREAD;
    const aim = v(Math.cos(a), Math.sin(a));
    // Perfect shot: release with charge in the perfect zone (the goalie
    // flash was the tell) → bonus power and a “!” over the shooter.
    const perfect = from === this.controlled && charge >= PERFECT_SHOT_CHARGE;
    const speed =
      (SHOT_SPEED_MIN + (SHOT_SPEED_MAX - SHOT_SPEED_MIN) * charge) *
      from.stats.shotPower * (perfect ? PERFECT_SHOT_MULT : 1);
    this.puck.launch(aim, speed, from);
    from.stickSwing = 0.3;
    from.pickupCooldown = Math.max(from.pickupCooldown, 0.15);
    if (perfect) this.popup('!', from.pos, '#ffffff');
  }

  // ---------- juke moves & defense (parry layer) ----------

  /**
   * Defender attempts to parry the enemy carrier's active tell.
   * Matching key inside the window → steal + counter-burst; early/late/wrong
   * key → whiff stagger. Pressing with no active tell = harmless stick tap.
   */
  private tryParry(d: Player, id: MoveId): void {
    if (d.stagger > 0) return;
    const carrier = this.puck.state === 'carried' ? this.puck.carriedBy : null;
    if (!carrier || carrier.team === d.team || !carrier.move || dist(d.pos, carrier.pos) > PARRY_RANGE) {
      // Harmless stick tap (no tell to react to); tiny cooldown vs. mash.
      d.stickSwing = 0.25;
      d.moveCd = Math.max(d.moveCd, 0.3);
      return;
    }
    const timing = parryTiming(carrier.move, carrier.moveT, d.stats.parryWindow);
    if (id === carrier.move && timing === 'success') {
      // PARRY! Cancel the carrier's move (no effect), steal, counter-attack.
      carrier.move = null;
      carrier.moveResolved = true;
      carrier.tumble = 0.4;
      carrier.stagger = 0.3;
      this.grantPuck(d);
      const away = sub(d.pos, carrier.pos);
      const n = len(away) > 1
        ? norm(away)
        : v(Math.cos(carrier.facing + Math.PI), Math.sin(carrier.facing + Math.PI));
      d.vel = scale(n, COUNTER_BURST);
      d.facing = Math.atan2(n.y, n.x);
      this.popup('!', d.pos, '#66ff99');
    } else {
      d.whiff();
    }
  }

  /**
   * Check (defense, Enter/Shift): safe — no timing, no whiff. Pushes the
   * carrier back; dislodges the puck if the carrier isn't mid-tell.
   */
  private doCheck(d: Player): void {
    if (d.checkCd > 0 || d.stagger > 0) return;
    d.checkCd = CHECK_COOLDOWN;
    d.stickSwing = 0.3;
    const carrier = this.puck.state === 'carried' ? this.puck.carriedBy : null;
    if (!carrier || carrier.team === d.team || dist(d.pos, carrier.pos) > PARRY_RANGE) return;
    const away = norm(sub(carrier.pos, d.pos));
    carrier.vel = add(carrier.vel, scale(away, CHECK_PUSH));
    const chance = CHECK_DISLODGE_BASE + 0.4 * (d.stats.checkPower / 100);
    if (!carrier.move && Math.random() < chance) {
      const a = Math.random() * Math.PI * 2;
      this.puck.launch(v(Math.cos(a), Math.sin(a)), 190, carrier);
    }
  }

  /**
   * Unparried juke resolves: the carrier bursts (direction per move) and
   * nearby defenders get knocked back BEHIND the carrier — the move's
   * payoff is separation.
   */
  private finishMove(p: Player): void {
    const id = p.move;
    if (!id) return;
    // Note: p.move stays set through the effect phase (Player.update clears
    // it after tell+effect) — that's what drives the spin's 2π rotation.
    const def = MOVE_DEFS[id];
    let dir = v(Math.cos(p.facing), Math.sin(p.facing));
    if (id === 'crossover') {
      // Sharp cut to the side AWAY from the nearest defender.
      let threat: Player | null = null;
      let td = Infinity;
      for (const o of this.players) {
        if (o.team === p.team || o.down) continue;
        const d = dist(o.pos, p.pos);
        if (d < td) {
          td = d;
          threat = o;
        }
      }
      if (threat) {
        const perp = v(-dir.y, dir.x);
        const side = dot(sub(threat.pos, p.pos), perp) > 0 ? -1 : 1;
        const nd = norm(add(dir, scale(perp, side * 1.6)));
        p.facing = Math.atan2(nd.y, nd.x);
        dir = nd;
      }
    }
    p.vel = clampLen(add(p.vel, scale(dir, def.burst * p.stats.skill)), 520);
    // Knock nearby defenders back, biased behind the carrier's travel.
    for (const o of this.players) {
      if (o.team === p.team || o.isGoalie || o.down) continue;
      const d = dist(o.pos, p.pos);
      if (d > def.knockRadius) continue;
      const away = norm(sub(o.pos, p.pos));
      o.vel = add(o.vel, scale(add(away, scale(dir, 0.7)), def.knock * (1.2 - d / def.knockRadius)));
      o.tumble = TUMBLE_TIME * 0.8;
    }
  }

  /** Small floating popup ("!" for perfect shots / parries). */
  private popup(text: string, at: Vec2, color: string): void {
    const t = this.add.text(at.x, at.y - 38, text, {
      fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 750, onComplete: () => t.destroy() });
  }

  // ---------- match flow ----------

  private onGoal(side: 0 | 1): void {
    this.score[side] += 1;
    this.updateScoreText();
    this.setState('goal');
    this.flash(side === 0 ? `GOAL — ${USER_TEAM.name.toUpperCase()}!` : `GOAL — ${this.oppTeam.name.toUpperCase()}!`);
  }

  private setState(s: MatchState): void {
    this.state = s;
    if (s === 'drop') {
      this.stateTimer = DROP_TIME;
      this.resetPositions();
    } else if (s === 'goal') {
      this.stateTimer = GOAL_PAUSE;
    } else if (s === 'over') {
      this.flash(this.score[0] > this.score[1] ? 'YOU WIN!' : 'YOU LOSE', true);
    } else {
      this.bannerText.setAlpha(0);
    }
  }

  private flash(text: string, persistent = false): void {
    this.bannerText.setText(text);
    if (persistent) {
      this.bannerText.setAlpha(1);
      return;
    }
    this.bannerText.setAlpha(1);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      delay: GOAL_PAUSE * 500,
      duration: 400,
    });
  }

  private resetPositions(): void {
    for (const p of this.players) {
      p.pos = v(p.home.x, p.home.y);
      p.vel = v();
      p.carrying = false;
      p.charging = false;
      p.charge = 0;
      p.move = null;
      p.moveT = 0;
      p.moveResolved = false;
      p.stagger = 0;
      p.tumble = 0;
      p.checkCd = 0;
      p.shotTell = false;
    }
    this.puck.reset(CENTER_X, CENTER_Y);
    this.switchIndex = 0;
    if (this.controlled) this.controlled.setControlled(false);
    this.controlled = null;
  }

  private restart(): void {
    this.score = [0, 0];
    this.updateScoreText();
    this.setState('drop');
  }

  private updateScoreText(): void {
    this.scoreText.setText(
      `${USER_TEAM.name}  ${this.score[0]} — ${this.score[1]}  ${this.oppTeam.name}   ·   first to ${GOALS_TO_WIN}`,
    );
  }

  private makePlayer(team: Team, teamIdx: 0 | 1, i: number, pd: Team['players'][number]): Player {
    const stats = deriveStats(pd.stats);
    const [x, y] = formationPos(teamIdx, i);
    return new Player(
      this,
      {
        name: pd.name,
        sprite: pd.sprite,
        isGoalie: !!pd.goalie,
        color: team.color,
        colorDark: team.colorDark,
        stats,
      },
      x,
      y,
      teamIdx,
      i,
    );
  }
}

/** Dev deep-link: ?opp=0..2 picks the opponent (mirrors pokemon-bowl's ?match=). */
export function readOpponentParam(): number {
  const raw = new URLSearchParams(window.location.search).get('opp');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n < OPPONENTS.length ? n : 0;
}

/** i: 0–2 field, 3 goalie. Team 0 defends left; team 1 mirrored. */
function formationPos(teamIdx: 0 | 1, i: number): [number, number] {
  const xs = [ICE_X + 190, ICE_X + 190, ICE_X + 340, ICE_X + 30];
  const ys = [CENTER_Y - 140, CENTER_Y + 140, CENTER_Y, CENTER_Y];
  if (teamIdx === 0) return [xs[i], ys[i]];
  return [ICE_X + RINK_W - (xs[i] - ICE_X), ys[i]];
}

