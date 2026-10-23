import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { isIslandBoss, recruitToBench, skipPoach, teamById } from '../core/campaign';
import { compareStats, overall } from '../core/poach';
import { getRun, setRun } from '../state/runStore';
import { CARD_W, PlayerCard } from '../ui/PlayerCard';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { claimIslandResource, getMeta, isTournamentDue } from '../state/metaStore';
import { ZONES } from '../config/progression';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { bossVictory, secondCoastalBossVictory } from '../config/story';
import { resolveWorldZone } from '../core/worldState';

const LEFT = 220, RIGHT = 972;
const FIELD_Y = [184, 278, 372], GOALIE_Y = 478;
const T = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.Types.GameObjects.Text.TextStyle => ({ fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra });

/** Recruit screen styled around readable roster cards and a live stat comparison. */
export class PoachScene extends Phaser.Scene {
  private teamId = '';
  private selected = 0;
  private sourceCards: PlayerCard[] = [];
  private ownCards: PlayerCard[] = [];
  private previewSprite!: Phaser.GameObjects.Image;
  private previewName!: Phaser.GameObjects.Text;
  private previewOvr!: Phaser.GameObjects.Text;
  private compareName!: Phaser.GameObjects.Text;
  private statRows: { label: Phaser.GameObjects.Text; own: Phaser.GameObjects.Text; take: Phaser.GameObjects.Text; diff: Phaser.GameObjects.Text }[] = [];
  private hint!: Phaser.GameObjects.Text;
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private confirmDialog: ConfirmDialog | null = null;
  private resourceIndex = -1;
  private resourceCard?: Phaser.GameObjects.Rectangle;
  private resourceTitle?: Phaser.GameObjects.Text;
  private resourceSubtitle?: Phaser.GameObjects.Text;
  private resourcePreviewText?: Phaser.GameObjects.Text;
  constructor() { super('PoachScene'); }
  init(data: { teamId: string; selected?: number }): void { this.teamId = data?.teamId ?? ''; this.selected = Math.max(0, data?.selected ?? 0); this.sourceCards = []; this.ownCards = []; this.statRows = []; this.resourceIndex = -1; this.resourceCard = undefined; this.resourceTitle = undefined; this.resourceSubtitle = undefined; this.resourcePreviewText = undefined; }

  create(): void {
    wireShutdown(this);
    const W = GAME_WIDTH, run = getRun();
    if (run.pendingPoach !== this.teamId) { this.scene.start('OpponentSelectScene'); return; }
    const source = teamById(this.teamId), own = run.userTeam;
    const bossZone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GREEN);
    this.add.text(W / 2, 30, bossZone ? 'CHOOSE BOSS REWARD' : 'RECRUIT A PLAYER', T(29, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.text(W / 2, 62, bossZone ? `Choose one Pokémon from ${source.name}, or take ${bossZone.resourceName} instead. Pokémon join your bench.` : `Choose one Pokémon from ${source.name}. It joins your bench; your active lineup stays intact.`, T(13, THEME.DIM)).setOrigin(.5);
    this.add.text(LEFT, 112, `TAKE FROM  ${source.name.toUpperCase()}`, T(13, THEME.GREEN, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.text(RIGHT, 112, 'YOUR ACTIVE LINEUP', T(13, THEME.RED, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.rectangle(LEFT, 126, CARD_W, 3, THEME.GREEN, 1);
    this.add.rectangle(RIGHT, 126, CARD_W, 3, THEME.RED, 1);

    const sourcePlayers = source.players;
    sourcePlayers.forEach((p, i) => {
      const y = p.goalie ? GOALIE_Y : FIELD_Y[sourcePlayers.slice(0, i).filter(q => !q.goalie).length];
      this.sourceCards.push(new PlayerCard(this, LEFT, y, p, {
        role: p.goalie ? 'GOALIE' : 'FIELD', tone: 'take',
        onHover: () => { if (this.selected !== i) { this.selected = i; this.refresh(); } },
        onClick: () => { this.selected = i; this.refresh(); this.confirmRecruit(i); },
      }));
    });
    if (bossZone) {
      this.resourceIndex = sourcePlayers.length;
      this.resourceCard = this.add.rectangle(LEFT, 574, CARD_W, 66, FILL.panel, 1).setStrokeStyle(2, THEME.GOLD).setInteractive({ useHandCursor: true });
      this.resourceTitle = this.add.text(LEFT, 562, `ISLAND RESOURCE  ·  ${bossZone.resourceName.toUpperCase()}`, T(12, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
      this.resourceSubtitle = this.add.text(LEFT, 587, 'Permanent campaign resource · choose instead of a Pokémon', T(9, THEME.DIM, { align: 'center', wordWrap: { width: CARD_W - 20 } })).setOrigin(.5);
      this.resourceCard.on('pointerover', () => { if (this.selected !== this.resourceIndex) { this.selected = this.resourceIndex; this.refresh(); } });
      this.resourceCard.on('pointerdown', () => { this.selected = this.resourceIndex; this.refresh(); this.confirmResourceReward(); });
    }
    own.players.forEach((p, i) => {
      const y = p.goalie ? GOALIE_Y : FIELD_Y[own.players.slice(0, i).filter(q => !q.goalie).length];
      this.ownCards.push(new PlayerCard(this, RIGHT, y, p, { role: p.goalie ? 'GOALIE' : 'FIELD', tone: 'drop' }));
    });

    const cx = W / 2;
    this.add.rectangle(cx, 322, 380, 428, FILL.panel, 1).setStrokeStyle(2, THEME.DIM);
    this.add.text(cx, 126, 'RECRUIT PREVIEW', T(13, THEME.DIM)).setOrigin(.5);
    this.add.rectangle(cx - 92, 190, 84, 84, FILL.background, 1).setStrokeStyle(2, THEME.GREEN);
    this.previewSprite = this.add.image(cx - 92, 190, 'pkm-0').setScale(72 / 96);
    this.add.text(cx - 92, 244, 'TAKE', T(11, THEME.GREEN, { fontStyle: 'bold' })).setOrigin(.5);
    this.previewName = this.add.text(cx - 92, 262, '', T(13, THEME.WHITE)).setOrigin(.5);
    this.add.text(cx + 92, 190, '↔', T(25, THEME.GOLD)).setOrigin(.5);
    this.add.text(cx + 92, 244, 'COMPARE', T(11, THEME.DIM, { fontStyle: 'bold' })).setOrigin(.5);
    this.compareName = this.add.text(cx + 92, 262, '', T(12, THEME.WHITE, { align: 'center', wordWrap: { width: 100 } })).setOrigin(.5);
    this.previewOvr = this.add.text(cx, 286, '', T(13, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(.5);
    this.add.text(cx - 150, 311, 'STAT', T(11, THEME.DIM)).setOrigin(0, .5);
    this.add.text(cx - 28, 311, 'ACTIVE', T(11, THEME.RED)).setOrigin(1, .5);
    this.add.text(cx + 50, 311, 'TAKE', T(11, THEME.GREEN)).setOrigin(1, .5);
    this.add.text(cx + 150, 311, 'DIFF', T(11, THEME.DIM)).setOrigin(1, .5);
    this.add.rectangle(cx, 323, 320, 1, THEME.DIM, .5);
    const labels = ['HP', 'ATK', 'SPA', 'DEF', 'SDF', 'SPD'];
    labels.forEach((label, i) => {
      const y = 337 + i * 24;
      this.statRows.push({
        label: this.add.text(cx - 150, y, label, T(12, THEME.GRAY)).setOrigin(0, .5),
        own: this.add.text(cx - 28, y, '', T(12, THEME.WHITE)).setOrigin(1, .5),
        take: this.add.text(cx + 50, y, '', T(12, THEME.WHITE)).setOrigin(1, .5),
        diff: this.add.text(cx + 150, y, '', T(12, THEME.WHITE)).setOrigin(1, .5),
      });
    });
    this.resourcePreviewText = this.add.text(cx, 390, '', T(15, THEME.WHITE, { align: 'center', wordWrap: { width: 320 }, lineSpacing: 8 })).setOrigin(.5).setVisible(false);
    this.add.text(cx, 489, 'Choose one reward. Pokémon go to the bench; resources persist between years.', T(10, THEME.DIM, { align: 'center', wordWrap: { width: 350 } })).setOrigin(.5);
    new TextButton(this, cx, 520, 'CONFIRM REWARD', { color: THEME.GREEN, minWidth: 300, onSelect: () => this.confirmReward(this.selected) });
    new TextButton(this, cx, 562, 'STATS GUIDE  (G)', { color: THEME.BLUE, minWidth: 300, onSelect: () => this.openStatsGuide() });
    new TextButton(this, cx, 600, 'SKIP RECRUIT  (ESC)', { color: THEME.GRAY, minWidth: 300, onSelect: () => this.skip() });
    this.hint = this.add.text(cx, 630, `BENCH: ${run.bench?.length ?? 0} players`, T(12, THEME.DIM)).setOrigin(.5);
    this.add.text(cx, 654, '↑ / ↓ select · ENTER confirm · G stats · ESC skip', T(11, THEME.DIM)).setOrigin(.5);
    this.refresh();

    this.onKey = (e: KeyboardEvent) => {
      if (this.confirmDialog || e.repeat) return;
      if (e.code === 'Escape' || e.code === 'Backspace') { this.skip(); return; }
      if (e.code === 'KeyG') { this.openStatsGuide(); return; }
      const optionCount = sourcePlayers.length + (this.resourceIndex >= 0 ? 1 : 0);
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.selected = (this.selected - 1 + optionCount) % optionCount;
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.selected = (this.selected + 1) % optionCount;
      else if (e.code === 'Enter' || e.code === 'Space') { this.confirmReward(this.selected); return; }
      else return;
      this.refresh();
    };
    window.addEventListener('keydown', this.onKey);
  }

  private refresh(): void {
    const source = teamById(this.teamId), own = getRun().userTeam;
    const isResource = this.resourceIndex >= 0 && this.selected === this.resourceIndex;
    this.sourceCards.forEach((c, i) => c.setVisual({ focus: !isResource && i === this.selected, marked: !isResource && i === this.selected, dimmed: false }));
    this.ownCards.forEach(c => c.setVisual({ focus: false, marked: false, dimmed: false }));
    if (this.resourceCard && this.resourceTitle && this.resourceSubtitle && this.resourcePreviewText) {
      const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
      this.resourceCard.setFillStyle(isResource ? 0x153b36 : FILL.panel, 1).setStrokeStyle(isResource ? 4 : 2, isResource ? THEME.GREEN : THEME.GOLD);
      this.resourceTitle.setColor(hex(isResource ? THEME.GREEN : THEME.GOLD));
      this.resourceSubtitle.setColor(hex(isResource ? THEME.WHITE : THEME.DIM));
      this.resourcePreviewText.setVisible(isResource).setText(zone ? `${zone.resourceName}

${zone.resourceDescription}

This permanent resource can be spent on special Item Shop offers.` : '');
    }
    if (isResource) {
      const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
      this.previewSprite.setVisible(false);
      this.previewName.setText(zone?.resourceName || 'ISLAND RESOURCE').setColor(hex(THEME.GREEN));
      this.compareName.setText('NO POKÉMON\nTAKEN');
      this.previewOvr.setText('PERMANENT CAMPAIGN REWARD');
      this.statRows.forEach(row => { row.label.setVisible(false); row.own.setVisible(false); row.take.setVisible(false); row.diff.setVisible(false); });
      this.hint.setText(`BENCH: ${getRun().bench?.length ?? 0} players  ·  selected resource replaces the boss Pokémon reward`);
      return;
    }
    const taken = source.players[this.selected];
    if (!taken) return;
    this.previewSprite.setVisible(true).setTexture(`pkm-${taken.sprite}`);
    this.previewName.setColor(hex(THEME.WHITE)).setText(taken.name);
    const candidates = own.players.filter(p => !!p.goalie === !!taken.goalie);
    const compared = candidates.reduce((best, p) => overall(p) > overall(best) ? p : best, candidates[0]);
    this.compareName.setText(compared.name);
    this.previewOvr.setText(`OVR ${overall(taken)}   ·   ${overall(taken) - overall(compared) >= 0 ? '+' : ''}${overall(taken) - overall(compared)} vs active`);
    const deltas = compareStats(taken, compared);
    this.statRows.forEach((row, i) => {
      row.label.setVisible(true); row.own.setVisible(true); row.take.setVisible(true); row.diff.setVisible(true);
      const d = deltas[i];
      row.own.setText(String(d.dropped)); row.take.setText(String(d.taken));
      row.diff.setText(`${d.diff > 0 ? '+' : ''}${d.diff}`);
      row.diff.setColor(hex(d.diff > 0 ? THEME.GREEN : d.diff < 0 ? THEME.RED : THEME.GRAY));
    });
    this.hint.setText(`BENCH: ${getRun().bench?.length ?? 0} players  ·  compared with strongest active ${taken.goalie ? 'goalie' : 'field player'}`);
  }

  private confirmReward(i: number): void {
    if (this.resourceIndex >= 0 && i === this.resourceIndex) this.confirmResourceReward();
    else this.confirmRecruit(i);
  }

  private confirmResourceReward(): void {
    if (this.confirmDialog || this.resourceIndex < 0) return;
    const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
    if (!zone) return;
    this.confirmDialog = new ConfirmDialog(
      this,
      `CLAIM ${zone.resourceName.toUpperCase()}?`,
      `Gain 1 ${zone.resourceUnitName} for your permanent collection. This replaces the Pokémon recruit from the boss team. ${zone.resourceDescription}`,
      'CLAIM RESOURCE',
      () => {
        this.confirmDialog?.destroy(); this.confirmDialog = null;
        const year = getMeta().seasonYear;
        claimIslandResource(zone.id, year);
        setRun(skipPoach(getRun()));
        this.finishBossStory('resource', 'ZoneSelectScene');
      },
      () => { this.confirmDialog?.destroy(); this.confirmDialog = null; },
    );
  }
  private openStatsGuide(): void { this.scene.start('StatsGuideScene', { returnTo: 'PoachScene', teamId: this.teamId, selected: this.selected }); }

  private confirmRecruit(i: number): void {
    if (this.confirmDialog) return;
    const team = teamById(this.teamId), player = team.players[i];
    if (!player) return;
    const role = player.goalie ? 'goalie' : 'field player';
    const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
    const body = zone
      ? `Add ${player.name} (${role}, OVR ${overall(player)}) to your bench? Choosing this Pokémon means giving up the island's ${zone.resourceName} reward. Your active lineup will not change.`
      : `Add ${player.name} (${role}, OVR ${overall(player)}) to your bench? This choice is final for this team. Your active lineup will not change.`;
    this.confirmDialog = new ConfirmDialog(
      this, `RECRUIT ${player.name.toUpperCase()}?`, body, 'ADD TO BENCH',
      () => { this.confirmDialog?.destroy(); this.confirmDialog = null; this.recruit(i); },
      () => { this.confirmDialog?.destroy(); this.confirmDialog = null; },
      `pkm-${player.sprite}`,
    );
  }

  private recruit(i: number): void {
    const run = getRun(); if (run.pendingPoach !== this.teamId) return;
    const team = teamById(this.teamId), player = team.players[i];
    if (!player) return;
    setRun(recruitToBench(run, player.goalie ? 'goalie' : 'field', this.teamId, player.goalie ? 0 : team.players.slice(0, i).filter(p => !p.goalie).length));
    const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
    const nextData = { returnTo: (isTournamentDue() || isIslandBoss(this.teamId)) ? 'ZoneSelectScene' : 'OpponentSelectScene' };
    if (zone) {
      this.finishBossStory('recruit', 'LineupScene', nextData);
      return;
    }
    this.scene.start('LineupScene', nextData);
  }
  private finishBossStory(reward: 'resource' | 'recruit' | 'skipped', nextScene: string, nextData?: Record<string, unknown>): void {
    const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
    if (!zone) { this.scene.start(nextScene, nextData); return; }
    const meta = getMeta();
    const lines: { speaker: string; text: string }[] = [];
    const flags: string[] = [];
    const bossFlag = `story-year-${meta.seasonYear}-boss-${zone.id}`;
    const secondCoastalWin = zone.id === 'coastal' && meta.zoneBossWins.coastal === 2 && !meta.flags.includes('story-second-coastal-boss-win');
    if (!meta.flags.includes(bossFlag)) {
      // Keep the rare milestone as the one-line aftermath instead of stacking two dialogue screens together.
      lines.push(...(secondCoastalWin ? secondCoastalBossVictory() : bossVictory(zone.name, zone.resourceName, meta.seasonYear, reward)));
      flags.push(bossFlag);
    }
    if (secondCoastalWin) flags.push('story-second-coastal-boss-win');
    if (lines.length || flags.length) this.scene.start('DialogueScene', { nextScene, nextData, lines, flags });
    else this.scene.start(nextScene, nextData);
  }

  private skip(): void {
    setRun(skipPoach(getRun()));
    const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === this.teamId);
    if (zone) {
      this.finishBossStory('skipped', (isTournamentDue() || isIslandBoss(this.teamId)) ? 'ZoneSelectScene' : 'OpponentSelectScene');
      return;
    }
    this.scene.start((isTournamentDue() || isIslandBoss(this.teamId)) ? 'ZoneSelectScene' : 'OpponentSelectScene');
  }
  shutdown(): void { if (this.onKey) window.removeEventListener('keydown', this.onKey); this.onKey = null; this.confirmDialog?.destroy(); this.confirmDialog = null; }
}
