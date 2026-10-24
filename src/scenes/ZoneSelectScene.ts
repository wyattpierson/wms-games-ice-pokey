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
const MAP_SOURCE_W = 1491;
const MAP_SOURCE_H = 1055;
const MAP_SX = MAP_W / MAP_SOURCE_W;
const MAP_SY = MAP_H / MAP_SOURCE_H;

type AreaId = string;
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
  // Label anchors use the same source-image coordinates as the island outlines.
  { id: 'coastal', sourceX: 335, sourceY: 160, width: 164, height: 45, title: 'COASTAL CIRCUIT', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 01  ·  OPEN', accent: 0x56df91, isZone: true },
  { id: 'haunted', sourceX: 1110, sourceY: 110, width: 160, height: 44, title: 'HAUNTED RINKS', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 02  ·  OPEN', accent: 0x80e3a3, isZone: true },
  { id: 'summit', sourceX: 1210, sourceY: 635, width: 158, height: 44, title: 'SUMMIT LEAGUE', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 03  ·  OPEN', accent: 0x85c9ff, isZone: true },
  { id: 'abyss', sourceX: 310, sourceY: 635, width: 150, height: 44, title: 'THE ABYSS', subtitle: (c, due) => c ? 'CLEARED  ·  CLOSED' : due ? 'CLOSED  ·  TOWER DAY' : 'REALM 04  ·  OPEN', accent: 0xc5a1ff, isZone: true },
  { id: 'tower', sourceX: 745, sourceY: 597, width: 172, height: 46, title: 'BATTLE TOWER', subtitle: (_c, due) => due ? 'TOURNAMENT DAY  ·  ENTER' : 'ALWAYS OPEN  ·  FAST-FORWARD', accent: 0x7fdcff },
];

const TEXT_STYLE = (size: number, color: number, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) => ({
  fontFamily: FONT, fontSize: `${size}px`, color: hex(color), ...extra,
});

/**
 * A 16-bit Pokémon-style archipelago. The artwork is the map itself; Phaser
 * draws all status, selection, and area details dynamically so save data drives
 * the visuals. Island outlines and labels share the artwork coordinate system.
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
    if (!ZONES.some((z) => z.id === this.selectedId) && this.selectedId !== 'tower') {
      this.selectedId = 'coastal';
    }

    this.cameras.main.setBackgroundColor(0x061631);

    // The illustration contains terrain only; labels and feedback are live UI.
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

    // Single-pixel framing keeps the live panel as crisp as the map art.
    this.add.rectangle(964, 323, 338, 550, 0x081a30).setStrokeStyle(1, 0x426281);
    this.add.rectangle(964, 50, 336, 3, THEME.GOLD);

    this.paintMapNodes();
    this.paintDetails();

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { this.scene.start('TitleScene'); return; }
      if (/^Digit[1-4]$/.test(e.code)) { this.selectArea(ZONES[Number(e.code.slice(-1)) - 1].id); return; }
      if (e.code === 'Enter' || e.code === 'Space') { this.activateSelection(); return; }
      if (e.code === 'KeyT') { if (!getMeta().activeIslandId) this.enterTower(); return; }
      if (e.code === 'KeyL') { this.scene.start('LineupScene', { returnTo: 'ZoneSelectScene' }); return; }
      if (e.code === 'KeyS') { this.scene.start('StoreScene', { returnTo: 'ZoneSelectScene' }); return; }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
  }

  private pointFromSource(x: number, y: number): { x: number; y: number } {
    return { x: MAP_X + x * MAP_SX, y: MAP_Y + y * MAP_SY };
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
      { id: 'coastal', points: [[97, 205], [111, 176], [168, 135], [223, 111], [263, 111], [267, 75], [309, 41], [373, 27], [414, 32], [441, 76], [481, 78], [506, 122], [540, 142], [559, 171], [551, 207], [540, 232], [572, 257], [576, 280], [550, 323], [505, 342], [467, 377], [451, 416], [414, 438], [342, 444], [299, 420], [276, 379], [235, 351], [199, 327], [194, 291], [143, 278], [111, 250]] },
      { id: 'haunted', points: [[841, 179], [878, 147], [901, 117], [924, 130], [966, 75], [988, 94], [1015, 65], [1047, 23], [1062, 66], [1126, 20], [1150, 63], [1211, 17], [1260, 81], [1292, 86], [1316, 45], [1332, 91], [1356, 103], [1348, 143], [1369, 154], [1356, 187], [1315, 212], [1324, 267], [1312, 306], [1272, 343], [1235, 346], [1189, 376], [1149, 393], [1100, 392], [1080, 386], [1055, 401], [1022, 383], [989, 359], [965, 365], [933, 359], [921, 329], [922, 316], [886, 299], [866, 277], [863, 255], [883, 228], [863, 208]] },
      { id: 'summit', points: [[938, 803], [981, 777], [980, 746], [1003, 724], [978, 703], [980, 662], [1017, 631], [1045, 605], [1059, 557], [1100, 519], [1125, 530], [1159, 487], [1208, 526], [1232, 538], [1251, 520], [1290, 568], [1312, 552], [1353, 588], [1376, 605], [1414, 631], [1430, 662], [1460, 680], [1453, 701], [1427, 723], [1442, 755], [1428, 780], [1453, 791], [1453, 823], [1417, 847], [1426, 872], [1390, 899], [1420, 930], [1417, 965], [1375, 1008], [1322, 1035], [1260, 1016], [1211, 984], [1191, 958], [1163, 946], [1143, 982], [1110, 998], [1070, 984], [1062, 945], [1039, 922], [999, 902], [987, 872], [961, 852], [939, 839]] },
      { id: 'abyss', points: [[65, 668], [100, 639], [128, 610], [151, 630], [179, 575], [203, 611], [235, 598], [271, 609], [308, 577], [337, 587], [348, 544], [374, 582], [392, 562], [425, 605], [458, 577], [491, 610], [513, 647], [548, 644], [558, 668], [584, 676], [601, 715], [595, 753], [559, 784], [542, 786], [542, 854], [578, 875], [595, 906], [589, 942], [554, 961], [540, 979], [508, 954], [465, 938], [425, 916], [399, 873], [380, 882], [359, 834], [342, 850], [320, 907], [272, 938], [234, 925], [201, 935], [170, 911], [147, 889], [142, 845], [118, 810], [118, 764], [83, 753], [67, 721]] },
      { id: 'tower', points: [[499, 487], [525, 459], [571, 433], [590, 391], [626, 389], [663, 369], [698, 373], [723, 377], [744, 342], [763, 371], [803, 376], [830, 366], [864, 387], [884, 425], [920, 441], [946, 472], [957, 511], [944, 530], [958, 554], [947, 578], [914, 585], [906, 617], [867, 644], [854, 672], [822, 676], [794, 663], [765, 684], [734, 681], [702, 689], [671, 669], [637, 651], [613, 635], [611, 595], [566, 584], [541, 563], [538, 532], [507, 517]] },
    ];
    const highlights = new Map<AreaId, (hovered: boolean) => void>();
    islandShapes.forEach((area) => {
      const zoneDefinition = resolveWorldZone(area.id);
      const cleared = !!zoneDefinition && run.results[zoneDefinition.bossId] === 'win';
      const activeIslandId = getMeta().activeIslandId;
      const selectable = zoneDefinition
        ? (activeIslandId ? activeIslandId === area.id : !cleared && !tournamentDue)
        : !activeIslandId && area.id === 'tower';
      const outline = this.addNodeObject(this.add.graphics());
      const points = area.points.map(([x, y]) => new Phaser.Geom.Point(MAP_X + x * MAP_SX, MAP_Y + y * MAP_SY));
      const highlight = (hovered: boolean) => {
        outline.clear();
        const selected = this.selectedId === area.id;
        if (!hovered && !selected) return;
        const color = hovered ? 0xe4faff : THEME.GOLD;
        outline.fillStyle(color, hovered ? 0.16 : 0.045);
        outline.fillPoints(points, true);
        outline.lineStyle(hovered ? 7 : 5, color, 0.16);
        outline.strokePoints(points, true);
        outline.lineStyle(hovered ? 2 : 1, color, hovered ? 1 : 0.7);
        outline.strokePoints(points, true);
      };
      highlights.set(area.id, highlight);
      highlight(false);
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
      hit.on('pointerover', () => highlight(true));
      hit.on('pointerout', () => highlight(false));
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
        hit.on('pointerover', () => { panel.setStrokeStyle(3, THEME.GOLD, 1); highlights.get(node.id)?.(true); });
        hit.on('pointerout', () => { panel.setStrokeStyle(this.selectedId === node.id ? 3 : 2, this.selectedId === node.id ? THEME.GOLD : accent, 1); highlights.get(node.id)?.(false); });
      }
    });

    const footer = getMeta().activeIslandId ? 'ISLAND COMMITMENT  ·  BEAT THE BOSS TO LEAVE  ·  ESC TO TITLE' : 'CLICK ANY PART OF A REGION  ·  ENTER TO TRAVEL  ·  ESC TO TITLE';
    this.addNodeObject(this.add.text(25, 579, footer, TEXT_STYLE(9, 0xf0f4ff, { backgroundColor: '#071a38', padding: { x: 6, y: 4 } })).setOrigin(0, 0.5));
  }

  private paintDetails(): void {
    this.clearUi(this.detailUi);
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.detailUi.push(object); return object; };
    const x = 814, right = 1114, center = 964;
    const text = (px: number, y: number, label: string, size = 11, color = THEME.GRAY, bold = false) =>
      add(this.add.text(px, y, label, TEXT_STYLE(size, color, { fontStyle: bold ? 'bold' : 'normal' })));
    const rule = (y: number) => add(this.add.rectangle(center, y, 300, 1, 0x29435e));
    const meta = getMeta();
    const run = getRun();
    const zone = resolveWorldZone(this.selectedId);
    const isTower = this.selectedId === 'tower';
    const cleared = !!zone && run.results[zone.bossId] === 'win';
    const due = isTournamentDue();
    const isActive = !!zone && meta.activeIslandId === zone.id;
    const canEnter = isTower ? !meta.activeIslandId : isActive || (!meta.activeIslandId && !due && !cleared);
    const accent = REGION_NODES.find((node) => node.id === this.selectedId)?.accent || THEME.BLUE;
    const index = ZONES.findIndex((z) => z.id === zone?.id);

    text(x, 68, isTower ? 'YEAR-END TOURNAMENT' : `REALM ${String(index + 1).padStart(2, '0')} / 04`, 10, accent, true);
    text(right, 68, isTower ? '[T]' : `[${index + 1}]`, 10, THEME.GRAY).setOrigin(1, 0);
    text(x, 91, isTower ? 'BATTLE TOWER' : zone?.name || 'COASTAL CIRCUIT', 20, THEME.WHITE, true);
    const status = cleared ? 'CLEARED' : isActive ? 'IN PROGRESS' : !canEnter ? 'TRAVEL LOCKED' : due && isTower ? 'TOURNAMENT DAY' : 'OPEN TO TRAVEL';
    const statusColor = cleared || isActive ? THEME.GREEN : canEnter ? accent : THEME.GRAY;
    add(this.add.rectangle(x + 3, 130, 6, 6, statusColor));
    text(x + 14, 123, status, 10, statusColor, true);
    rule(146);
    const description = isTower
      ? 'The year-end gauntlet. Face the toughest teams and climb the tower.'
      : zone?.description || '';
    text(x, 162, description, 12, 0xd7e5f7).setWordWrapWidth(300).setLineSpacing(4);

    text(x, 235, isTower ? 'TOURNAMENT DIFFICULTY' : 'REALM DIFFICULTY', 10, THEME.GRAY, true);
    const tier = isTower ? 4 : index + 1;
    for (let i = 0; i < 4; i++) {
      add(this.add.rectangle(x + 35 + i * 77, 262, 70, 6, i < tier ? accent : 0x263b50));
    }
    text(x, 277, isTower ? 'EXTREME' : ['STARTER-FRIENDLY', 'CHALLENGING', 'ELITE', 'EXTREME'][index], 10, accent, true);

    const teams = zone ? [...zone.opponents, zone.bossId].map(teamById) : [];
    const opponentOvr = teams.length ? Math.round(teams.reduce((sum: number, team: Team) => sum + averageOverall(team.players), 0) / teams.length) : 97;
    [[x + 72, 'YOUR TEAM', String(averageOverall(run.userTeam.players)), THEME.GREEN],
      [right - 72, zone ? 'OPPONENT AVG' : 'AI DIFFICULTY', `${opponentOvr}${zone ? '' : '%'}`, accent]].forEach(([cx, label, value, color]) => {
      add(this.add.rectangle(Number(cx), 331, 144, 62, 0x102840).setStrokeStyle(1, 0x29435e));
      text(Number(cx), 310, String(label), 10, Number(color), true).setOrigin(0.5, 0);
      text(Number(cx), 328, String(value), 25, THEME.WHITE, true).setOrigin(0.5, 0);
    });

    const starterId = meta.starter as StarterId | null;
    if (starterId && STARTER_EVOLUTIONS[starterId]) {
      const xp = meta.starterXp[starterId] || 0;
      const evolutions = STARTER_EVOLUTIONS[starterId];
      const current = [...evolutions].reverse().find((evo) => xp >= evo.at) || evolutions[0];
      add(this.add.image(x + 24, 401, `pkm-${current.sprite}`).setDisplaySize(48, 48));
      text(x + 58, 376, 'CAMPAIGN PARTNER', 9, THEME.GRAY, true);
      text(x + 58, 391, current.name.toUpperCase(), 13, THEME.WHITE, true);
      const next = evolutions.find((evo) => evo.at > xp);
      text(x + 58, 411, `${xp} XP  /  ${next ? `NEXT FORM ${next.at} XP` : 'FINAL EVOLUTION'}`, 10, THEME.GREEN);
    } else {
      text(x, 389, 'Choose a starter to begin your journey.', 11, THEME.GRAY).setWordWrapWidth(300);
    }
    rule(439);
    text(x, 452, 'TEAM SERVICES', 10, THEME.GRAY, true);
    text(right, 452, `${meta.currency} CR`, 11, THEME.GOLD, true).setOrigin(1, 0);
    add(new TextButton(this, 888, 488, 'MANAGE TEAM [L]', { size: 11, color: THEME.GREEN, minWidth: 148,
      onSelect: () => this.scene.start('LineupScene', { returnTo: 'ZoneSelectScene' }) }));
    add(new TextButton(this, 1042, 488, 'ITEM SHOP [S]', { size: 11, color: THEME.BLUE, minWidth: 144,
      onSelect: () => this.scene.start('StoreScene', { returnTo: 'ZoneSelectScene' }) }));
    const action = cleared ? 'ISLAND CLEARED' : isActive ? 'CONTINUE ISLAND' : !canEnter ? 'TRAVEL LOCKED' : isTower ? 'ENTER BATTLE TOWER' : 'ENTER REALM';
    add(new TextButton(this, center, 532, action, { size: 14, color: canEnter ? THEME.GOLD : THEME.GRAY, minWidth: 300,
      onSelect: canEnter ? () => this.activateSelection() : undefined }));
    const hint = meta.activeIslandId ? 'Beat the island boss to travel onward.' : isTower && !due ? 'Entry skips the remaining calendar days.' : due ? 'The realms reopen next year.' : '1–4 SELECT  ·  ENTER TRAVEL  ·  T TOWER';
    text(center, 566, hint, 10, THEME.GRAY).setOrigin(0.5, 0);
  }

  private selectArea(id: AreaId): void {
    const activeIslandId = getMeta().activeIslandId;
    if (activeIslandId && id !== activeIslandId) return;
    if (id !== 'tower') {
      const zone = resolveWorldZone(id);
      if (!zone || (isTournamentDue() && activeIslandId !== id) || getRun().results[zone.bossId] === 'win') return;
      updateMeta({ selectedZoneId: id });
    }
    this.selectedId = id;
    this.paintMapNodes();
    this.paintDetails();
  }

  private activateSelection(): void {
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
