import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { getMeta } from '../state/metaStore';
import { getRun, setRun } from '../state/runStore';
import type { PlayerDef } from '../config/teams';
import { averageOverall, overall } from '../core/poach';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

type Side = 'active' | 'bench';
interface Picked { side: Side; index: number }
const POSITIONS = ['LEFT WING', 'CENTER', 'RIGHT WING', 'GOALIE'];
const T = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra });

/** Team manager: readable active lineup plus compact, visually distinct bench cards. */
export class LineupScene extends Phaser.Scene {
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private activeIndex = 0;
  private benchIndex = 0;
  private focus: Side = 'bench';
  private picked: Picked | null = null;
  private returnTo = 'ZoneSelectScene';
  private hint!: Phaser.GameObjects.Text;
  constructor() { super('LineupScene'); }
  init(data: { returnTo?: string }): void { this.returnTo = data?.returnTo || 'ZoneSelectScene'; this.activeIndex = 0; this.benchIndex = 0; this.focus = 'bench'; this.picked = null; }

  create(): void {
    wireShutdown(this); this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GREEN);
    this.add.text(GAME_WIDTH / 2, 28, 'TEAM ROSTER', T(29, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.text(GAME_WIDTH / 2, 59, 'Select a player, then select where they should go. Goalies only swap with goalies.', T(12, THEME.DIM)).setOrigin(.5);
    this.hint = this.add.text(GAME_WIDTH / 2, 632, 'Click to select and swap · TAB changes focus · ENTER picks / places · ESC returns', T(12, THEME.GOLD)).setOrigin(.5);
    this.paint();
    this.onKey = (e: KeyboardEvent) => {
      const run = getRun();
      if (e.code === 'Escape') { this.scene.start(this.returnTo); return; }
      if (e.code === 'Tab') { e.preventDefault(); this.focus = this.focus === 'active' ? 'bench' : 'active'; this.paint(); return; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        if (this.focus === 'active') this.activeIndex = Math.max(0, this.activeIndex - 1);
        else this.benchIndex = Math.max(0, this.benchIndex - 1);
        this.paint(); return;
      }
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        if (this.focus === 'active') this.activeIndex = Math.min(3, this.activeIndex + 1);
        else this.benchIndex = Math.min(Math.max(0, (run.bench?.length || 1) - 1), this.benchIndex + 1);
        this.paint(); return;
      }
      if (e.code === 'Enter' || e.code === 'Space') this.activate(this.focus, this.focus === 'active' ? this.activeIndex : this.benchIndex);
    };
    window.addEventListener('keydown', this.onKey);
  }

  private paint(): void {
    this.children.list.filter(o => (o as any).getData?.('roster-card')).forEach(o => o.destroy());
    const run = getRun(), active = run.userTeam.players, bench = run.bench || [];
    this.add.rectangle(254, 350, 378, 520, FILL.panel, 1).setStrokeStyle(1, THEME.DIM).setData('roster-card', true);
    this.add.rectangle(830, 350, 570, 520, FILL.panel, 1).setStrokeStyle(1, THEME.DIM).setData('roster-card', true);
    this.add.text(254, 94, 'ACTIVE LINEUP', T(16, THEME.GREEN, { fontStyle: 'bold' })).setOrigin(.5).setData('roster-card', true);
    this.add.text(830, 94, `BENCH  ·  ${bench.length}`, T(16, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5).setData('roster-card', true);
    this.add.text(254, 119, `TEAM OVR  ${averageOverall(active)}`, T(12, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5).setData('roster-card', true);
    active.forEach((p, i) => this.card(254, 174 + i * 112, p, POSITIONS[i], this.focus === 'active' && i === this.activeIndex, this.picked?.side === 'active' && this.picked.index === i, () => this.activate('active', i), false));
    bench.forEach((p, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      this.card(640 + col * 190, 174 + row * 112, p, p.goalie ? 'GOALIE' : 'BENCH', this.focus === 'bench' && i === this.benchIndex, this.picked?.side === 'bench' && this.picked.index === i, () => this.activate('bench', i), true);
    });
    if (!bench.length) this.add.text(830, 205, 'New recruits wait here.\nSelect a bench player to swap them into\nyour active lineup after your next win.', T(13, THEME.DIM, { align: 'center', lineSpacing: 8 })).setOrigin(.5, 0).setData('roster-card', true);
    const meta = getMeta(), starter = meta.starter || 'not chosen', xp = meta.starter ? meta.starterXp[meta.starter] : 0;
    const pickedText = this.picked ? `Selected ${this.playerAt(this.picked.side, this.picked.index)?.name || 'player'} — choose a destination.` : 'Select a player to move.';
    this.hint.setText(`${pickedText}  ·  STARTER ${starter.toUpperCase()} · ${xp} XP · ${xp >= 100 ? 'FINAL EVOLUTION' : xp >= 40 ? 'EVOLVED' : 'NEXT EVOLUTION AT 40 XP'}`);
  }

  private card(x: number, y: number, p: PlayerDef, tag: string, focused: boolean, picked: boolean, click: () => void, compact: boolean): void {
    const w = compact ? 174 : 342, h = compact ? 92 : 94;
    const border = picked ? THEME.GREEN : focused ? THEME.GOLD : compact ? THEME.BLUE : THEME.DIM;
    const plate = this.add.rectangle(x, y, w, h, focused ? FILL.plateHi : compact ? FILL.background : FILL.plate, 1).setStrokeStyle(picked ? 4 : focused ? 3 : 1, border).setInteractive({ useHandCursor: true }).setData('roster-card', true);
    if (compact) {
      // Bench cards are deliberately compact, but all content stays inside the 174px frame.
      this.add.image(x - 64, y - 5, `pkm-${p.sprite}`).setDisplaySize(32, 32).setData('roster-card', true);
      const shortName = p.name.length > 11 ? `${p.name.slice(0, 10)}…` : p.name;
      this.add.text(x - 40, y - 27, shortName, T(10, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(0, .5).setData('roster-card', true);
      this.add.text(x + 65, y - 27, String(overall(p)), T(18, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5).setData('roster-card', true);
      this.add.text(x - 40, y - 8, tag, T(8, p.goalie ? THEME.GOLD : THEME.DIM)).setOrigin(0, .5).setData('roster-card', true);
      const s = p.stats;
      this.add.text(x - 40, y + 11, `HP ${s.hp} ATK ${s.attack} SA ${s.specialAttack}`, T(8, THEME.GRAY)).setOrigin(0, .5).setData('roster-card', true);
      this.add.text(x - 40, y + 27, `DEF ${s.defense} SD ${s.specialDefense} SPD ${s.speed}`, T(8, THEME.GRAY)).setOrigin(0, .5).setData('roster-card', true);
    } else {
      this.add.image(x - 126, y, `pkm-${p.sprite}`).setScale(.52).setData('roster-card', true);
      this.add.text(x - 85, y - 28, p.name, T(17, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(0, .5).setData('roster-card', true);
      this.add.text(x - 85, y - 7, `${tag}${p.isStarter ? '  ·  STARTER' : ''}`, T(10, p.isStarter ? THEME.GOLD : THEME.DIM)).setOrigin(0, .5).setData('roster-card', true);
      const s = p.stats;
      this.add.text(x - 85, y + 14, `HP ${s.hp}   ATK ${s.attack}   SPA ${s.specialAttack}`, T(11, THEME.GRAY)).setOrigin(0, .5).setData('roster-card', true);
      this.add.text(x - 85, y + 32, `DEF ${s.defense}   SDF ${s.specialDefense}   SPD ${s.speed}`, T(11, THEME.GRAY)).setOrigin(0, .5).setData('roster-card', true);
      this.add.text(x + 145, y - 2, String(overall(p)), T(28, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5).setData('roster-card', true);
      this.add.text(x + 145, y + 19, 'OVR', T(10, THEME.DIM)).setOrigin(.5).setData('roster-card', true);
    }
    plate.on('pointerdown', click);
  }

  private playerAt(side: Side, index: number): PlayerDef | undefined { const run = getRun(); return side === 'active' ? run.userTeam.players[index] : (run.bench || [])[index]; }
  private activate(side: Side, index: number): void {
    if (!this.playerAt(side, index)) return;
    if (!this.picked) { this.picked = { side, index }; this.focus = side; if (side === 'active') this.activeIndex = index; else this.benchIndex = index; this.paint(); return; }
    if (this.picked.side === side && this.picked.index === index) { this.picked = null; this.paint(); return; }
    this.move(this.picked, { side, index });
  }
  private move(from: Picked, to: Picked): void {
    const run = getRun(), active = [...run.userTeam.players] as PlayerDef[], bench = [...(run.bench || [])];
    const sourceList = from.side === 'active' ? active : bench, targetList = to.side === 'active' ? active : bench;
    const source = sourceList[from.index], target = targetList[to.index];
    if (!source || !target) { this.picked = null; this.paint(); return; }
    if (!!source.goalie !== !!target.goalie) { this.hint.setText('A goalie can only swap with another goalie.'); return; }
    if (from.side === 'active' && to.side === 'active' && from.index !== to.index && (from.index === 3 || to.index === 3)) { this.hint.setText('The goalie slot cannot swap with a field position.'); return; }
    sourceList[from.index] = target; targetList[to.index] = source;
    setRun({ ...run, userTeam: { ...run.userTeam, players: active as typeof run.userTeam.players }, bench });
    this.picked = null; this.focus = to.side; if (to.side === 'active') this.activeIndex = to.index; else this.benchIndex = to.index; this.paint();
  }
  shutdown(): void { if (this.onKey) window.removeEventListener('keydown', this.onKey); this.onKey = null; }
}
