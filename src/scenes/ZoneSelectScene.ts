import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { STARTER_EVOLUTIONS, ZONES, TIME_COSTS } from '../config/progression';
import { ISLAND_TEAMS } from '../config/teams';
import type { Team } from '../config/teams';
import { averageOverall } from '../core/poach';
import { getMeta, isTournamentDue, spendDays, updateMeta, type StarterId } from '../state/metaStore';
import { islandOpening } from '../config/story';
import { TextButton } from '../ui/menu';
import { FONT, THEME, hex } from '../ui/theme';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { wireShutdown } from '../ui/sceneLifecycle';
import { getRun } from '../state/runStore';

const MAP_X = 8;
const MAP_Y = 48;
const MAP_W = 778;
const MAP_H = 550;
const MAP_SOURCE_W = 1192;
const MAP_SOURCE_H = 843;
const MAP_SX = MAP_W / MAP_SOURCE_W;
const MAP_SY = MAP_H / MAP_SOURCE_H;

type AreaId = string | 'tower' | 'home';
interface MapNode {
  id: AreaId;
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
  title: string;
  subtitle: (cleared: boolean, tournamentDue: boolean) => string;
  accent: number;
  isZone?: boolean;
}

const REGION_NODES: MapNode[] = [
  // Coordinates refer to the label plaques in the generated reference artwork.
  { id: 'coastal', sourceX: 239, sourceY: 255, width: 164, height: 45, title: 'COASTAL CIRCUIT', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 01  ·  OPEN', accent: 0x56df91, isZone: true },
  { id: 'haunted', sourceX: 601, sourceY: 178, width: 160, height: 44, title: 'HAUNTED RINKS', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 02  ·  OPEN', accent: 0x80e3a3, isZone: true },
  { id: 'summit', sourceX: 1012, sourceY: 217, width: 158, height: 44, title: 'SUMMIT LEAGUE', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 03  ·  OPEN', accent: 0x85c9ff, isZone: true },
  { id: 'abyss', sourceX: 280, sourceY: 668, width: 150, height: 44, title: 'THE ABYSS', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 04  ·  OPEN', accent: 0xc5a1ff, isZone: true },
  { id: 'tower', sourceX: 657, sourceY: 542, width: 172, height: 46, title: 'BATTLE TOWER', subtitle: (_c, due) => due ? 'TOURNAMENT DAY  ·  ENTER' : 'ALWAYS OPEN  ·  FAST-FORWARD', accent: 0x7fdcff },
];

const HOME_NODE = { x: MAP_X + 1016 * MAP_SX, y: MAP_Y + (832 - 80) * MAP_SY };
const TEXT_STYLE = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) => ({
  fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra,
});

/**
 * A 16-bit Pokémon-style archipelago. The artwork is the map itself; Phaser
 * draws all status, selection, and area details dynamically so save data drives
 * the visuals rather than the baked-in labels from the reference mockup.
 */
export class ZoneSelectScene extends Phaser.Scene {
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private towerDialog: ConfirmDialog | null = null;
  private selectedId: AreaId = 'coastal';
  private nodeUi: Phaser.GameObjects.GameObject[] = [];
  private detailUi: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('ZoneSelectScene'); }

  create(): void {
    wireShutdown(this);
    this.towerDialog = null;
    const meta = getMeta();
    this.selectedId = meta.selectedZoneId || 'coastal';
    if (!ZONES.some((z) => z.id === this.selectedId) && this.selectedId !== 'tower' && this.selectedId !== 'home') {
      this.selectedId = 'coastal';
    }

    this.cameras.main.setBackgroundColor(0x061631);

    // The reference artwork was cropped to just the archipelago; all UI is live.
    this.add.image(MAP_X + MAP_W / 2, MAP_Y + MAP_H / 2, 'overworld-regions').setDisplaySize(MAP_W, MAP_H);
    this.add.rectangle(MAP_X + MAP_W / 2, MAP_Y + MAP_H / 2, MAP_W, MAP_H, 0xffffff, 0)
      .setStrokeStyle(2, 0x1c65a6, 1);

    // Crisp top bar matching the navy + gold framing of the art.
    this.add.rectangle(GAME_WIDTH / 2, 26, GAME_WIDTH - 20, 38, 0x061b3c, 1).setStrokeStyle(2, THEME.GOLD, 1);
    this.add.rectangle(28, 26, 18, 18, 0xf3f3ef, 1).setStrokeStyle(2, 0x213d62, 1);
    this.add.circle(28, 26, 8, 0xffffff, 1).setStrokeStyle(1, 0x263957, 1);
    this.add.arc(28, 26, 8, Math.PI, Math.PI * 2, false, 0xc53c4b, 1).setStrokeStyle(1, 0x263957, 1);
    this.add.rectangle(28, 26, 16, 2, 0x263957, 1);
    this.add.circle(28, 26, 3, 0xf3f3ef, 1).setStrokeStyle(1, 0x263957, 1);
    this.add.text(47, 26, 'ICE POKÉY  /  WORLD MAP', TEXT_STYLE(17, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(0, 0.5);
    const calendar = getMeta();
    const dayText = calendar.daysRemaining <= 0
      ? `YEAR ${calendar.seasonYear}  ·  TOURNAMENT DAY`
      : `YEAR ${calendar.seasonYear}  ·  ${calendar.daysRemaining} DAYS LEFT`;
    this.add.text(GAME_WIDTH - 28, 26, dayText, TEXT_STYLE(12, calendar.daysRemaining <= 45 ? THEME.RED : THEME.GOLD, { fontStyle: 'bold' })).setOrigin(1, 0.5);

    // Side pane frame and pixel corners.
    const paneX = 964, paneY = 318, paneW = 338, paneH = 540;
    this.add.rectangle(paneX, paneY, paneW, paneH, 0x061a3a, 0.98).setStrokeStyle(3, THEME.GOLD, 1);
    this.add.rectangle(paneX, paneY, paneW - 8, paneH - 8, 0x000000, 0).setStrokeStyle(1, 0x32649b, 0.95);
    [[paneX - paneW / 2 + 10, paneY - paneH / 2 + 10], [paneX + paneW / 2 - 10, paneY - paneH / 2 + 10], [paneX - paneW / 2 + 10, paneY + paneH / 2 - 10], [paneX + paneW / 2 - 10, paneY + paneH / 2 - 10]].forEach(([x, y]) => {
      this.add.rectangle(x, y, 8, 8, THEME.GOLD, 1);
    });

    this.paintMapNodes();
    this.paintDetails();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { this.scene.start('TitleScene'); return; }
      if (/^Digit[1-4]$/.test(e.code)) { this.selectArea(ZONES[Number(e.code.slice(-1)) - 1].id); return; }
      if (e.code === 'Enter' || e.code === 'Space') { this.activateSelection(); return; }
      if (e.code === 'KeyT') { this.enterTower(); return; }
      if (e.code === 'KeyL') { this.scene.start('LineupScene'); return; }
      if (e.code === 'KeyS') { this.scene.start('StoreScene'); return; }
      if (e.code === 'KeyH') { this.selectArea('home'); return; }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
  }

  private pointFromSource(x: number, y: number): { x: number; y: number } {
    // Source mockup begins at y=80; the crop retains only the map illustration.
    return { x: MAP_X + x * MAP_SX, y: MAP_Y + (y - 80) * MAP_SY };
  }

  private addNodeObject<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.nodeUi.push(object);
    return object;
  }

  private clearUi(objects: Phaser.GameObjects.GameObject[]): void {
    for (const object of objects) object.destroy();
    objects.length = 0;
  }

  private paintMapNodes(): void {
    this.clearUi(this.nodeUi);
    const run = getRun();
    const tournamentDue = isTournamentDue();

    // Clickable region hitboxes cover the islands themselves, not just their
    // name plaques. They are inserted first so the more precise plaques above
    // them still receive the click where the two overlap.
    const islandAreas: { id: AreaId; x: number; y: number; w: number; h: number }[] = [
      { id: 'coastal', x: 166, y: 222, w: 242, h: 218 },
      { id: 'haunted', x: 408, y: 165, w: 230, h: 214 },
      { id: 'summit', x: 650, y: 213, w: 246, h: 242 },
      { id: 'abyss', x: 173, y: 474, w: 286, h: 220 },
      { id: 'tower', x: 436, y: 374, w: 178, h: 104 },
      { id: 'home', x: HOME_NODE.x, y: HOME_NODE.y - 6, w: 174, h: 108 },
    ];
    islandAreas.forEach((area) => {
      const zone = ZONES.find((z) => z.id === area.id);
      const cleared = !!zone && run.results[zone.bossId] === 'win';
      const selectable = area.id === 'tower' || area.id === 'home' || (!cleared && !tournamentDue);
      if (!selectable) return;
      const hit = this.addNodeObject(this.add.zone(area.x, area.y, area.w, area.h).setInteractive({ useHandCursor: true }));
      hit.on('pointerdown', () => this.selectArea(area.id));
    });

    REGION_NODES.forEach((node) => {
      const pos = this.pointFromSource(node.sourceX, node.sourceY);
      const zone = node.isZone ? ZONES.find((z) => z.id === node.id) : undefined;
      const cleared = !!zone && run.results[zone.bossId] === 'win';
      const selectable = node.id === 'tower' || (!cleared && !tournamentDue);
      const selected = this.selectedId === node.id;
      const accent = cleared ? 0x54e58d : selected ? THEME.GOLD : node.accent;
      const subtitle = node.subtitle(cleared, tournamentDue);
      const panel = this.addNodeObject(this.add.rectangle(pos.x, pos.y, node.width, node.height, 0x061b3a, 0.99)
        .setStrokeStyle(selected ? 3 : 2, accent, 1));
      this.addNodeObject(this.add.rectangle(pos.x - node.width / 2 + 7, pos.y, 4, node.height - 8, accent, 1));
      this.addNodeObject(this.add.text(pos.x + 2, pos.y - 7, node.title, TEXT_STYLE(10, cleared ? 0xbaffca : THEME.WHITE, { fontStyle: 'bold', align: 'center' })).setOrigin(0.5));
      this.addNodeObject(this.add.text(pos.x + 2, pos.y + 10, subtitle, TEXT_STYLE(8, cleared ? 0x75f2a1 : accent, { align: 'center' })).setOrigin(0.5));

      if (selectable) {
        const hit = this.addNodeObject(this.add.rectangle(pos.x, pos.y, node.width, node.height, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true }));
        hit.on('pointerdown', () => this.selectArea(node.id));
        hit.on('pointerover', () => { panel.setStrokeStyle(3, THEME.GOLD, 1); });
        hit.on('pointerout', () => { panel.setStrokeStyle(this.selectedId === node.id ? 3 : 2, this.selectedId === node.id ? THEME.GOLD : accent, 1); });
      }
    });

    // Fifth outer island is the player's home base. Its two services are in the side pane.
    const homeSelected = this.selectedId === 'home';
    const homePlate = this.addNodeObject(this.add.rectangle(HOME_NODE.x, HOME_NODE.y, 128, 30, 0x061b3a, 0.99)
      .setStrokeStyle(homeSelected ? 3 : 2, homeSelected ? THEME.GOLD : 0xffd16d, 1));
    this.addNodeObject(this.add.text(HOME_NODE.x, HOME_NODE.y - 1, 'HOME BASE', TEXT_STYLE(10, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(0.5));
    this.addNodeObject(this.add.text(HOME_NODE.x, HOME_NODE.y + 10, 'TEAM  ·  STORE', TEXT_STYLE(7, 0xffd16d)).setOrigin(0.5));
    const homeHit = this.addNodeObject(this.add.rectangle(HOME_NODE.x, HOME_NODE.y, 128, 30, 0xffffff, 0.001).setInteractive({ useHandCursor: true }));
    homeHit.on('pointerdown', () => this.selectArea('home'));
    homeHit.on('pointerover', () => homePlate.setStrokeStyle(3, THEME.GOLD, 1));
    homeHit.on('pointerout', () => homePlate.setStrokeStyle(this.selectedId === 'home' ? 3 : 2, this.selectedId === 'home' ? THEME.GOLD : 0xffd16d, 1));

    this.addNodeObject(this.add.text(25, 579, 'CLICK A REGION TO INSPECT  ·  ENTER TO TRAVEL  ·  ESC TO TITLE', TEXT_STYLE(9, 0xf0f4ff, { backgroundColor: '#071a38', padding: { x: 6, y: 4 } })).setOrigin(0, 0.5));
  }

  private paintDetails(): void {
    this.clearUi(this.detailUi);
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.detailUi.push(object); return object; };
    const x = 808, contentW = 308;
    const meta = getMeta();
    const run = getRun();
    const zone = ZONES.find((z) => z.id === this.selectedId);
    const isTower = this.selectedId === 'tower';
    const isHome = this.selectedId === 'home';
    const cleared = !!zone && run.results[zone.bossId] === 'win';
    const due = isTournamentDue();

    add(this.add.text(x, 66, 'AREA INTEL', TEXT_STYLE(10, THEME.GOLD, { fontStyle: 'bold' })));
    add(this.add.rectangle(964, 84, 306, 1, 0x34699d, 1));

    const title = isHome ? 'HOME BASE' : isTower ? 'BATTLE TOWER' : zone?.name || 'COASTAL CIRCUIT';
    add(this.add.text(x, 95, title, TEXT_STYLE(17, THEME.WHITE, { fontStyle: 'bold', wordWrap: { width: contentW } })));

    const status = isHome ? 'YOUR HEADQUARTERS' : isTower ? 'ALWAYS OPEN' : cleared ? 'ISLAND CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOURNAMENT DAY' : `REALM ${String(ZONES.indexOf(zone!) + 1).padStart(2, '0')}  ·  AVAILABLE`;
    const statusColor = isHome ? 0xffd16d : isTower ? THEME.BLUE : cleared ? THEME.GREEN : due ? THEME.RED : THEME.GOLD;
    add(this.add.rectangle(964, 126, 306, 24, cleared ? 0x10452e : 0x0d2d52, 1).setStrokeStyle(1, statusColor, 1));
    add(this.add.text(964, 126, status, TEXT_STYLE(9, statusColor, { fontStyle: 'bold' })).setOrigin(0.5));

    let description = '';
    if (isHome) description = 'Your headquarters between trips. Manage your active lineup, inspect recruits, and spend credits on permanent upgrades.';
    else if (isTower) description = 'The year-end gauntlet. Entering before the countdown ends fast-forwards the remaining days. Once it starts, the realms are closed for the year.';
    else description = zone?.description || '';
    add(this.add.text(x, 148, description, TEXT_STYLE(11, 0xd7e5f7, { wordWrap: { width: contentW }, lineSpacing: 3 } )).setOrigin(0, 0));
    add(this.add.rectangle(964, 218, 306, 1, 0x34699d, 1));

    if (zone) {
      const index = ZONES.indexOf(zone);
      const teams = ISLAND_TEAMS[zone.id] || [];
      const opponentOvr = Math.round(teams.reduce((sum: number, team: Team) => sum + averageOverall(team.players), 0) / Math.max(1, teams.length));
      const difficulty = [25, 49, 76, 96][index] || 25;
      const difficultyName = ['STARTER-FRIENDLY', 'CHALLENGING', 'ELITE', 'EXTREME'][index] || 'CHALLENGING';
      add(this.add.text(x, 235, 'REALM DIFFICULTY', TEXT_STYLE(9, THEME.GOLD, { fontStyle: 'bold' })));
      add(this.add.text(GAME_WIDTH - 32, 235, `TIER ${index + 1} / 4`, TEXT_STYLE(9, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(1, 0));
      add(this.add.rectangle(964, 255, 306, 12, 0x0b2a4b, 1).setStrokeStyle(1, 0x34699d, 1));
      add(this.add.rectangle(811 + (306 * difficulty / 100) / 2, 255, 306 * difficulty / 100, 8, zone.id === 'coastal' ? 0x58db8b : zone.id === 'haunted' ? 0x79d4bb : zone.id === 'summit' ? 0x7fc5ff : 0xb59afa, 1));
      add(this.add.text(x, 270, difficultyName, TEXT_STYLE(9, 0xd7e5f7)));
      add(this.add.rectangle(964, 308, 306, 54, 0x092444, 1).setStrokeStyle(1, 0x34699d, 1));
      add(this.add.text(825, 292, 'OPPONENT OVERALL', TEXT_STYLE(9, THEME.BLUE, { fontStyle: 'bold' })));
      add(this.add.text(1100, 311, `~${opponentOvr}`, TEXT_STYLE(24, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(1, 0.5));
      add(this.add.text(825, 328, 'Average roster rating across the realm', TEXT_STYLE(8, THEME.GRAY)));
    } else if (isTower) {
      add(this.add.text(x, 235, 'TOURNAMENT DIFFICULTY', TEXT_STYLE(9, THEME.GOLD, { fontStyle: 'bold' })));
      add(this.add.rectangle(964, 255, 306, 12, 0x0b2a4b, 1).setStrokeStyle(1, 0x34699d, 1));
      add(this.add.rectangle(964, 255, 296, 8, 0xff8b67, 1));
      add(this.add.text(x, 270, 'EXTREME  ·  FLOOR ONE IS A WALL', TEXT_STYLE(9, THEME.RED)));
      add(this.add.text(x, 297, 'AI difficulty', TEXT_STYLE(9, THEME.BLUE)));
      add(this.add.text(1100, 306, '97%', TEXT_STYLE(22, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(1, 0.5));
      add(this.add.text(x, 329, due ? 'Tournament is ready to begin.' : 'Entering now skips the remaining calendar.', TEXT_STYLE(8, THEME.GRAY)));
    } else {
      add(this.add.text(x, 239, 'BETWEEN MATCHES', TEXT_STYLE(9, THEME.GOLD, { fontStyle: 'bold' })));
      add(this.add.text(x, 260, 'Time and permanent upgrades are managed here.', TEXT_STYLE(10, 0xd7e5f7, { wordWrap: { width: contentW } })));
    }

    add(this.add.rectangle(964, 349, 306, 1, 0x34699d, 1));
    add(this.add.text(x, 365, 'YOUR STARTER', TEXT_STYLE(9, THEME.GOLD, { fontStyle: 'bold' })));

    const starterId = meta.starter as StarterId | null;
    if (starterId && STARTER_EVOLUTIONS[starterId]) {
      const xp = meta.starterXp[starterId] || 0;
      const evolutions = STARTER_EVOLUTIONS[starterId];
      const current = [...evolutions].reverse().find((evo) => xp >= evo.at) || evolutions[0];
      add(this.add.rectangle(964, 408, 306, 70, 0x092444, 1).setStrokeStyle(1, 0x34699d, 1));
      add(this.add.image(848, 408, `pkm-${current.sprite}`).setDisplaySize(58, 58));
      add(this.add.text(889, 391, current.name.toUpperCase(), TEXT_STYLE(13, THEME.WHITE, { fontStyle: 'bold' })));
      add(this.add.text(889, 413, `${xp} XP  ·  ${xp >= 100 ? 'FINAL EVOLUTION' : `NEXT FORM AT ${evolutions.find((e) => e.at > xp)?.at ?? 100} XP`}`, TEXT_STYLE(9, THEME.GREEN)));
      add(this.add.text(889, 434, 'YOUR CAMPAIGN PARTNER', TEXT_STYLE(8, THEME.GRAY)));
    } else {
      add(this.add.rectangle(964, 408, 306, 70, 0x092444, 1).setStrokeStyle(1, 0x34699d, 1));
      const starters = [246, 443, 371];
      starters.forEach((sprite, i) => add(this.add.image(870 + i * 92, 408, `pkm-${sprite}`).setDisplaySize(42, 42)));
      add(this.add.text(964, 446, 'CHOOSE YOUR STARTER TO BEGIN', TEXT_STYLE(8, THEME.GRAY)).setOrigin(0.5));
    }

    // Actions are contextual: selecting a realm is safe; entering spends time.
    if (zone) {
      const button = new TextButton(this, 964, 506, cleared ? 'ISLAND CLEARED' : due ? 'REALMS CLOSED TODAY' : 'ENTER REALM', {
        color: cleared ? THEME.GREEN : due ? THEME.GRAY : THEME.GOLD,
        minWidth: 284,
        onSelect: cleared || due ? undefined : () => this.enter(zone.id),
      });
      add(button);
    } else if (isTower) {
      const button = new TextButton(this, 964, 506, 'ENTER BATTLE TOWER', { color: THEME.GOLD, minWidth: 284, onSelect: () => this.enterTower() });
      add(button);
    } else {
      const manage = new TextButton(this, 888, 490, 'MANAGE TEAM', { color: THEME.GREEN, minWidth: 146, onSelect: () => this.scene.start('LineupScene') });
      const store = new TextButton(this, 1040, 490, 'LOCKER ROOM', { color: THEME.GOLD, minWidth: 146, onSelect: () => this.scene.start('StoreScene') });
      add(manage); add(store);
    }

    add(this.add.text(964, 554, '1–4 SELECT REALMS   ·   T TOWER   ·   H HOME', TEXT_STYLE(8, THEME.GRAY)).setOrigin(0.5));
  }

  private selectArea(id: AreaId): void {
    if (id !== 'tower' && id !== 'home') {
      const zone = ZONES.find((z) => z.id === id);
      if (!zone || isTournamentDue() || getRun().results[zone.bossId] === 'win') return;
      updateMeta({ selectedZoneId: id });
    }
    this.selectedId = id;
    this.paintMapNodes();
    this.paintDetails();
  }

  private activateSelection(): void {
    if (this.selectedId === 'home') { this.scene.start('LineupScene'); return; }
    if (this.selectedId === 'tower') { this.enterTower(); return; }
    const zone = ZONES.find((z) => z.id === this.selectedId);
    if (zone) this.enter(zone.id);
  }

  private enterTower(): void {
    if (isTournamentDue()) { this.scene.start('BattleTowerScene'); return; }
    this.towerDialog?.destroy();
    this.towerDialog = new ConfirmDialog(this, 'ENTER THE BATTLE TOWER?', 'This will fast-forward the remaining days and begin the year-end tournament. You cannot return to the islands once it starts.', 'FAST-FORWARD', () => {
      this.towerDialog?.destroy(); this.towerDialog = null;
      updateMeta({ daysRemaining: 0 });
      this.scene.start('BattleTowerScene');
    }, () => { this.towerDialog?.destroy(); this.towerDialog = null; });
  }

  private enter(id: string): void {
    if (isTournamentDue()) return;
    const zoneCheck = ZONES.find((z) => z.id === id);
    if (!zoneCheck || getRun().results[zoneCheck.bossId] === 'win') return;
    updateMeta({ selectedZoneId: id });
    const remaining = spendDays(TIME_COSTS.islandVisit);
    if (remaining <= 0) { this.scene.start('ZoneSelectScene'); return; }
    const zone = ZONES.find((z) => z.id === id)!;
    const flag = `story-year-${getMeta().seasonYear}-island-${id}`;
    if (!getMeta().flags.includes(flag)) {
      this.scene.start('DialogueScene', { nextScene: 'OpponentSelectScene', lines: islandOpening(zone.name, getMeta().seasonYear), flag });
      return;
    }
    this.scene.start('OpponentSelectScene');
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.towerDialog?.destroy(); this.towerDialog = null;
    this.clearUi(this.nodeUi); this.clearUi(this.detailUi);
  }
}
