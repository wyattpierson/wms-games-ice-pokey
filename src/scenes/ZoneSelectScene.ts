import { isZoneAvailable } from '../core/worldState';
import { arceusAvailable, summitCursed } from '../core/storyCampaign';
import { pendingStory, coachAdvice } from '../config/story';
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { STARTER_EVOLUTIONS, ZONES, TIME_COSTS, TOWER_STAGES, zoneThreatLevel } from '../config/progression';
import { zoneDifficultyBand } from '../config/zoneDifficulty';
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
  accent: number;
  isZone?: boolean;
}

const REGION_NODES: MapNode[] = [
  { id: 'coastal', sourceX: 335, sourceY: 160, width: 190, height: 66, title: 'COASTAL CIRCUIT', accent: 0x56df91, isZone: true },
  { id: 'summit', sourceX: 1110, sourceY: 110, width: 190, height: 66, title: 'SUMMIT LEAGUE', accent: 0x85c9ff, isZone: true },
  { id: 'haunted', sourceX: 1210, sourceY: 635, width: 190, height: 66, title: 'HAUNTED RINKS', accent: 0xbda4ef, isZone: true },
  { id: 'abyss', sourceX: 310, sourceY: 635, width: 190, height: 66, title: 'THE ABYSS', accent: 0xc5a1ff, isZone: true },
  { id: 'tower', sourceX: 745, sourceY: 597, width: 190, height: 66, title: 'BATTLE TOWER', accent: 0xef6b73 },
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
    const beat = pendingStory();
    if (beat) { this.scene.start('DialogueScene', { nextScene: 'ZoneSelectScene', lines: beat.lines, flag: beat.flag }); return; }
    let meta = getMeta();
    if (meta.daysRemaining <= 0) { this.scene.start('BattleTowerScene'); return; }
    if (meta.activeIslandId && !isZoneAvailable(meta.activeIslandId)) meta = updateMeta({ activeIslandId: null, selectedZoneId: 'summit' });
    // Backward compatibility: older saves don't have activeIslandId. If the current
    // year's island intro flag exists and its boss is still unbeaten, treat it as active.
    if (!meta.activeIslandId) {
      const enteredThisYear = ZONES.find((baseZone) => {
        const zone = resolveWorldZone(baseZone.id) || baseZone;
        return isZoneAvailable(zone.id) && meta.flags.includes(`story-year-${meta.seasonYear}-island-${zone.id}`) && getRun().results[zone.bossId] !== 'win';
      });
      if (enteredThisYear) meta = updateMeta({ activeIslandId: enteredThisYear.id, selectedZoneId: enteredThisYear.id });
    }
    this.selectedId = meta.activeIslandId || meta.selectedZoneId || 'coastal';
    if (!ZONES.some((z) => z.id === this.selectedId) && this.selectedId !== 'tower') {
      this.selectedId = 'coastal';
    }

    if (!isZoneAvailable(this.selectedId)) this.selectedId = 'summit';
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
      { id: 'summit', points: [[841, 179], [878, 147], [901, 117], [924, 130], [966, 75], [988, 94], [1015, 65], [1047, 23], [1062, 66], [1126, 20], [1150, 63], [1211, 17], [1260, 81], [1292, 86], [1316, 45], [1332, 91], [1356, 103], [1348, 143], [1369, 154], [1356, 187], [1315, 212], [1324, 267], [1312, 306], [1272, 343], [1235, 346], [1189, 376], [1149, 393], [1100, 392], [1080, 386], [1055, 401], [1022, 383], [989, 359], [965, 365], [933, 359], [921, 329], [922, 316], [886, 299], [866, 277], [863, 255], [883, 228], [863, 208]] },
      { id: 'haunted', points: [[938, 803], [981, 777], [980, 746], [1003, 724], [978, 703], [980, 662], [1017, 631], [1045, 605], [1059, 557], [1100, 519], [1125, 530], [1159, 487], [1208, 526], [1232, 538], [1251, 520], [1290, 568], [1312, 552], [1353, 588], [1376, 605], [1414, 631], [1430, 662], [1460, 680], [1453, 701], [1427, 723], [1442, 755], [1428, 780], [1453, 791], [1453, 823], [1417, 847], [1426, 872], [1390, 899], [1420, 930], [1417, 965], [1375, 1008], [1322, 1035], [1260, 1016], [1211, 984], [1191, 958], [1163, 946], [1143, 982], [1110, 998], [1070, 984], [1062, 945], [1039, 922], [999, 902], [987, 872], [961, 852], [939, 839]] },
      { id: 'abyss', points: [[65, 668], [100, 639], [128, 610], [151, 630], [179, 575], [203, 611], [235, 598], [271, 609], [308, 577], [337, 587], [348, 544], [374, 582], [392, 562], [425, 605], [458, 577], [491, 610], [513, 647], [548, 644], [558, 668], [584, 676], [601, 715], [595, 753], [559, 784], [542, 786], [542, 854], [578, 875], [595, 906], [589, 942], [554, 961], [540, 979], [508, 954], [465, 938], [425, 916], [399, 873], [380, 882], [359, 834], [342, 850], [320, 907], [272, 938], [234, 925], [201, 935], [170, 911], [147, 889], [142, 845], [118, 810], [118, 764], [83, 753], [67, 721]] },
      { id: 'tower', points: [[499, 487], [525, 459], [571, 433], [590, 391], [626, 389], [663, 369], [698, 373], [723, 377], [744, 285], [763, 371], [803, 376], [830, 366], [864, 387], [884, 425], [920, 441], [946, 472], [957, 511], [944, 530], [958, 554], [947, 578], [914, 585], [906, 617], [867, 644], [854, 672], [822, 676], [794, 663], [765, 684], [734, 681], [702, 689], [671, 669], [637, 651], [613, 635], [611, 595], [566, 584], [541, 563], [538, 532], [507, 517]] },
    ];
    const highlights = new Map<AreaId, (hovered: boolean) => void>();
    islandShapes.forEach((area) => {
      const points = area.points.map(([x, y]) => new Phaser.Geom.Point(MAP_X + x * MAP_SX, MAP_Y + y * MAP_SY));
      if (!isZoneAvailable(area.id)) {
        const sea = this.addNodeObject(this.add.graphics());
        const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
        const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        const rim = points.map(p => new Phaser.Geom.Point(centerX + (p.x - centerX) * 1.10, centerY + (p.y - centerY) * 1.10));
        sea.fillStyle(0x07527a, 1).fillPoints(rim, true);
        sea.fillStyle(0x073557, 1).fillPoints(points, true);
        const water = new Phaser.Geom.Polygon(points);
        for (let y = centerY - 130; y < centerY + 130; y += 14) {
          for (let x = centerX - 170; x < centerX + 170; x += 24) {
            if (Phaser.Geom.Polygon.Contains(water, x, y) && Phaser.Geom.Polygon.Contains(water, x + 12, y)) {
              sea.fillStyle(0x13729a, .25 + .15 * Math.sin(x + y)).fillRect(x, y, 12, 2);
            }
          }
        }
        sea.lineStyle(2, 0x33a5bb, .4).strokeEllipse(centerX, centerY, 120, 52);
        sea.lineStyle(1, 0x33a5bb, .25).strokeEllipse(centerX, centerY, 180, 92);
        this.addNodeObject(this.add.text(centerX, centerY, 'COASTAL CIRCUIT\nLOST TO THE TOWER', TEXT_STYLE(10, 0x93c6d8, { align: 'center', backgroundColor: '#073557', padding: { x: 8, y: 6 } })).setOrigin(.5));
        return;
      }
      if (area.id === 'summit' && summitCursed(getMeta().story)) {
        this.addNodeObject(this.add.graphics()).fillStyle(0x9c134f, .45).fillPoints(points, true);
      }
      // Keep terrain legible while the later realms grow colder and darker.
      if (area.id === 'haunted' || area.id === 'abyss') {
        const atmosphere = this.addNodeObject(this.add.graphics());
        atmosphere.fillStyle(area.id === 'haunted' ? 0x281b4a : 0x090c26, area.id === 'haunted' ? 0.16 : 0.24);
        atmosphere.fillPoints(points, true);
      }
      const outline = this.addNodeObject(this.add.graphics());
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

    REGION_NODES.filter(node => isZoneAvailable(node.id)).forEach((node) => {
      const pos = this.pointFromSource(node.sourceX, node.sourceY);
      const zone = node.isZone ? resolveWorldZone(node.id) : undefined;
      const cleared = !!zone && run.results[zone.bossId] === 'win';
      const activeIslandId = getMeta().activeIslandId;
      const selected = this.selectedId === node.id;
      const accent = cleared ? 0x54e58d : selected ? THEME.GOLD : node.accent;
      const order = ZONES.findIndex((z) => z.id === node.id) + 1;
      const threat = zoneDifficultyBand(zone?.difficulty ?? TOWER_STAGES[0].difficulty);
      const subtitle = activeIslandId
        ? (node.id === activeIslandId ? 'IN PROGRESS' : 'TRAVEL LOCKED')
        : cleared ? 'CLEARED' : node.id === 'tower' ? tournamentDue ? 'TOURNAMENT DAY' : 'YEAR-END CHALLENGE' : tournamentDue ? 'TOWER DAY · CLOSED' : 'OPEN TO TRAVEL';
      const panel = this.addNodeObject(this.add.rectangle(pos.x, pos.y, node.width, node.height, 0x061b3a, 0.99)
        .setStrokeStyle(selected ? 2 : 1, accent, 1));
      this.addNodeObject(this.add.rectangle(pos.x - 76, pos.y - 15, 26, 28, selected ? THEME.GOLD : node.accent));
      this.addNodeObject(this.add.text(pos.x - 76, pos.y - 15, order ? String(order) : 'T', TEXT_STYLE(21, 0x061b3a, { fontStyle: 'bold' })).setOrigin(.5));
      this.addNodeObject(this.add.text(pos.x + 13, pos.y - 20, zone?.name || node.title, TEXT_STYLE(11, THEME.WHITE, { fontStyle: 'bold' })).setOrigin(.5));
      this.addNodeObject(this.add.text(pos.x + 13, pos.y - 2, subtitle, TEXT_STYLE(8, cleared ? THEME.GREEN : THEME.GRAY)).setOrigin(.5));
      this.addNodeObject(this.add.text(pos.x - 82, pos.y + 20, threat.label, TEXT_STYLE(9, threat.color, { fontStyle: 'bold' })).setOrigin(0, .5));
      for (let i = 0; i < 5; i++) {
        this.addNodeObject(this.add.rectangle(pos.x + 23 + i * 13, pos.y + 20, 9, 6, i < threat.tier ? threat.color : 0x29435e));
      }
      const hit = this.addNodeObject(this.add.rectangle(pos.x, pos.y, node.width, node.height, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true }));
      hit.on('pointerdown', () => this.selectArea(node.id));
      hit.on('pointerover', () => { panel.setStrokeStyle(2, THEME.GOLD, 1); highlights.get(node.id)?.(true); });
      hit.on('pointerout', () => { panel.setStrokeStyle(selected ? 2 : 1, accent, 1); highlights.get(node.id)?.(false); });
    });

    this.addNodeObject(this.add.text(25, 610, 'RECOMMENDED ORDER  /  CLOCKWISE  /  FEWER BARS = EASIER', TEXT_STYLE(10, THEME.GRAY)));
    [...ZONES.filter(z => isZoneAvailable(z.id)).map((base) => resolveWorldZone(base.id) || base), { id: 'tower', name: 'BATTLE TOWER' }].forEach((zone, i) => {
      const x = 130 + i * 233;
      const active = this.selectedId === zone.id;
      const plate = this.addNodeObject(this.add.rectangle(x, 642, 218, 32, active ? 0x20364e : 0x102840).setStrokeStyle(1, active ? THEME.GOLD : 0x426281));
      this.addNodeObject(this.add.text(x, 642, `${zone.id === 'tower' ? 'T' : ZONES.findIndex(z => z.id === zone.id) + 1}  ${zone.name}`, TEXT_STYLE(12, active ? THEME.GOLD : THEME.WHITE, { fontStyle: 'bold' })).setOrigin(.5));
      plate.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.selectArea(zone.id));
    });

    if (arceusAvailable(getMeta().story, getMeta().seasonYear)) {
      this.addNodeObject(this.add.text(25, 550, '★ FACE ARCEUS · FINAL BOSS', TEXT_STYLE(15, THEME.GOLD)).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('BattleTowerScene', { finalBoss: true })));
    }
    if (!arceusAvailable(getMeta().story, getMeta().seasonYear) && coachAdvice()) this.addNodeObject(this.add.text(25, 550, coachAdvice(), TEXT_STYLE(10, THEME.GOLD)));
    const footer = getMeta().activeIslandId ? 'ISLAND COMMITMENT  ·  BEAT THE BOSS TO LEAVE  ·  ESC TO TITLE' : 'CLICK TO INSPECT  ·  ENTER TO TRAVEL  ·  ESC TO TITLE';
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

    text(x, 68, isTower ? 'YEAR-END TOURNAMENT' : `RECOMMENDED ${index + 1} / ${ZONES.length}`, 10, accent, true);
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

    const level = zone?.difficulty ?? TOWER_STAGES[0].difficulty;
    const threat = zoneDifficultyBand(level);
    const bossLevel = zone ? zoneThreatLevel(level, zone.opponents.length, true) : TOWER_STAGES[TOWER_STAGES.length - 1].difficulty;
    text(x, 231, 'AI THREAT', 10, THEME.GRAY, true);
    text(right, 231, `${Math.round(level * 100)}–${Math.round(bossLevel * 100)}%`, 11, threat.color, true).setOrigin(1, 0);
    for (let i = 0; i < 5; i++) {
      add(this.add.rectangle(x + 27 + i * 62, 253, 52, 7, i < threat.tier ? threat.color : 0x263b50));
    }
    text(x, 267, threat.label, 10, threat.color, true);
    text(right, 267, zone ? 'ENTRY → BOSS' : 'FLOOR 1 → FINAL', 9, THEME.GRAY).setOrigin(1, 0);
    const teams = zone ? [...zone.opponents, zone.bossId].map(teamById) : TOWER_STAGES.map(stage => teamById(stage.opponentId));
    const opponentOvr = Math.round(teams.reduce((sum: number, team: Team) => sum + averageOverall(team.players), 0) / teams.length);
    const ownOvr = averageOverall(run.userTeam.players);
    [[x + 72, 'YOUR TEAM', String(ownOvr), THEME.GREEN],
      [right - 72, 'OPPONENT AVG', String(opponentOvr), accent]].forEach(([cx, label, value, color]) => {
      add(this.add.rectangle(Number(cx), 319, 144, 58, 0x102840).setStrokeStyle(1, 0x29435e));
      text(Number(cx), 299, String(label), 10, Number(color), true).setOrigin(0.5, 0);
      text(Number(cx), 316, String(value), 25, THEME.WHITE, true).setOrigin(0.5, 0);
    });
    const gap = opponentOvr - ownOvr;
    text(x, 356, gap > 0 ? `Opponents average +${gap} OVR. Build your roster.` : 'Your team matches the realm’s average rating.', 10, gap > 0 ? THEME.GOLD : THEME.GREEN).setWordWrapWidth(300);

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
    text(right, 452, `${meta.currency} BP`, 11, THEME.GOLD, true).setOrigin(1, 0);
    add(new TextButton(this, 888, 488, 'MANAGE TEAM [L]', { size: 11, color: THEME.GREEN, minWidth: 148,
      onSelect: () => this.scene.start('LineupScene', { returnTo: 'ZoneSelectScene' }) }));
    add(new TextButton(this, 1042, 488, 'POKÉ MART [S]', { size: 11, color: THEME.BLUE, minWidth: 144,
      onSelect: () => this.scene.start('StoreScene', { returnTo: 'ZoneSelectScene' }) }));
    const action = cleared ? 'ISLAND CLEARED' : isActive ? 'CONTINUE ISLAND' : !canEnter ? 'TRAVEL LOCKED' : isTower ? 'ENTER BATTLE TOWER' : 'ENTER REALM';
    add(new TextButton(this, center, 532, action, { size: 14, color: canEnter ? THEME.GOLD : THEME.GRAY, minWidth: 300,
      onSelect: canEnter ? () => this.activateSelection() : undefined }));
    const hint = meta.activeIslandId ? 'Beat the island boss to travel onward.' : isTower && !due ? 'Entry skips the remaining calendar days.' : due ? 'The realms reopen next year.' : '1–4 SELECT  ·  ENTER TRAVEL  ·  T TOWER';
    text(center, 566, hint, 10, THEME.GRAY).setOrigin(0.5, 0);
  }

  private selectArea(id: AreaId): void {
    if (!isZoneAvailable(id)) return;
    const activeIslandId = getMeta().activeIslandId;
    if (id !== 'tower') {
      const zone = resolveWorldZone(id);
      if (!zone) return;
      if (!activeIslandId && !isTournamentDue() && getRun().results[zone.bossId] !== 'win') updateMeta({ selectedZoneId: id });
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
    if (!isZoneAvailable(id)) return;
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
