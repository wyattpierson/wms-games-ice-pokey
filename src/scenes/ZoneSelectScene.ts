import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { STARTER_EVOLUTIONS, ZONES, TIME_COSTS } from '../config/progression';
import type { Team } from '../config/teams';
import { averageOverall } from '../core/poach';
import { getMeta, isTournamentDue, markZoneEntered, spendDays, updateMeta, type StarterId } from '../state/metaStore';
import { abyssFirstVisit, islandOpening } from '../config/story';
import { TextButton } from '../ui/menu';
import { FONT, THEME, hex } from '../ui/theme';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { wireShutdown } from '../ui/sceneLifecycle';
import { getRun } from '../state/runStore';
import { teamById } from '../core/campaign';
import { resolveWorldZone } from '../core/worldState';

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

// Positioned over the lower-right home island in the cropped map artwork.
const HOME_NODE = { x: MAP_X + 680, y: MAP_Y + 456 };
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
    const pendingReward = getRun().pendingPoach;
    if (pendingReward) { this.scene.start('PoachScene', { teamId: pendingReward }); return; }
    let meta = getMeta();
    // Backward compatibility: older saves don't have activeIslandId. If the current
    // year's island intro flag exists and its boss is still unbeaten, treat it as active.
    if (!meta.activeIslandId) {
      const enteredThisYear = ZONES.find((baseZone) => {
        const zone = resolveWorldZone(baseZone.id) || baseZone;
        return meta.flags.includes(`story-year-${meta.seasonYear}-island-${zone.id}`) && getRun().results[zone.bossId] !== 'win';
      });
      if (enteredThisYear) meta = updateMeta({ activeIslandId: enteredThisYear.id, selectedZoneId: enteredThisYear.id });
    }
    this.selectedId = meta.activeIslandId || meta.selectedZoneId || 'coastal';
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
      if (e.code === 'KeyT') { if (!getMeta().activeIslandId) this.enterTower(); return; }
      if (e.code === 'KeyL') { this.scene.start('LineupScene', { returnTo: 'ZoneSelectScene' }); return; }
      if (e.code === 'KeyS') { if (!getMeta().activeIslandId) this.scene.start('StoreScene', { returnTo: 'ZoneSelectScene' }); return; }
      if (e.code === 'KeyH') { if (!getMeta().activeIslandId) this.selectArea('home'); return; }
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

    // Custom polygon hit areas follow the actual landmasses in the map image.
    // Points are in source-image pixels so the shapes stay aligned with the art
    // if MAP_W / MAP_H changes. This avoids giant rectangular targets over ocean.
    const islandShapes: { id: AreaId; points: [number, number][] }[] = [
      { id: 'coastal', points: [[47,224],[61,184],[82,144],[111,112],[149,91],[192,82],[235,88],[274,105],[313,132],[346,167],[376,204],[400,240],[397,277],[379,315],[350,350],[312,376],[276,393],[238,393],[204,377],[169,362],[137,339],[108,310],[82,280],[61,254]] },
      { id: 'haunted', points: [[425,219],[431,180],[445,143],[467,111],[491,86],[522,67],[558,55],[592,60],[628,77],[659,99],[686,126],[716,143],[753,163],[785,191],[806,222],[802,250],[779,276],[746,296],[704,309],[660,317],[614,316],[569,307],[528,294],[491,279],[461,261],[439,240]] },
      { id: 'summit', points: [[811,246],[811,204],[821,166],[837,128],[855,94],[878,62],[903,43],[930,34],[956,45],[980,61],[1004,33],[1034,18],[1068,29],[1102,48],[1134,79],[1161,116],[1182,156],[1188,198],[1181,240],[1168,278],[1153,315],[1129,350],[1103,381],[1071,410],[1035,438],[1002,450],[969,442],[936,424],[909,399],[880,370],[855,339],[835,307],[820,276]] },
      { id: 'abyss', points: [[51,604],[62,562],[79,524],[104,490],[130,462],[161,444],[194,439],[226,452],[255,471],[284,483],[316,492],[347,512],[378,531],[406,555],[431,581],[454,612],[467,642],[463,677],[446,710],[421,743],[391,772],[357,797],[322,816],[286,822],[249,816],[214,805],[180,791],[146,775],[116,751],[91,721],[69,689],[53,655]] },
      { id: 'tower', points: [[426,420],[440,391],[461,364],[486,343],[515,327],[546,315],[576,311],[608,318],[638,329],[668,347],[697,367],[725,388],[750,406],[774,430],[797,456],[817,484],[837,514],[853,544],[856,572],[843,594],[817,613],[786,629],[750,642],[712,652],[674,660],[635,660],[598,652],[565,640],[533,624],[503,606],[478,582],[458,554],[443,525],[432,496],[426,466]] },
      { id: 'home', points: [[908,627],[925,600],[947,578],[972,571],[994,581],[1016,592],[1036,603],[1058,620],[1080,645],[1095,668],[1101,691],[1091,713],[1073,731],[1049,745],[1020,752],[992,746],[968,732],[945,714],[927,691],[914,666]] },
    ];
    islandShapes.forEach((area) => {
      const zoneDefinition = resolveWorldZone(area.id);
      const cleared = !!zoneDefinition && run.results[zoneDefinition.bossId] === 'win';
      const activeIslandId = getMeta().activeIslandId;
      const selectable = zoneDefinition
        ? (activeIslandId ? activeIslandId === area.id : !cleared && !tournamentDue)
        : !activeIslandId && (area.id === 'tower' || area.id === 'home');
      if (!selectable) return;

      const xs = area.points.map((point) => point[0]);
      const ys = area.points.map((point) => point[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const width = (maxX - minX) * MAP_SX;
      const height = (maxY - minY) * MAP_SY;
      const polygon = new Phaser.Geom.Polygon(area.points.map(([x, y]) => ({
        x: (x - minX) * MAP_SX,
        y: (y - minY) * MAP_SY,
      })));
      const hit = this.addNodeObject(this.add.zone(
        MAP_X + (minX + maxX) * MAP_SX / 2,
        MAP_Y + (minY + maxY) * MAP_SY / 2,
        width,
        height,
      ));
      hit.setInteractive(polygon, Phaser.Geom.Polygon.Contains);
      if (hit.input) hit.input.cursor = 'pointer';
      hit.on('pointerdown', () => this.selectArea(area.id));
    });

    REGION_NODES.forEach((node) => {
      const pos = this.pointFromSource(node.sourceX, node.sourceY);
      const zone = node.isZone ? resolveWorldZone(node.id) : undefined;
      const cleared = !!zone && run.results[zone.bossId] === 'win';
      const activeIslandId = getMeta().activeIslandId;
      const selectable = node.id === 'tower'
        ? !activeIslandId
        : activeIslandId ? activeIslandId === node.id : (!!zone && !cleared && !tournamentDue);
      const selected = this.selectedId === node.id;
      const accent = cleared ? 0x54e58d : selected ? THEME.GOLD : node.accent;
      const subtitle = activeIslandId
        ? (node.id === activeIslandId ? 'IN PROGRESS  ·  FINISH BOSS' : node.id === 'tower' ? 'LOCKED  ·  FINISH ISLAND' : 'LOCKED  ·  ON ANOTHER ISLAND')
        : node.subtitle(cleared, tournamentDue);
      const panel = this.addNodeObject(this.add.rectangle(pos.x, pos.y, node.width, node.height, 0x061b3a, 0.99)
        .setStrokeStyle(selected ? 3 : 2, accent, 1));
      this.addNodeObject(this.add.rectangle(pos.x - node.width / 2 + 7, pos.y, 4, node.height - 8, accent, 1));
      const displayTitle = zone?.name || node.title;
      this.addNodeObject(this.add.text(pos.x + 2, pos.y - 7, displayTitle, TEXT_STYLE(10, cleared ? 0xbaffca : THEME.WHITE, { fontStyle: 'bold', align: 'center' })).setOrigin(0.5));
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
    const homeActive = !getMeta().activeIslandId;
    if (homeActive) {
      const homeHit = this.addNodeObject(this.add.rectangle(HOME_NODE.x, HOME_NODE.y, 144, 48, 0xffffff, 0.001).setInteractive({ useHandCursor: true }));
      homeHit.on('pointerdown', () => this.selectArea('home'));
      homeHit.on('pointerover', () => homePlate.setStrokeStyle(3, THEME.GOLD, 1));
      homeHit.on('pointerout', () => homePlate.setStrokeStyle(this.selectedId === 'home' ? 3 : 2, this.selectedId === 'home' ? THEME.GOLD : 0xffd16d, 1));
    } else { this.addNodeObject(this.add.text(HOME_NODE.x, HOME_NODE.y + 22, 'LOCKED · FINISH ISLAND', TEXT_STYLE(7, THEME.GRAY, { align: 'center' })).setOrigin(0.5)); }

    const footer = getMeta().activeIslandId ? 'ISLAND COMMITMENT  ·  BEAT THE BOSS TO LEAVE  ·  ESC TO TITLE' : 'CLICK ANY PART OF A REGION  ·  ENTER TO TRAVEL  ·  ESC TO TITLE';
    this.addNodeObject(this.add.text(25, 579, footer, TEXT_STYLE(9, 0xf0f4ff, { backgroundColor: '#071a38', padding: { x: 6, y: 4 } })).setOrigin(0, 0.5));
  }

  private paintDetails(): void {
    this.clearUi(this.detailUi);
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.detailUi.push(object); return object; };
    const x = 808, contentW = 308;
    const meta = getMeta();
    const run = getRun();
    const zone = resolveWorldZone(this.selectedId);
    const isTower = this.selectedId === 'tower';
    const isHome = this.selectedId === 'home';
    const cleared = !!zone && run.results[zone.bossId] === 'win';
    const due = isTournamentDue();
    const committed = !!meta.activeIslandId;

    add(this.add.text(x, 66, 'AREA INTEL', TEXT_STYLE(10, THEME.GOLD, { fontStyle: 'bold' })));
    add(this.add.rectangle(964, 84, 306, 1, 0x34699d, 1));

    const title = isHome ? 'HOME BASE' : isTower ? 'BATTLE TOWER' : zone?.name || 'COASTAL CIRCUIT';
    add(this.add.text(x, 95, title, TEXT_STYLE(17, THEME.WHITE, { fontStyle: 'bold', wordWrap: { width: contentW } })));

    const status = isHome ? (committed ? 'LOCKED  ·  FINISH ISLAND' : 'YOUR HEADQUARTERS') : isTower ? (committed ? 'LOCKED  ·  FINISH ISLAND' : 'ALWAYS OPEN') : cleared ? 'ISLAND CLEARED  ·  CLOSED' : committed ? 'ISLAND IN PROGRESS  ·  BOSS AWAITS' : due ? 'CLOSED  ·  TOURNAMENT DAY' : `REALM ${String(ZONES.findIndex((z) => z.id === zone!.id) + 1).padStart(2, '0')}  ·  AVAILABLE`;
    const statusColor = committed ? (zone?.id === meta.activeIslandId ? THEME.GREEN : THEME.RED) : isHome ? 0xffd16d : isTower ? THEME.BLUE : cleared ? THEME.GREEN : due ? THEME.RED : THEME.GOLD;
    add(this.add.rectangle(964, 126, 306, 24, cleared ? 0x10452e : 0x0d2d52, 1).setStrokeStyle(1, statusColor, 1));
    add(this.add.text(964, 126, status, TEXT_STYLE(9, statusColor, { fontStyle: 'bold' })).setOrigin(0.5));

    let description = '';
    if (isHome) description = committed ? 'Home Base is unavailable while you are committed to an island. Beat its boss to return here.' : 'Your headquarters between trips. Manage your active lineup, inspect recruits, and spend credits on permanent upgrades.';
    else if (isTower) description = committed ? 'The Tower must wait. Finish the island boss before leaving this circuit.' : 'The year-end gauntlet. Entering before the countdown ends fast-forwards the remaining days. Once it starts, the realms are closed for the year.';
    else description = (zone?.description || '') + (zone && meta.activeIslandId === zone.id ? ' You are committed to this island until its boss is defeated. If the calendar runs out, you can finish this island before entering the Tower.' : '');
    add(this.add.text(x, 148, description, TEXT_STYLE(11, 0xd7e5f7, { wordWrap: { width: contentW }, lineSpacing: 3 } )).setOrigin(0, 0));
    add(this.add.rectangle(964, 218, 306, 1, 0x34699d, 1));

    if (zone) {
      const index = ZONES.findIndex((z) => z.id === zone.id);
      const teams = [...zone.opponents, zone.bossId].map(teamById);
      const opponentOvr = Math.round(teams.reduce((sum: number, team: Team) => sum + averageOverall(team.players), 0) / Math.max(1, teams.length));
      const difficulty = [25, 49, 76, 96][index] || 25;
      const difficultyName = ['STARTER-FRIENDLY', 'CHALLENGING', 'ELITE', 'EXTREME'][index] || 'CHALLENGING';
      add(this.add.text(x, 235, 'REALM DIFFICULTY', TEXT_STYLE(9, THEME.GOLD, { fontStyle: 'bold' })));
      add(this.add.text(GAME_WIDTH - 32, 235, `TIER ${index + 1} / 4`, TEXT_STYLE(9, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(1, 0));
      add(this.add.rectangle(964, 255, 306, 12, 0x0b2a4b, 1).setStrokeStyle(1, 0x34699d, 1));
      add(this.add.rectangle(811 + (306 * difficulty / 100) / 2, 255, 306 * difficulty / 100, 8, zone.id === 'coastal' ? 0x58db8b : zone.id === 'haunted' ? 0x79d4bb : zone.id === 'summit' ? 0x7fc5ff : 0xb59afa, 1));
      add(this.add.text(x, 270, difficultyName, TEXT_STYLE(9, 0xd7e5f7)));
      add(this.add.rectangle(964, 300, 306, 44, 0x092444, 1).setStrokeStyle(1, 0x34699d, 1));
      add(this.add.text(825, 286, 'OPPONENT OVERALL', TEXT_STYLE(9, THEME.BLUE, { fontStyle: 'bold' })));
      add(this.add.text(1100, 301, String(opponentOvr), TEXT_STYLE(23, THEME.GOLD, { fontStyle: 'bold' })).setOrigin(1, 0.5));
      add(this.add.text(825, 316, 'Average roster rating across the realm', TEXT_STYLE(8, THEME.GRAY)));

      const teamOvr = averageOverall(run.userTeam.players);
      add(this.add.rectangle(964, 355, 306, 40, 0x092444, 1).setStrokeStyle(1, THEME.GREEN, 1));
      add(this.add.text(825, 345, 'YOUR TEAM OVERALL', TEXT_STYLE(9, THEME.GREEN, { fontStyle: 'bold' })));
      add(this.add.text(1100, 356, String(teamOvr), TEXT_STYLE(21, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(1, 0.5));
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

    add(this.add.rectangle(964, zone ? 382 : 367, 306, 1, 0x34699d, 1));
    add(this.add.text(x, zone ? 388 : 380, 'YOUR STARTER', TEXT_STYLE(9, THEME.GOLD, { fontStyle: 'bold' })));

    const starterId = meta.starter as StarterId | null;
    if (starterId && STARTER_EVOLUTIONS[starterId]) {
      const xp = meta.starterXp[starterId] || 0;
      const evolutions = STARTER_EVOLUTIONS[starterId];
      const current = [...evolutions].reverse().find((evo) => xp >= evo.at) || evolutions[0];
      const starterY = zone ? 434 : 428;
      add(this.add.rectangle(964, starterY, 306, 66, 0x092444, 1).setStrokeStyle(1, 0x34699d, 1));
      add(this.add.image(848, starterY, `pkm-${current.sprite}`).setDisplaySize(54, 54));
      add(this.add.text(889, starterY - 17, current.name.toUpperCase(), TEXT_STYLE(13, THEME.WHITE, { fontStyle: 'bold' })));
      add(this.add.text(889, starterY + 4, `${xp} XP  ·  ${xp >= 100 ? 'FINAL EVOLUTION' : `NEXT FORM AT ${evolutions.find((e) => e.at > xp)?.at ?? 100} XP`}`, TEXT_STYLE(9, THEME.GREEN)));
      add(this.add.text(889, starterY + 23, 'YOUR CAMPAIGN PARTNER', TEXT_STYLE(8, THEME.GRAY)));
    } else {
      const starterY = zone ? 434 : 428;
      add(this.add.rectangle(964, starterY, 306, 66, 0x092444, 1).setStrokeStyle(1, 0x34699d, 1));
      const starters = [246, 443, 371];
      starters.forEach((sprite, i) => add(this.add.image(870 + i * 92, starterY - 5, `pkm-${sprite}`).setDisplaySize(38, 38)));
      add(this.add.text(964, starterY + 23, 'CHOOSE YOUR STARTER TO BEGIN', TEXT_STYLE(8, THEME.GRAY)).setOrigin(0.5));
    }

    // Team management stays available even while island travel is locked.
    // The lock prevents leaving the island; it should never prevent lineup planning.
    if (zone) {
      const isActive = meta.activeIslandId === zone.id;
      const canEnter = isActive || (!meta.activeIslandId && !due && !cleared);
      add(new TextButton(this, 964, 488, 'MANAGE TEAM', {
        color: THEME.GREEN, minWidth: 284,
        onSelect: () => this.scene.start('LineupScene', { returnTo: 'ZoneSelectScene' }),
      }));
      add(new TextButton(this, 964, 532, cleared ? 'ISLAND CLEARED' : isActive ? 'CONTINUE ISLAND' : due ? 'REALMS CLOSED TODAY' : meta.activeIslandId ? 'FINISH CURRENT ISLAND FIRST' : 'ENTER REALM', {
        color: cleared ? THEME.GREEN : canEnter ? THEME.GOLD : THEME.GRAY,
        minWidth: 284,
        onSelect: canEnter ? () => this.enter(zone.id) : undefined,
      }));
    } else if (isTower) {
      add(new TextButton(this, 964, 488, 'MANAGE TEAM', {
        color: THEME.GREEN, minWidth: 284,
        onSelect: () => this.scene.start('LineupScene', { returnTo: 'ZoneSelectScene' }),
      }));
      add(new TextButton(this, 964, 532, 'ENTER BATTLE TOWER', { color: THEME.GOLD, minWidth: 284, onSelect: () => this.enterTower() }));
    } else {
      const manage = new TextButton(this, 888, 490, committed ? 'ISLAND LOCKED' : 'MANAGE TEAM', { color: committed ? THEME.GRAY : THEME.GREEN, minWidth: 146, onSelect: committed ? undefined : () => this.scene.start('LineupScene', { returnTo: 'ZoneSelectScene' }) });
      const store = new TextButton(this, 1040, 490, committed ? 'ISLAND LOCKED' : 'ITEM SHOP', { color: committed ? THEME.GRAY : THEME.GOLD, minWidth: 146, onSelect: committed ? undefined : () => this.scene.start('StoreScene', { returnTo: 'ZoneSelectScene' }) });
      add(manage); add(store);
    }

    const footerHint = committed
      ? 'L  MANAGE TEAM  ·  ENTER  CONTINUE ISLAND'
      : '1–4 SELECT REALMS  ·  L TEAM  ·  T TOWER  ·  H HOME';
    add(this.add.text(964, 568, footerHint, TEXT_STYLE(8, committed ? THEME.GREEN : THEME.GRAY)).setOrigin(0.5));
  }

  private selectArea(id: AreaId): void {
    const activeIslandId = getMeta().activeIslandId;
    if (activeIslandId && id !== activeIslandId) return;
    if (id !== 'tower' && id !== 'home') {
      const zone = resolveWorldZone(id);
      if (!zone || (isTournamentDue() && activeIslandId !== id) || getRun().results[zone.bossId] === 'win') return;
      updateMeta({ selectedZoneId: id });
    }
    this.selectedId = id;
    this.paintMapNodes();
    this.paintDetails();
  }

  private activateSelection(): void {
    if (this.selectedId === 'home') { this.scene.start('LineupScene'); return; }
    if (this.selectedId === 'tower') { this.enterTower(); return; }
    const zone = resolveWorldZone(this.selectedId);
    if (zone) this.enter(zone.id);
  }

  private enterTower(): void {
    if (getMeta().activeIslandId) return;
    if (isTournamentDue()) { this.scene.start('BattleTowerScene'); return; }
    this.towerDialog?.destroy();
    this.towerDialog = new ConfirmDialog(this, 'ENTER THE BATTLE TOWER?', 'This will fast-forward the remaining days and begin the year-end tournament. You cannot return to the islands once it starts.', 'FAST-FORWARD', () => {
      this.towerDialog?.destroy(); this.towerDialog = null;
      updateMeta({ daysRemaining: 0 });
      this.scene.start('BattleTowerScene');
    }, () => { this.towerDialog?.destroy(); this.towerDialog = null; });
  }

  private enter(id: string): void {
    const meta = getMeta();
    if (meta.activeIslandId && meta.activeIslandId !== id) return;
    if (isTournamentDue() && meta.activeIslandId !== id) return;
    const zoneCheck = resolveWorldZone(id);
    if (!zoneCheck || getRun().results[zoneCheck.bossId] === 'win') return;
    const alreadyCommitted = meta.activeIslandId === id;
    const zone = resolveWorldZone(id)!;
    let firstEverEntry = false;
    if (alreadyCommitted) firstEverEntry = markZoneEntered(id);
    const year = getMeta().seasonYear;
    const yearFlag = `story-year-${year}-island-${id}`;
    const abyssFlag = 'story-ever-entered-abyss';

    if (!alreadyCommitted) {
      updateMeta({ selectedZoneId: id });
      const remaining = spendDays(TIME_COSTS.islandVisit);
      if (remaining <= 0) { this.scene.start('ZoneSelectScene'); return; }
      updateMeta({ activeIslandId: id, selectedZoneId: id });
      firstEverEntry = markZoneEntered(id);
    }

    // The Abyss gets one save-wide first-visit scene, not just a yearly intro.
    // The yearly intro flag is committed with it so both beats stay in sync.
    const current = getMeta();
    if (id === 'abyss' && !current.flags.includes(abyssFlag) && (firstEverEntry || (alreadyCommitted && !current.flags.includes(yearFlag)))) {
      this.scene.start('DialogueScene', { nextScene: 'OpponentSelectScene', lines: abyssFirstVisit(), flags: [abyssFlag, yearFlag] });
      return;
    }
    if (!current.flags.includes(yearFlag)) {
      this.scene.start('DialogueScene', { nextScene: 'OpponentSelectScene', lines: islandOpening(zone.name, year), flag: yearFlag });
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
