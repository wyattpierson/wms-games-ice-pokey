import type Phaser from 'phaser';
import { DRILLS, INTRO_DRILLS, type PracticeConfig } from '../config/training';
import { CENTER_X, CENTER_Y, GOAL_TOP, ICE_X, RINK_W } from '../config/rink';
import { PERFECT_SHOT_CHARGE } from '../config/gameplay';
import { perfectWindowHold } from '../core/shot';
import { dist, norm, sub, v } from '../core/vec2';
import { setStoryFlag } from '../state/metaStore';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import type { Player } from './entities/Player';
import type { Puck } from './entities/Puck';

export interface TrainingEvent {
  kind: 'pass' | 'catch' | 'shot' | 'goal' | 'check' | 'parry' | 'juke' | 'stripped' | 'feedback';
  actor?: Player;
  charge?: number;
  aimY?: number;
  hold?: number;
  quick?: boolean;
  text?: string;
}
export interface TrainingWorld {
  players: Player[];
  puck: Puck;
  reset(): void;
  control(player: Player): void;
  grant(player: Player): void;
  pass(from: Player, to: Player): void;
  clearInput(): void;
  next(): void;
  exit(): void;
}

/** Isolated drills run the real match controls, passes, shots, checks and parries. */
export class TrainingSession {
  readonly definition;
  private progress = 0;
  private elapsed = 0;
  private resetIn = 0;
  private ready = false;
  private complete = false;
  private paused = false;
  private fed = false;
  private underPressure = false;
  private startedMove = false;
  private flightAt: number | null = null;
  private note: Phaser.GameObjects.Text;
  private status: Phaser.GameObjects.Text;
  private prompt: Phaser.GameObjects.Text;
  private marks: Phaser.GameObjects.Graphics;
  private onKey: (event: KeyboardEvent) => void;
  private gates = [v(450, 290), v(730, 420), v(500, 460)];

  constructor(scene: Phaser.Scene, readonly config: PracticeConfig, private world: TrainingWorld) {
    this.definition = DRILLS.find(d => d.id === config.drill)!;
    const { name, objective, controls } = this.definition;
    scene.add.text(CENTER_X, 18, `TRAINING RINK  /  ${name.toUpperCase()}`, {
      fontFamily: FONT, fontSize: '21px', fontStyle: 'bold', color: hex(THEME.GOLD),
    }).setOrigin(.5).setDepth(100);
    scene.add.rectangle(CENTER_X, 101, 1080, 78, FILL.panel, .98).setStrokeStyle(2, THEME.BLUE).setDepth(100);
    scene.add.text(CENTER_X, 80, objective, { fontFamily: FONT, fontSize: '16px', color: hex(THEME.WHITE) }).setOrigin(.5).setDepth(101);
    scene.add.text(CENTER_X, 108, controls, { fontFamily: FONT, fontSize: '12px', color: hex(THEME.BLUE), wordWrap: { width: 1020 }, align: 'center' }).setOrigin(.5).setDepth(101);
    scene.add.rectangle(267, 168, 390, 30, FILL.panel, .98).setStrokeStyle(1, THEME.BLUE).setDepth(99);
    scene.add.rectangle(978, 168, 300, 30, FILL.panel, .98).setStrokeStyle(1, THEME.BLUE).setDepth(99);
    this.status = scene.add.text(80, 160, '', { fontFamily: FONT, fontSize: '14px', color: hex(THEME.GOLD), fontStyle: 'bold' }).setDepth(100);
    scene.add.rectangle(CENTER_X, 641, 1120, 42, FILL.panel, 1).setStrokeStyle(1, THEME.BLUE).setDepth(100);
    this.note = scene.add.text(CENTER_X, 640, '', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.WHITE), align: 'center', wordWrap: { width: 1070 } }).setOrigin(.5).setDepth(101);
    this.prompt = scene.add.text(CENTER_X, 540, 'SPACE / CLICK TO TRY', { fontFamily: FONT, fontSize: '19px', color: hex(THEME.GOLD), backgroundColor: hex(FILL.panel), padding: { x: 18, y: 12 } })
      .setOrigin(.5).setDepth(100).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.advance());
    scene.add.text(1118, 157, config.onboarding ? 'TAB: SKIP TO COASTAL MATCH' : 'ESC: BACK TO DRILLS', { fontFamily: FONT, fontSize: '11px', color: hex(THEME.BLUE) })
      .setOrigin(1, 0).setDepth(100).setInteractive({ useHandCursor: true }).on('pointerdown', () => world.exit());
    this.marks = scene.add.graphics().setDepth(12);
    this.onKey = e => {
      if (e.repeat) return;
      if ((e.code === 'Tab' && config.onboarding) || (e.code === 'Escape' && !config.onboarding)) { e.preventDefault(); world.exit(); }
      else if ((e.code === 'Space' && !this.ready) || (e.code === 'Enter' && this.complete)) { e.preventDefault(); this.advance(); }
      else if (e.code === 'KeyR' && !this.complete) { this.ready = true; this.paused = false; this.prompt.setVisible(false); this.setup(); world.clearInput(); }
      else if (e.code === 'Escape' && config.onboarding && !this.complete) {
        this.paused = !this.paused;
        this.prompt.setText(this.paused ? 'PAUSED · ESC / CLICK TO RESUME' : '');
        this.prompt.setVisible(this.paused);
      }
    };
    window.addEventListener('keydown', this.onKey);
    this.setup();
  }

  get blocked(): boolean { return !this.ready || this.complete || this.paused; }
  get settling(): boolean { return this.resetIn > 0 || this.config.drill === 'one-timer' && !this.fed; }
  private advance(): void {
    if (this.complete) { this.world.next(); return; }
    this.ready = true;
    this.paused = false;
    this.prompt.setVisible(false);
    this.world.clearInput();
  }
  private setup(): void {
    this.world.reset();
    this.elapsed = 0; this.resetIn = 0; this.fed = false; this.underPressure = false; this.startedMove = false; this.flightAt = null;
    for (const p of this.world.players) {
      p.down = true; p.downTimer = 999; p.vel = v(); p.pickupCooldown = 99; p.moveCd = 0;
      p.setVisible(false);
    }
    const [a, b] = this.world.players;
    const enemy = this.world.players[4];
    const place = (p: Player, x: number, y: number, facing = 0) => {
      p.down = false; p.downTimer = 0; p.pos = v(x, y); p.vel = v(); p.facing = facing;
      p.pickupCooldown = 0; p.setVisible(true); p.update(0, p.pos); p.facing = facing;
    };
    switch (this.config.drill) {
      case 'skate':
        place(a, 300, 310); this.world.control(a); break;
      case 'pass':
        place(a, 420, 300); place(b, 730, 400, Math.PI); this.world.grant(a); this.world.control(a); break;
      case 'shoot': case 'timing':
        place(a, 880, CENTER_Y); this.world.grant(a); this.world.control(a); break;
      case 'pressure':
        place(a, 520, CENTER_Y); place(b, 780, 450, Math.PI); place(enemy, 420, CENTER_Y);
        this.world.grant(a); this.world.control(a); break;
      case 'check':
        place(a, 570, CENTER_Y); place(enemy, 710, CENTER_Y, Math.PI);
        this.world.grant(enemy); this.world.control(a); break;
      case 'parry':
        place(a, 590, CENTER_Y); place(enemy, 642, CENTER_Y, Math.PI);
        this.world.grant(enemy); this.world.control(a); break;
      case 'one-timer':
        place(a, 900, CENTER_Y); place(b, 730, 190);
        this.world.grant(b); this.world.control(a); break;
    }
    // Drills without possession still need a visible puck; park it away from the gates.
    if (this.config.drill === 'skate') this.world.puck.reset(1030, 530);
    // Ready screens are frozen, so place the puck and controlled marker now.
    this.world.puck.update(0);
    for (const p of this.world.players) if (!p.down) p.update(0, this.world.puck.pos);
    this.status.setText(`${this.progress} / ${this.definition.target}  ·  R retries this attempt`);
    this.note.setText(this.roundHint()).setColor(hex(THEME.WHITE));
    this.draw();
  }
  private roundHint(): string {
    switch (this.config.drill) {
      case 'skate': return 'Follow the gold gate. The gold arrow marks the Pokémon you control.';
      case 'pass': return 'SPACE passes to the partner along the dashed lane. Turn toward them to pass back.';
      case 'shoot': return this.progress === 0 ? 'Aim UP while charging, then release into the TOP target.' : 'Now aim DOWN while charging, then release into the BOTTOM target.';
      case 'timing': return 'The gold ring at the net shows the release window. Release SHIFT when it pulses.';
      case 'pressure': return this.progress === 0 ? 'Wait for the orange pressure ring, then SPACE to the open partner.' : 'Wait for pressure, then E SPIN or F DEKE to escape with the puck.';
      case 'check': return 'Let the carrier approach. SHIFT plants your check; a check bumps but does not steal.';
      case 'parry': return this.progress === 0 ? 'Watch the orange SPIN badge. Press E when the ring pulses.' : 'Now watch the yellow DEKE badge. Press F when the diamond pulses.';
      case 'one-timer': return 'Your partner feeds you a pass. Press SHIFT just before the puck reaches your stick.';
    }
  }

  /** Script only the teaching partner. All action resolution stays in GameScene. */
  steer(player: Player, dt: number): void {
    if (player.down) return;
    player.coast(dt);
    const enemy = this.world.players[4];
    if (player === enemy && this.resetIn <= 0) {
      // Isolate timing here; possession pressure has its own preceding lesson.
      if (this.config.drill === 'parry') player.pressure = 0;
      if (this.config.drill === 'pressure' && this.elapsed > 1) {
        player.applyInput(norm(sub(this.world.players[0].pos, player.pos)), dt, .24);
      } else if (this.config.drill === 'check') {
        player.applyInput(v(-1, 0), dt, this.progress ? .5 : .35);
      } else if (this.config.drill === 'parry' && this.elapsed > 1.3 && !this.startedMove) {
        this.startedMove = true;
        player.startMove(this.progress ? 'deke' : 'spin', this.progress ? 1.7 : 2.4, this.world.players[0].pos);
      }
    }
  }

  before(dt: number): void {
    if (this.blocked) return;
    if (this.resetIn > 0) {
      this.resetIn -= dt;
      if (this.resetIn <= 0) this.setup();
      return;
    }
    this.elapsed += dt;
    if (this.config.drill === 'one-timer' && !this.fed) {
      this.note.setText(`Pass arriving in ${Math.max(1, Math.ceil(2 - this.elapsed))}… get ready for SHIFT.`);
      if (this.elapsed >= 2) { this.fed = true; this.world.pass(this.world.players[1], this.world.players[0]); this.note.setText('Watch the cyan ring—press SHIFT as it closes!'); }
    }
  }
  after(): void {
    if (this.blocked || this.resetIn > 0) { this.draw(); return; }
    const a = this.world.players[0];
    if (this.config.drill === 'skate' && dist(a.pos, this.gates[this.progress]) < 35) {
      this.progress++;
      this.status.setText(`${this.progress} / ${this.definition.target} gates`);
      if (this.progress >= this.definition.target) this.finish();
      else this.note.setText('Good turn! Follow the next gold gate.');
    }
    if (this.config.drill === 'pressure' && a.pressure > .12) this.underPressure = true;
    if (this.config.drill === 'check' && this.world.players[4].pos.x < a.pos.x - 75) this.retry('The carrier got past. Plant SHIFT just before contact.');
    if (this.config.drill === 'parry' && this.startedMove && !this.world.players[4].move && this.world.puck.carriedBy !== a) this.retry('The juke got through. Match the badge key when its ring pulses.');
    if (this.flightAt !== null && this.world.puck.state === 'loose' && this.elapsed - this.flightAt > 4) {
      this.retry('Puck reset. ' + this.roundHint());
    }
    if (this.config.drill === 'one-timer' && a.carrying && a.receivedByPass && a.sinceReceive > .6) {
      this.retry('The pass settled. Press SHIFT as the cyan ring closes, just before the catch.');
    }
    this.draw();
  }
  event(event: TrainingEvent): void {
    if (this.blocked || this.resetIn > 0) return;
    const own = event.actor?.team === 0;
    switch (event.kind) {
      case 'catch':
        this.flightAt = null;
        if (own && this.config.drill === 'pass') this.success('Clean catch! Control now follows the receiver.', false);
        if (own && this.config.drill === 'pressure' && this.progress === 0 && this.underPressure) this.success('You passed out of pressure. Now try a juke.');
        if (own && this.config.drill === 'one-timer') this.note.setText('Catch made! SHIFT immediately can still one-time it.');
        break;
      case 'shot':
        this.flightAt = this.elapsed;
        if (!own) break;
        if (this.config.drill === 'timing') {
          if ((event.charge ?? 0) >= PERFECT_SHOT_CHARGE) this.success('Perfect release! That timing adds shot power.');
          else this.retry((event.hold ?? 0) < perfectWindowHold().open ? 'Too early. Let the gold ring fill before releasing SHIFT.' : 'Held too long. Release during the gold pulse.');
        } else if (this.config.drill === 'one-timer') {
          if (event.quick) this.success('ONE-TIMER! An instant shot gives the goalie less time to read it.');
          else this.retry('That was a charged shot. Press SHIFT as the cyan ring closes, before settling the puck.');
        }
        break;
      case 'goal':
        if (this.config.drill === 'shoot') {
          const y = this.world.puck.pos.y;
          if ((this.progress === 0 && y < CENTER_Y - 14) || (this.progress === 1 && y > CENTER_Y + 14)) this.success('Corner hit!');
          else this.retry('On net, but outside the target. Hold UP / DOWN while charging to move the aim marker.');
        } else this.retry('Puck reset. Try the lesson’s action.');
        break;
      case 'check': if (own && this.config.drill === 'check') this.success('Check landed! It adds pressure; it does not instantly steal.'); break;
      case 'parry': if (own && this.config.drill === 'parry') this.success('Matched and timed! A parry steals the puck.'); break;
      case 'juke':
        if (own && this.config.drill === 'pressure' && this.progress === 1 && this.underPressure) this.success('Juke landed! You kept possession and cleared the pressure.');
        break;
      case 'stripped': if (own) this.retry('The pressure ring filled. Pass or juke before it reaches the top.'); break;
      case 'pass': this.flightAt = this.elapsed; break;
      case 'feedback':
        if (this.config.drill === 'parry' && event.text && ['TOO EARLY', 'TOO LATE', 'WRONG MOVE', 'NOT IN FRONT'].some(s => event.text!.includes(s))) this.retry(`${event.text}. ${this.roundHint()}`);
        break;
    }
  }
  private success(text: string, reset = true): void {
    this.progress++;
    this.note.setText(text).setColor(hex(THEME.GREEN));
    this.status.setText(`${this.progress} / ${this.definition.target} complete`);
    if (this.progress >= this.definition.target) this.finish();
    else if (reset) this.resetIn = 1.3;
  }
  private retry(text: string): void {
    this.note.setText(text).setColor(hex(THEME.GOLD));
    this.resetIn = 2;
  }
  private finish(): void {
    this.complete = true;
    setStoryFlag(`training-complete-${this.config.drill}`);
    const at = INTRO_DRILLS.indexOf(this.config.drill);
    const next = this.config.onboarding && at === INTRO_DRILLS.length - 1 ? 'START COASTAL MATCH' : this.config.onboarding ? 'NEXT LESSON' : 'BACK TO DRILLS';
    this.prompt.setText(`LESSON COMPLETE  ·  ${next}  [ENTER]`).setVisible(true);
    this.note.setText(this.config.drill === 'skate'
      ? 'Good skating! You can turn, glide, and find your controlled Pokémon.'
      : 'Well done. ' + this.note.text).setColor(hex(THEME.GREEN));
  }
  private draw(): void {
    const g = this.marks;
    g.clear();
    if (this.config.drill === 'skate' && this.progress < this.gates.length) {
      this.gates.forEach((point, index) => {
        g.lineStyle(index === this.progress ? 4 : 2, index < this.progress ? THEME.GREEN : THEME.GOLD, index === this.progress ? 1 : .35);
        g.strokeRect(point.x - 26, point.y - 26, 52, 52);
      });
    }
    if (['pass', 'pressure', 'one-timer'].includes(this.config.drill)) {
      const a = this.world.players[0], b = this.world.players[1];
      const delta = sub(b.pos, a.pos);
      g.lineStyle(2, THEME.BLUE, .5);
      for (let i = 0; i < 16; i += 2) g.lineBetween(a.pos.x + delta.x * i / 16, a.pos.y + delta.y * i / 16, a.pos.x + delta.x * (i + 1) / 16, a.pos.y + delta.y * (i + 1) / 16);
    }
    if (this.config.drill === 'shoot') {
      const y = this.progress === 0 ? GOAL_TOP + 6 : CENTER_Y + 15;
      g.fillStyle(THEME.GOLD, .25); g.fillRect(ICE_X + RINK_W - 18, y, 18, 39);
      g.lineStyle(3, THEME.GOLD, 1); g.strokeRect(ICE_X + RINK_W - 18, y, 18, 39);
    }
    if (this.config.drill === 'timing' || this.config.drill === 'shoot') {
      const a = this.world.players[0], x = ICE_X + RINK_W - 55;
      g.lineStyle(2, THEME.GOLD, .35); g.strokeCircle(x, CENTER_Y, 29);
      if (a.charging) {
        const open = a.charge >= PERFECT_SHOT_CHARGE;
        g.lineStyle(open ? 5 : 3, THEME.GOLD, 1);
        g.beginPath(); g.arc(x, CENTER_Y, 29, -Math.PI / 2, -Math.PI / 2 + a.charge * Math.PI * 2, false); g.strokePath();
        if (open) { g.lineStyle(2, THEME.GOLD, .6); g.strokeCircle(x, CENTER_Y, 35 + Math.sin(this.elapsed * 30) * 3); }
      }
    }
  }
  destroy(): void { window.removeEventListener('keydown', this.onKey); }
}
