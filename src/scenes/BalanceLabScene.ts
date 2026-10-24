import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { ALL_TEAMS, USER_TEAM, type Team } from '../config/teams';
import { POWER_DEFINITIONS } from '../config/powers';
import { DEFAULT_LEVEL } from '../config/difficulty';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { averageOverall, overall } from '../core/poach';
import { balanceSummariesToCsv, type BalanceMatchSummary } from '../core/balanceLab';
import { buildBalanceLabPlayerTeam } from '../core/balanceLabItems';
import { ITEM_IDS, SHOP_OFFERS } from '../config/progression';
import type { StarterId } from '../state/metaStore';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

const STORAGE_KEY = 'ice-pokey:balance-lab:v1';
const MAX_HISTORY = 40;
interface BalanceLabData { latest?: BalanceMatchSummary }
type LoadoutTab = 'powers' | 'items';
const STARTERS: StarterId[] = ['larvitar', 'gible', 'bagon'];
const STARTER_LABELS: Record<StarterId, string> = { larvitar: 'TYRANITAR', gible: 'GARCHOMP', bagon: 'SALAMENCE' };
const ITEM_TEST_DESCRIPTIONS: Record<string, string> = {
  [ITEM_IDS.evolvePikachu]: 'Pikachu → Raichu · permanent species upgrade',
  [ITEM_IDS.evolvePsyduck]: 'Psyduck → Golduck · permanent species upgrade',
  [ITEM_IDS.secondChance]: 'Retry a lost test match once',
  [ITEM_IDS.megaEvolution]: 'Press M once per match · mega lasts until a goal',
  [ITEM_IDS.superParry]: 'Successful parry incapacitates carrier for 5 sec',
  [ITEM_IDS.superJuke]: 'Nearby defenders get knocked behind a landed deke',
  [ITEM_IDS.superShot]: 'Short, stronger release window inside goalie flash',
};
function loadHistory(): BalanceMatchSummary[] {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed as BalanceMatchSummary[] : []; }
  catch { return []; }
}
function saveHistory(rows: BalanceMatchSummary[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_HISTORY))); } catch { /* optional local history */ }
}
const T = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra });

/** Fast, standalone matchup builder for repeatable power + permanent-item testing. */
export class BalanceLabScene extends Phaser.Scene {
  private teams: Team[] = [];
  private playerIndex = 0;
  private opponentIndex = 1;
  private powerIndex = 0;
  private itemIndex = 0;
  private difficulty = DEFAULT_LEVEL;
  private loadoutTab: LoadoutTab = 'powers';
  private megaStarter: StarterId = 'larvitar';
  private selectedPowerIds = new Set<string>();
  private selectedItemIds = new Set<string>();
  private history: BalanceMatchSummary[] = [];
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private playerPanel!: Phaser.GameObjects.Container;
  private opponentPanel!: Phaser.GameObjects.Container;
  private powersPanel!: Phaser.GameObjects.Container;
  private historyText!: Phaser.GameObjects.Text;
  private noteText!: Phaser.GameObjects.Text;
  private pickerObjects: Phaser.GameObjects.GameObject[] = [];
  private difficultyText!: Phaser.GameObjects.Text;
  private selectedTabText!: Phaser.GameObjects.Text;
  private tabButtons: Array<{ plate: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; tab: LoadoutTab }> = [];

  constructor() { super('BalanceLabScene'); }

  create(data: BalanceLabData = {}): void {
    wireShutdown(this);
    this.tabButtons = [];
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.BLUE);
    this.teams = ALL_TEAMS;
    this.playerIndex = Math.max(0, this.teams.findIndex(t => t.id === USER_TEAM.id));
    this.opponentIndex = this.teams.findIndex(t => t.id !== USER_TEAM.id);
    if (this.opponentIndex < 0) this.opponentIndex = 0;
    this.history = loadHistory();
    if (data.latest) {
      this.history.unshift(data.latest);
      this.history = this.history.slice(0, MAX_HISTORY);
      saveHistory(this.history);
    }

    this.add.text(GAME_WIDTH / 2, 40, 'BALANCE LAB', T(27, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.text(GAME_WIDTH / 2, 67, 'Configure a matchup and test campaign items without spending currency or changing your save.', T(11, THEME.DIM)).setOrigin(.5);

    // Matchup cards: consistent boundaries and a clear visual split between sides.
    this.playerPanel = this.add.container(0, 0);
    this.opponentPanel = this.add.container(0, 0);
    this.renderTeamPanel(this.playerPanel, 300, 'YOUR TEAM', true);
    this.renderTeamPanel(this.opponentPanel, 892, 'OPPONENT', false);
    this.add.text(GAME_WIDTH / 2, 190, 'VS', T(22, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);

    // Difficulty strip.
    this.add.rectangle(GAME_WIDTH / 2, 313, 1096, 42, FILL.panel, 1).setStrokeStyle(1, 0x34465a);
    this.add.text(130, 313, 'AI DIFFICULTY', T(11, THEME.DIM, { fontStyle: 'bold' })).setOrigin(.5);
    this.difficultyText = this.add.text(300, 313, '', T(14, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.text(650, 313, 'Tune reaction speed, pressure, and aggression', T(11, THEME.DIM)).setOrigin(.5);
    this.makeButton(1048, 313, '−', () => this.setDifficulty(this.difficulty - .25), 38, 30, THEME.WHITE);
    this.makeButton(1100, 313, '+', () => this.setDifficulty(this.difficulty + .25), 38, 30, THEME.WHITE);

    // One tidy loadout panel with tabs so both systems have room to breathe.
    this.add.rectangle(GAME_WIDTH / 2, 449, 1096, 206, FILL.panel, 1).setStrokeStyle(1, 0x34465a);
    this.powersPanel = this.add.container(0, 0).setDepth(20);
    this.add.text(68, 366, 'MATCH LOADOUT', T(10, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(0, .5);
    this.createLoadoutTab(300, 366, 'POWERS', 'powers', 104);
    this.createLoadoutTab(456, 366, 'PERMANENT ITEMS', 'items', 174);
    this.refreshLoadoutTabs();
    this.selectedTabText = this.add.text(1124, 366, '', T(10, THEME.DIM)).setOrigin(1, .5);
    this.renderPowers();

    // A compact recent-match strip keeps useful diagnostics visible without competing with setup.
    this.add.rectangle(GAME_WIDTH / 2, 587, 1096, 54, FILL.panel, 1).setStrokeStyle(1, 0x26394b);
    this.add.text(68, 573, 'RECENT TESTS', T(11, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(0, .5);
    this.historyText = this.add.text(222, 568, '', T(10, THEME.WHITE, { lineSpacing: 3, wordWrap: { width: 900 } }));
    this.noteText = this.add.text(GAME_WIDTH / 2, 607, '', T(10, THEME.GREEN)).setOrigin(.5);

    this.setDifficulty(this.difficulty);
    this.makeButton(146, 638, 'START MATCH', () => this.launchMatch(), 176, 34, THEME.GREEN);
    this.makeButton(352, 638, 'EXPORT CSV', () => this.download('ice-pokey-balance.csv', balanceSummariesToCsv(this.history), 'text/csv'), 132, 34);
    this.makeButton(502, 638, 'EXPORT JSON', () => this.download('ice-pokey-balance.json', JSON.stringify(this.history, null, 2), 'application/json'), 142, 34);
    this.makeButton(1059, 638, 'BACK TO TITLE', () => this.scene.start('TitleScene'), 170, 34, THEME.GRAY);

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
        case 'KeyP': this.setLoadoutTab('powers'); break;
        case 'KeyI': this.setLoadoutTab('items'); break;
        case 'ArrowUp': case 'KeyW': this.cycleLoadout(-1); break;
        case 'ArrowDown': case 'KeyS': this.cycleLoadout(1); break;
        case 'Space': e.preventDefault(); this.toggleFocusedLoadout(); break;
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
    const w = 504;
    const accent = isPlayer ? THEME.GREEN : THEME.BLUE;
    panel.add(this.add.rectangle(x, 187, w, 194, FILL.panel, 1).setStrokeStyle(1, 0x34465a));
    panel.add(this.add.rectangle(x, 91, w - 2, 2, accent));
    panel.add(this.add.text(x, 111, heading, T(12, accent, { fontStyle: 'bold' })).setOrigin(.5));
    this.makeButton(x - 198, 113, '‹ PREV', () => this.cycleTeam(isPlayer, -1), 78, 26, accent);
    this.makeButton(x + 198, 113, 'NEXT ›', () => this.cycleTeam(isPlayer, 1), 78, 26, accent);
  }

  private getPreviewPlayerTeam(): Team {
    return buildBalanceLabPlayerTeam(this.teams[this.playerIndex], [...this.selectedItemIds], this.megaStarter);
  }

  private renderTeam(panel: Phaser.GameObjects.Container, index: number, isPlayer: boolean): void {
    const x = isPlayer ? 300 : 892;
    const old = panel.getData('team-content') as Phaser.GameObjects.GameObject[] | undefined;
    old?.forEach(o => o.destroy());
    const team = isPlayer ? this.getPreviewPlayerTeam() : this.teams[index];
    const parts: Phaser.GameObjects.GameObject[] = [];
    const add = <G extends Phaser.GameObjects.GameObject>(g: G): G => { panel.add(g); parts.push(g); return g; };
    const teamName = add(this.add.text(x, 145, team.name, T(18, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(.5));
    teamName.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openTeamPicker(isPlayer));
    const suffix = isPlayer && this.selectedItemIds.has(ITEM_IDS.megaEvolution) ? '  ·  MEGA TEST SLOT 1' : '';
    add(this.add.text(x, 168, `TEAM OVR  ${averageOverall(team.players)}${suffix}`, T(11, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5));
    team.players.forEach((p, i) => {
      const px = x - 180 + i * 120;
      add(this.add.image(px, 207, `pkm-${p.sprite}`).setScale(.48));
      add(this.add.text(px, 241, p.name, T(10, THEME.WHITE, { align: 'center', wordWrap: { width: 112 } })).setOrigin(.5));
      add(this.add.text(px, 263, `OVR ${overall(p)}`, T(10, THEME.GOLD)).setOrigin(.5));
    });
    panel.setData('team-content', parts);
  }

  private openTeamPicker(playerSide: boolean): void {
    this.closeTeamPicker();
    const dim = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.92).setInteractive().setDepth(100);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 960, 500, FILL.panel, 1).setStrokeStyle(2, THEME.GOLD).setDepth(101);
    this.pickerObjects.push(dim, panel);
    const title = this.add.text(GAME_WIDTH / 2, 112, `CHOOSE TEAM TO ${playerSide ? 'PLAY AS' : 'PLAY AGAINST'}`, T(20, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5).setDepth(102);
    this.pickerObjects.push(title);
    this.teams.forEach((team, i) => {
      const col = i % 4, row = Math.floor(i / 4), x = 245 + col * 235, y = 166 + row * 58;
      const current = team.id === this.teams[playerSide ? this.playerIndex : this.opponentIndex].id;
      const plate = this.add.rectangle(x, y, 218, 44, current ? FILL.plateHi : FILL.plate, 1).setStrokeStyle(current ? 2 : 1, current ? THEME.GOLD : THEME.DIM).setInteractive({ useHandCursor: true }).setDepth(102);
      const name = this.add.text(x, y - 7, team.name, T(11, THEME.WHITE, { fontStyle: 'bold', align: 'center', wordWrap: { width: 205 } })).setOrigin(.5).setDepth(103);
      const ovr = this.add.text(x, y + 12, `TEAM OVR ${averageOverall(team.players)}`, T(10, THEME.GOLD)).setOrigin(.5).setDepth(103);
      this.pickerObjects.push(plate, name, ovr);
      const choose = () => {
        if (playerSide) this.playerIndex = i; else this.opponentIndex = i;
        this.closeTeamPicker();
        this.renderTeam(playerSide ? this.playerPanel : this.opponentPanel, i, playerSide);
      };
      plate.on('pointerdown', choose); name.setInteractive({ useHandCursor: true }).on('pointerdown', choose); ovr.setInteractive({ useHandCursor: true }).on('pointerdown', choose);
    });
    const close = this.add.text(GAME_WIDTH / 2, 565, 'CANCEL  ·  ESC', T(12, THEME.DIM, { fontStyle: 'bold' })).setOrigin(.5).setInteractive({ useHandCursor: true }).setDepth(104);
    close.on('pointerdown', () => this.closeTeamPicker());
    this.pickerObjects.push(close);
  }

  private closeTeamPicker(): void { this.pickerObjects.forEach(o => o.destroy()); this.pickerObjects = []; }

  private setLoadoutTab(tab: LoadoutTab): void {
    if (this.loadoutTab === tab) return;
    this.loadoutTab = tab;
    this.powerIndex = 0;
    this.itemIndex = 0;
    this.refreshLoadoutTabs();
    this.renderPowers();
  }

  private createLoadoutTab(x: number, y: number, title: string, tab: LoadoutTab, width: number): void {
    const plate = this.add.rectangle(x, y, width, 28, FILL.plate, 1).setStrokeStyle(1, THEME.DIM).setInteractive({ useHandCursor: true });
    const label = this.add.text(x, y, title, T(10, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(.5).setInteractive({ useHandCursor: true });
    const choose = () => this.setLoadoutTab(tab);
    plate.on('pointerdown', choose);
    label.on('pointerdown', choose);
    this.tabButtons.push({ plate, label, tab });
  }

  private refreshLoadoutTabs(): void {
    for (const button of this.tabButtons) {
      const active = button.tab === this.loadoutTab;
      button.plate.setFillStyle(active ? FILL.plateHi : FILL.plate, 1);
      button.plate.setStrokeStyle(active ? 2 : 1, active ? (button.tab === 'items' ? THEME.GREEN : THEME.GOLD) : THEME.DIM);
      button.label.setColor(hex(active ? (button.tab === 'items' ? THEME.GREEN : THEME.GOLD) : THEME.DIM));
    }
  }

  private activeLoadoutLength(): number { return this.loadoutTab === 'powers' ? POWER_DEFINITIONS.length : SHOP_OFFERS.filter(o => o.kind === 'item').length; }
  private cycleLoadout(direction: number): void {
    if (this.loadoutTab === 'powers') this.powerIndex = (this.powerIndex + direction + POWER_DEFINITIONS.length) % POWER_DEFINITIONS.length;
    else this.itemIndex = (this.itemIndex + direction + this.activeLoadoutLength()) % this.activeLoadoutLength();
    this.renderPowers();
  }
  private toggleFocusedLoadout(): void {
    if (this.loadoutTab === 'powers') this.togglePower(POWER_DEFINITIONS[this.powerIndex].id);
    else {
      const item = SHOP_OFFERS.filter(o => o.kind === 'item')[this.itemIndex];
      if (item) this.toggleItem(item.id);
    }
  }

  private renderPowers(): void {
    this.powersPanel.removeAll(true);
    const items = SHOP_OFFERS.filter(o => o.kind === 'item');
    this.selectedTabText.setText(this.loadoutTab === 'powers'
      ? 'Toggle powers for this match only'
      : 'All items testable here · no save unlock required');
    const add = (obj: Phaser.GameObjects.GameObject) => this.powersPanel.add(obj);
    if (this.loadoutTab === 'powers') {
      POWER_DEFINITIONS.forEach((power, i) => {
        const col = i % 2, row = Math.floor(i / 2), x = col === 0 ? 328 : 864, y = 420 + row * 65;
        const selected = this.selectedPowerIds.has(power.id), focused = i === this.powerIndex;
        const frame = this.add.rectangle(x, y, 520, 54, selected ? 0x16372f : FILL.plate, 1)
          .setStrokeStyle(focused ? 2 : 1, selected ? THEME.GREEN : focused ? THEME.GOLD : THEME.DIM);
        const label = this.add.text(x - 246, y - 17, `${selected ? '✓' : '○'}  ${power.name}`, T(13, selected ? THEME.GREEN : THEME.WHITE, { fontStyle: 'bold' }));
        const desc = this.add.text(x - 246, y + 3, power.description, T(11, THEME.DIM, { wordWrap: { width: 488 } }));
        [frame, label, desc].forEach(add);
        [frame, label, desc].forEach(o => o.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.powerIndex = i; this.togglePower(power.id); }));
      });
    } else {
      // The starter-form buttons are specific to the Mega Band test harness. They replace
      // player-team slot 1 with that fully evolved starter only in the isolated test match.
      const formText = this.add.text(68, 396, 'MEGA TEST STARTER', T(9, this.selectedItemIds.has(ITEM_IDS.megaEvolution) ? THEME.GOLD : THEME.DIM, { fontStyle: 'bold' }));
      add(formText);
      STARTERS.forEach((starter, i) => {
        const x = 310 + i * 170;
        const selected = this.megaStarter === starter;
        const frame = this.add.rectangle(x, 396, 150, 22, selected ? FILL.plateHi : FILL.plate, 1).setStrokeStyle(selected ? 2 : 1, selected ? THEME.GOLD : THEME.DIM);
        const label = this.add.text(x, 396, STARTER_LABELS[starter], T(9, selected ? THEME.GOLD : THEME.WHITE, { fontStyle: 'bold' })).setOrigin(.5);
        add(frame); add(label);
        frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.selectMegaStarter(starter));
        label.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.selectMegaStarter(starter));
      });
      items.forEach((item, i) => {
        const col = i % 2, row = Math.floor(i / 2), x = col === 0 ? 328 : 864, y = 427 + row * 34;
        const id = item.id;
        const selected = this.selectedItemIds.has(id), focused = i === this.itemIndex;
        const labelText = ITEM_TEST_DESCRIPTIONS[id] || item.description;
        const frame = this.add.rectangle(x, y, 520, 30, selected ? 0x16372f : FILL.plate, 1)
          .setStrokeStyle(focused ? 2 : 1, selected ? THEME.GREEN : focused ? THEME.GOLD : THEME.DIM);
        const label = this.add.text(x - 246, y - 12, `${selected ? '✓' : '○'}  ${item.name}`, T(11, selected ? THEME.GREEN : THEME.WHITE, { fontStyle: 'bold' }));
        const description = this.add.text(x - 246, y + 2, labelText, T(10, THEME.GRAY));
        add(frame); add(label); add(description);
        frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.itemIndex = i; this.toggleItem(id); });
        label.setInteractive({ useHandCursor: true }).on('pointerdown', () => { this.itemIndex = i; this.toggleItem(id); });
      });
    }
    this.renderHistory();
  }

  private selectMegaStarter(starter: StarterId): void {
    this.megaStarter = starter;
    this.renderPowers();
    this.renderTeam(this.playerPanel, this.playerIndex, true);
  }

  private renderHistory(): void {
    if (!this.historyText) return;
    this.historyText.setText(this.history.length
      ? this.history.slice(0, 2).map(r => `${r.result.toUpperCase()}  ${r.playerScore}–${r.opponentScore}  ${r.playerTeamName ?? 'Player'} vs ${r.opponentName}  ·  ${r.liveSeconds}s  ·  shots ${r.shots}  ·  powers ${r.powerActivations}  ·  items ${(r.itemIds || []).length}`).join('\n')
      : 'No test matches yet. Choose both teams, configure a loadout, and start a match.');
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
    if (this.noteText) this.noteText.setText('');
  }
  private togglePower(id: string): void {
    if (this.selectedPowerIds.has(id)) this.selectedPowerIds.delete(id); else this.selectedPowerIds.add(id);
    this.renderPowers();
  }
  private toggleItem(id: string): void {
    if (this.selectedItemIds.has(id)) this.selectedItemIds.delete(id); else this.selectedItemIds.add(id);
    this.renderPowers();
    this.renderTeam(this.playerPanel, this.playerIndex, true);
  }
  private launchMatch(): void {
    const player = buildBalanceLabPlayerTeam(this.teams[this.playerIndex], [...this.selectedItemIds], this.megaStarter);
    const opponent = this.teams[this.opponentIndex];
    this.scene.start('GameScene', {
      userTeam: player,
      opponent,
      level: this.difficulty,
      testMode: true,
      powerIds: [...this.selectedPowerIds],
      testItemIds: [...this.selectedItemIds],
      testStarter: this.selectedItemIds.has(ITEM_IDS.megaEvolution) ? this.megaStarter : null,
    });
  }
  private makeButton(x: number, y: number, label: string, onClick: () => void, width = 110, height = 32, color: number = THEME.GOLD): void {
    const plate = this.add.rectangle(x, y, width, height, FILL.plate, 1).setStrokeStyle(1, color).setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, T(10, color, { fontStyle: 'bold' })).setOrigin(.5);
    plate.on('pointerdown', onClick); text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }
  private download(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` }); const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }
  shutdown(): void { if (this.onKey) window.removeEventListener('keydown', this.onKey); this.onKey = null; }
}
