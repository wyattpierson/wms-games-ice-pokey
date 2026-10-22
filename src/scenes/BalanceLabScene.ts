import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { ALL_TEAMS, USER_TEAM, type Team } from '../config/teams';
import { POWER_DEFINITIONS } from '../config/powers';
import { DEFAULT_LEVEL } from '../config/difficulty';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { averageOverall, overall } from '../core/poach';
import { balanceSummariesToCsv, type BalanceMatchSummary } from '../core/balanceLab';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

const STORAGE_KEY = 'ice-pokey:balance-lab:v1';
const MAX_HISTORY = 40;
interface BalanceLabData { latest?: BalanceMatchSummary }
function loadHistory(): BalanceMatchSummary[] {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed as BalanceMatchSummary[] : []; }
  catch { return []; }
}
function saveHistory(rows: BalanceMatchSummary[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_HISTORY))); } catch { /* optional local history */ }
}
const T = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra });

/** Fast, standalone matchup builder for repeatable balance testing. */
export class BalanceLabScene extends Phaser.Scene {
  private teams: Team[] = [];
  private playerIndex = 0;
  private opponentIndex = 1;
  private powerIndex = 0;
  private difficulty = DEFAULT_LEVEL;
  private selectedPowerIds = new Set<string>();
  private history: BalanceMatchSummary[] = [];
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private playerPanel!: Phaser.GameObjects.Container;
  private opponentPanel!: Phaser.GameObjects.Container;
  private powersPanel!: Phaser.GameObjects.Container;
  private historyText!: Phaser.GameObjects.Text;
  private noteText!: Phaser.GameObjects.Text;
  private pickerObjects: Phaser.GameObjects.GameObject[] = [];
  private difficultyText!: Phaser.GameObjects.Text;

  constructor() { super('BalanceLabScene'); }

  create(data: BalanceLabData = {}): void {
    wireShutdown(this);
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.BLUE);
    this.teams = ALL_TEAMS;
    this.playerIndex = Math.max(0, this.teams.findIndex(t => t.id === USER_TEAM.id));
    this.opponentIndex = this.teams.findIndex(t => t.id !== USER_TEAM.id);
    if (this.opponentIndex < 0) this.opponentIndex = 0;
    this.history = loadHistory();
    if (data.latest) { this.history.unshift(data.latest); this.history = this.history.slice(0, MAX_HISTORY); saveHistory(this.history); }

    this.add.text(GAME_WIDTH / 2, 28, 'BALANCE LAB', T(30, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.text(GAME_WIDTH / 2, 57, 'Build a matchup. No campaign days, rewards, or progression are spent.', T(12, THEME.DIM)).setOrigin(.5);

    this.playerPanel = this.add.container(0, 0);
    this.opponentPanel = this.add.container(0, 0);
    this.renderTeamPanel(this.playerPanel, 292, 'PLAY AS', true);
    this.renderTeamPanel(this.opponentPanel, 900, 'PLAY AGAINST', false);
    this.add.text(GAME_WIDTH / 2, 151, 'VS', T(24, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);

    this.add.rectangle(GAME_WIDTH / 2, 310, 820, 58, FILL.panel, 1).setStrokeStyle(1, THEME.DIM);
    this.add.text(220, 296, 'AI DIFFICULTY', T(12, THEME.DIM, { fontStyle: 'bold' })).setOrigin(.5);
    this.difficultyText = this.add.text(220, 322, '', T(17, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.makeButton(375, 310, '−', () => this.setDifficulty(this.difficulty - .25), 40, 34);
    this.makeButton(705, 310, '+', () => this.setDifficulty(this.difficulty + .25), 40, 34);
    this.add.text(540, 310, 'Adjust how sharp and aggressive the opposing AI plays.', T(12, THEME.DIM)).setOrigin(.5);

    this.powersPanel = this.add.container(0, 0).setDepth(20);
    this.add.rectangle(GAME_WIDTH / 2, 447, 820, 142, FILL.panel, 1).setStrokeStyle(1, THEME.DIM);
    this.add.text(200, 383, 'POWER LOADOUT', T(14, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(0, .5);
    this.add.text(880, 383, 'Click a power to toggle it on/off', T(11, THEME.DIM)).setOrigin(1, .5);
    this.renderPowers();

    this.add.text(200, 535, 'RECENT MATCHES', T(13, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(0, .5);
    this.historyText = this.add.text(200, 555, '', T(11, THEME.WHITE, { lineSpacing: 4, wordWrap: { width: 790 } }));
    this.noteText = this.add.text(GAME_WIDTH / 2, 600, '', T(12, THEME.GREEN)).setOrigin(.5);
    this.setDifficulty(this.difficulty);
    this.makeButton(195, 647, 'START MATCH', () => this.launchMatch(), 190, 38, THEME.GREEN);
    this.makeButton(410, 647, 'EXPORT CSV', () => this.download('ice-pokey-balance.csv', balanceSummariesToCsv(this.history), 'text/csv'), 150, 38);
    this.makeButton(580, 647, 'EXPORT JSON', () => this.download('ice-pokey-balance.json', JSON.stringify(this.history, null, 2), 'application/json'), 150, 38);
    this.makeButton(890, 647, 'BACK TO TITLE', () => this.scene.start('TitleScene'), 180, 38, THEME.GRAY);

    this.renderTeam(this.playerPanel, this.playerIndex, true);
    this.renderTeam(this.opponentPanel, this.opponentIndex, false);
    this.renderHistory();
    if (data.latest) this.noteText.setText(`Recorded ${data.latest.result.toUpperCase()} · ${data.latest.playerScore}–${data.latest.opponentScore} vs ${data.latest.opponentName}`);

    this.onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (this.pickerObjects.length) { if (e.code === 'Escape') this.closeTeamPicker(); return; }
      switch (e.code) {
        case 'KeyA': case 'ArrowLeft': this.cycleTeam(true, -1); break;
        case 'KeyD': case 'ArrowRight': this.cycleTeam(true, 1); break;
        case 'KeyJ': this.cycleTeam(false, -1); break;
        case 'KeyL': this.cycleTeam(false, 1); break;
        case 'ArrowUp': case 'KeyW': this.powerIndex = (this.powerIndex - 1 + POWER_DEFINITIONS.length) % POWER_DEFINITIONS.length; this.renderPowers(); break;
        case 'ArrowDown': case 'KeyS': this.powerIndex = (this.powerIndex + 1) % POWER_DEFINITIONS.length; this.renderPowers(); break;
        case 'Space': e.preventDefault(); this.togglePower(POWER_DEFINITIONS[this.powerIndex].id); break;
        case 'BracketLeft': this.setDifficulty(this.difficulty - .25); break;
        case 'BracketRight': this.setDifficulty(this.difficulty + .25); break;
        case 'Enter': this.launchMatch(); break;
        case 'Escape': this.scene.start('TitleScene'); break;
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  private renderTeamPanel(panel: Phaser.GameObjects.Container, x: number, heading: string, isPlayer: boolean): void {
    panel.removeAll(true);
    const w = 330;
    const accent = isPlayer ? THEME.GREEN : THEME.BLUE;
    panel.add(this.add.rectangle(x + 3, 178, w, 205, 0x000000, 0.32));
    panel.add(this.add.rectangle(x, 175, w, 205, FILL.panel, 1).setStrokeStyle(2, accent));
    panel.add(this.add.rectangle(x, 175, w - 10, 195, 0x000000, 0).setStrokeStyle(1, 0x34465a, 0.9));
    panel.add(this.add.rectangle(x, 77, 74, 4, accent, 1));
    panel.add(this.add.text(x, 91, heading, T(13, accent, { fontStyle: 'bold' })).setOrigin(.5));
    this.makeButton(x - 116, 104, '‹ PREV', () => this.cycleTeam(isPlayer, -1), 82, 30);
    this.makeButton(x + 116, 104, 'NEXT ›', () => this.cycleTeam(isPlayer, 1), 82, 30);
    // Keep panel identity separate from button controls, which are siblings on purpose.
  }

  private renderTeam(panel: Phaser.GameObjects.Container, index: number, isPlayer: boolean): void {
    // Rebuild only the panel contents; preserve its background and header.
    const x = isPlayer ? 292 : 900;
    const old = panel.getData('team-content') as Phaser.GameObjects.GameObject[] | undefined;
    old?.forEach(o => o.destroy());
    const team = this.teams[index];
    const parts: Phaser.GameObjects.GameObject[] = [];
    const add = <G extends Phaser.GameObjects.GameObject>(g: G): G => { panel.add(g); parts.push(g); return g; };
    const teamName = add(this.add.text(x, 132, team.name, T(19, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(.5));
    teamName.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openTeamPicker(isPlayer));
    add(this.add.text(x, 157, `TEAM OVR  ${averageOverall(team.players)}`, T(13, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5));
    team.players.forEach((p, i) => {
      const px = x - 125 + i * 83;
      add(this.add.image(px, 207, `pkm-${p.sprite}`).setScale(.43));
      add(this.add.text(px, 244, p.name, T(10, THEME.WHITE, { align: 'center', wordWrap: { width: 80 } })).setOrigin(.5));
      add(this.add.text(px, 262, `OVR ${overall(p)}`, T(11, THEME.GOLD)).setOrigin(.5));
    });
    panel.setData('team-content', parts);
  }

  private openTeamPicker(playerSide: boolean): void {
    this.closeTeamPicker();
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.84).setInteractive();
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 960, 500, FILL.panel, 1).setStrokeStyle(2, THEME.GOLD);
    this.pickerObjects.push(dim, panel);
    const title = this.add.text(GAME_WIDTH / 2, 112, `CHOOSE TEAM TO ${playerSide ? 'PLAY AS' : 'PLAY AGAINST'}`, T(20, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.pickerObjects.push(title);
    this.teams.forEach((team, i) => {
      const col = i % 4, row = Math.floor(i / 4), x = 245 + col * 235, y = 166 + row * 58;
      const current = team.id === this.teams[playerSide ? this.playerIndex : this.opponentIndex].id;
      const plate = this.add.rectangle(x, y, 218, 44, current ? FILL.plateHi : FILL.plate, 1).setStrokeStyle(current ? 2 : 1, current ? THEME.GOLD : THEME.DIM).setInteractive({ useHandCursor: true });
      const name = this.add.text(x, y - 7, team.name, T(11, THEME.WHITE, { fontStyle: 'bold', align: 'center', wordWrap: { width: 205 } })).setOrigin(.5);
      const ovr = this.add.text(x, y + 12, `TEAM OVR ${averageOverall(team.players)}`, T(10, THEME.GOLD)).setOrigin(.5);
      this.pickerObjects.push(plate, name, ovr);
      const choose = () => {
        if (playerSide) this.playerIndex = i; else this.opponentIndex = i;
        this.closeTeamPicker();
        this.renderTeam(playerSide ? this.playerPanel : this.opponentPanel, i, playerSide);
      };
      plate.on('pointerdown', choose); name.setInteractive({ useHandCursor: true }).on('pointerdown', choose); ovr.setInteractive({ useHandCursor: true }).on('pointerdown', choose);
    });
    const close = this.add.text(GAME_WIDTH / 2, 603, 'CANCEL  ·  ESC', T(12, THEME.DIM, { fontStyle: 'bold' })).setOrigin(.5).setInteractive({ useHandCursor: true });
    close.setY(565);
    close.on('pointerdown', () => this.closeTeamPicker());
    this.pickerObjects.push(close);
  }

  private closeTeamPicker(): void {
    this.pickerObjects.forEach(o => o.destroy());
    this.pickerObjects = [];
  }

  private renderPowers(): void {
    this.powersPanel.removeAll(true);
    POWER_DEFINITIONS.forEach((power, i) => {
      const col = i % 2, row = Math.floor(i / 2), x = 230 + col * 390, y = 414 + row * 42;
      const selected = this.selectedPowerIds.has(power.id), focused = i === this.powerIndex;
      const frame = this.add.rectangle(x + 170, y + 9, 360, 34, focused ? FILL.plateHi : FILL.plate, 1).setStrokeStyle(focused ? 2 : 1, selected ? THEME.GREEN : focused ? THEME.GOLD : THEME.DIM);
      const label = this.add.text(x + 12, y - 1, `${selected ? '✓' : '○'}  ${power.name}`, T(13, selected ? THEME.GREEN : THEME.WHITE, { fontStyle: 'bold' }));
      const desc = this.add.text(x + 12, y + 16, power.description, T(10, THEME.DIM, { wordWrap: { width: 325 } }));
      this.powersPanel.add([frame, label, desc]);
      frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.powerIndex = i; this.togglePower(power.id); });
      label.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.powerIndex = i; this.togglePower(power.id); });
      desc.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.powerIndex = i; this.togglePower(power.id); });
    });
    this.renderHistory();
  }

  private renderHistory(): void {
    if (!this.historyText) return;
    this.historyText.setText(this.history.length ? this.history.slice(0, 2).map(r => `${r.result.toUpperCase()}  ${r.playerScore}–${r.opponentScore}  ${r.playerTeamName ?? 'Player'} vs ${r.opponentName}  ·  ${r.liveSeconds}s  ·  shots ${r.shots}  ·  powers ${r.powerActivations}`).join('\n') : 'No test matches yet. Pick both teams above, then start a match.');
  }
  private cycleTeam(playerSide: boolean, direction: number): void {
    if (playerSide) this.playerIndex = (this.playerIndex + direction + this.teams.length) % this.teams.length;
    else this.opponentIndex = (this.opponentIndex + direction + this.teams.length) % this.teams.length;
    this.renderTeam(playerSide ? this.playerPanel : this.opponentPanel, playerSide ? this.playerIndex : this.opponentIndex, playerSide);
  }
  private setDifficulty(value: number): void {
    this.difficulty = Math.max(0, Math.min(1, Math.round(value * 4) / 4));
    const labels = ['Easy', 'Relaxed', 'Normal', 'Hard', 'Expert'];
    this.difficultyText.setText(`${labels[Math.round(this.difficulty * 4)]}  ·  ${Math.round(this.difficulty * 100)}%`);
    this.noteText?.setText('');
  }
  private togglePower(id: string): void {
    if (this.selectedPowerIds.has(id)) this.selectedPowerIds.delete(id); else this.selectedPowerIds.add(id);
    this.renderPowers();
  }
  private launchMatch(): void {
    const player = this.teams[this.playerIndex], opponent = this.teams[this.opponentIndex];
    this.scene.start('GameScene', { userTeam: player, opponent, level: this.difficulty, testMode: true, powerIds: [...this.selectedPowerIds] });
  }
  private makeButton(x: number, y: number, label: string, onClick: () => void, width = 110, height = 32, color: number = THEME.GOLD): void {
    const plate = this.add.rectangle(x, y, width, height, FILL.plate, 1).setStrokeStyle(1, color).setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, T(11, color, { fontStyle: 'bold' })).setOrigin(.5);
    plate.on('pointerdown', onClick); text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }
  private download(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }
  shutdown(): void { if (this.onKey) window.removeEventListener('keydown', this.onKey); this.onKey = null; }
}
