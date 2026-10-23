import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { getCareerStats, type PlayerStatLine, type RunHistoryEntry } from '../state/careerStatsStore';
import { addRetroChrome, addRetroPanel } from '../ui/chrome';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

type StatsTab = 'run' | 'allTime' | 'history';
interface CareerStatsData { returnTo?: string }
const TAB_LABELS: Array<{ id: StatsTab; label: string }> = [
  { id: 'run', label: 'CURRENT RUN' },
  { id: 'allTime', label: 'ALL TIME' },
  { id: 'history', label: 'RUN HISTORY' },
];

/** Campaign goals/assists, lifetime totals, and the lineup/opponent from completed runs. */
export class CareerStatsScene extends Phaser.Scene {
  private returnTo = 'TitleScene';
  private tab: StatsTab = 'run';
  private pages: Record<StatsTab, number> = { run: 0, allTime: 0, history: 0 };
  private content: Phaser.GameObjects.Container | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() { super('CareerStatsScene'); }

  init(data?: CareerStatsData): void { this.returnTo = data?.returnTo || 'TitleScene'; this.tab = 'run'; }

  create(): void {
    wireShutdown(this);
    addRetroChrome(this, THEME.BLUE);
    addRetroPanel(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1140, 590, THEME.BLUE, FILL.panel);
    this.add.text(GAME_WIDTH / 2, 58, 'CAREER STATS', { fontFamily: FONT, fontSize: '32px', color: hex(THEME.GOLD), fontStyle: 'bold' }).setOrigin(.5);
    this.add.text(GAME_WIDTH / 2, 91, 'Every goal and assist is credited to the Pokémon who made the play.', { fontFamily: FONT, fontSize: '13px', color: hex(THEME.DIM) }).setOrigin(.5);
    this.render();
    new TextButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 46, 'BACK', { color: THEME.GREEN, minWidth: 180, onSelect: () => this.goBack() });
    this.onKey = e => { if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') this.goBack(); };
    window.addEventListener('keydown', this.onKey);
  }

  private render(): void {
    this.content?.destroy(true);
    const c = this.add.container(0, 0);
    this.content = c;
    const stats = getCareerStats();
    TAB_LABELS.forEach((tab, i) => {
      const selected = tab.id === this.tab;
      const btn = new TextButton(this, GAME_WIDTH / 2 - 270 + i * 270, 132, `${selected ? '▶ ' : ''}${tab.label}`, {
        color: selected ? THEME.GOLD : THEME.BLUE,
        size: 15,
        minWidth: 220,
        onSelect: () => { this.tab = tab.id; this.render(); },
      });
      c.add(btn);
    });

    if (this.tab === 'run') this.renderRun(c, stats.currentRun);
    else if (this.tab === 'allTime') this.renderAllTime(c, stats.allTime);
    else this.renderHistory(c, stats.history);
  }

  private renderRun(c: Phaser.GameObjects.Container, run: ReturnType<typeof getCareerStats>['currentRun']): void {
    if (!run) {
      c.add(this.label(GAME_WIDTH / 2, 300, 'No run stats yet. Start a campaign to begin tracking goals and assists.', 18, THEME.DIM));
      return;
    }
    const stateLabel = run.outcome ? (run.outcome === 'victory' ? 'YEAR WON' : 'RUN ENDED') : 'IN PROGRESS';
    c.add(this.label(GAME_WIDTH / 2, 177, `YEAR ${run.year} · ${run.teamName.toUpperCase()} · ${stateLabel}`, 16, run.outcome ? THEME.GOLD : THEME.GREEN));
    c.add(this.label(GAME_WIDTH / 2, 204, `TEAM GOALS  ${run.goalsFor}     GOALS AGAINST  ${run.goalsAgainst}     PLAYER ASSISTS  ${Object.values(run.playerStats).reduce((n, p) => n + p.assists, 0)}`, 12, THEME.DIM));
    const rows = Object.values(run.playerStats).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
    const pageSize = 8;
    this.pages.run = Math.min(this.pages.run, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
    this.renderStatRows(c, rows.slice(this.pages.run * pageSize, (this.pages.run + 1) * pageSize), 242);
    this.renderPager(c, 'run', rows.length, pageSize, 585, 'Pokémon');
  }

  private renderAllTime(c: Phaser.GameObjects.Container, allTime: Record<string, PlayerStatLine>): void {
    const rows = Object.values(allTime).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
    const goals = rows.reduce((n, row) => n + row.goals, 0);
    const assists = rows.reduce((n, row) => n + row.assists, 0);
    c.add(this.label(GAME_WIDTH / 2, 177, `CAREER TOTALS     GOALS ${goals}     ASSISTS ${assists}`, 16, THEME.GOLD));
    if (!rows.length) {
      c.add(this.label(GAME_WIDTH / 2, 300, 'No recorded goals or assists yet.', 17, THEME.DIM));
      return;
    }
    const pageSize = 8;
    this.pages.allTime = Math.min(this.pages.allTime, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
    this.renderStatRows(c, rows.slice(this.pages.allTime * pageSize, (this.pages.allTime + 1) * pageSize), 214);
    this.renderPager(c, 'allTime', rows.length, pageSize, 568, 'Pokémon');
  }

  private renderStatRows(c: Phaser.GameObjects.Container, rows: PlayerStatLine[], startY: number): void {
    if (!rows.length) {
      c.add(this.label(GAME_WIDTH / 2, startY + 25, 'No player stats recorded yet.', 16, THEME.DIM));
      return;
    }
    const visible = rows;
    visible.forEach((p, i) => {
      const y = startY + i * 43;
      const row = this.add.rectangle(GAME_WIDTH / 2, y, 900, 38, i % 2 === 0 ? FILL.plate : FILL.background, 0.96).setStrokeStyle(1, THEME.DIM, 0.55);
      c.add(row);
      const key = `pkm-${p.sprite}`;
      if (this.textures.exists(key)) c.add(this.add.image(GAME_WIDTH / 2 - 410, y, key).setDisplaySize(30, 30));
      c.add(this.label(GAME_WIDTH / 2 - 380, y, `${p.name.toUpperCase()}${p.goalie ? ' · GOALIE' : p.isStarter ? ' · STARTER' : ''}`, 13, p.isStarter ? THEME.GOLD : THEME.WHITE).setOrigin(0, .5));
      c.add(this.label(GAME_WIDTH / 2 + 280, y, `GOALS  ${p.goals}`, 13, THEME.GREEN));
      c.add(this.label(GAME_WIDTH / 2 + 390, y, `AST  ${p.assists}`, 13, THEME.BLUE));
    });
  }

  private renderHistory(c: Phaser.GameObjects.Container, history: RunHistoryEntry[]): void {
    if (!history.length) {
      c.add(this.label(GAME_WIDTH / 2, 300, 'No completed runs recorded yet. Your team and defeat location will be saved here.', 16, THEME.DIM));
      return;
    }
    const pageSize = 5;
    this.pages.history = Math.min(this.pages.history, Math.max(0, Math.ceil(history.length / pageSize) - 1));
    const visible = history.slice(this.pages.history * pageSize, (this.pages.history + 1) * pageSize);
    visible.forEach((run, i) => {
      const y = 190 + i * 70;
      c.add(this.add.rectangle(GAME_WIDTH / 2, y, 1020, 62, i % 2 === 0 ? FILL.plate : FILL.background, .98).setStrokeStyle(1, run.outcome === 'victory' ? THEME.GOLD : run.outcome === 'forfeit' ? THEME.RED : THEME.DIM));
      const heading = run.outcome === 'victory' ? `YEAR ${run.year} · CHAMPION` : run.outcome === 'forfeit' ? `YEAR ${run.year} · FORFEIT AGAINST ${(run.lostTo || 'UNKNOWN OPPONENT').toUpperCase()}` : `YEAR ${run.year} · LOST TO ${(run.lostTo || 'UNKNOWN OPPONENT').toUpperCase()}`;
      c.add(this.label(GAME_WIDTH / 2 - 490, y - 17, heading, 13, run.outcome === 'victory' ? THEME.GOLD : run.outcome === 'forfeit' ? THEME.RED : THEME.WHITE).setOrigin(0, .5));
      const scoreText = run.score ? `SCORE ${run.score.for}–${run.score.against}` : 'SCORE —';
      c.add(this.label(GAME_WIDTH / 2 + 490, y - 17, `${scoreText} · ${run.winsBeforeEnd} WINS`, 11, THEME.DIM).setOrigin(1, .5));
      // History keeps the active lineup only (never the bench), including the goalie.
      // Show up to three skaters plus the goalie in four compact slots.
      const skaters = run.lineup.filter(p => !p.goalie).slice(0, 3);
      const goalie = run.lineup.find(p => p.goalie);
      const roster = [...skaters, ...(goalie ? [goalie] : [])];
      roster.forEach((p, j) => {
        const x = GAME_WIDTH / 2 - 480 + j * 160;
        const key = `pkm-${p.sprite}`;
        if (this.textures.exists(key)) c.add(this.add.image(x, y + 13, key).setDisplaySize(25, 25));
        const role = p.goalie ? ' · G' : p.isStarter ? ' · STARTER' : '';
        c.add(this.label(x + 20, y + 13, `${p.name.toUpperCase()}${role}`, 10, p.isStarter ? THEME.GOLD : p.goalie ? THEME.BLUE : THEME.DIM).setOrigin(0, .5));
      });
    });
    this.renderPager(c, 'history', history.length, pageSize, 560, 'runs');
  }

  private renderPager(c: Phaser.GameObjects.Container, tab: StatsTab, total: number, pageSize: number, y: number, unit: string): void {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    if (pageCount <= 1) return;
    const page = this.pages[tab];
    if (page > 0) {
      c.add(new TextButton(this, GAME_WIDTH / 2 - 270, y, '← NEWER / PREVIOUS', {
        color: THEME.BLUE, size: 13, minWidth: 210,
        onSelect: () => { if (this.pages[tab] > 0) { this.pages[tab]--; this.render(); } },
      }));
    } else {
      c.add(this.label(GAME_WIDTH / 2 - 270, y, '← NEWER / PREVIOUS', 13, THEME.DIM));
    }
    if (page + 1 < pageCount) {
      c.add(new TextButton(this, GAME_WIDTH / 2 + 270, y, 'OLDER / NEXT →', {
        color: THEME.BLUE, size: 13, minWidth: 210,
        onSelect: () => { if (this.pages[tab] + 1 < pageCount) { this.pages[tab]++; this.render(); } },
      }));
    } else {
      c.add(this.label(GAME_WIDTH / 2 + 270, y, 'OLDER / NEXT →', 13, THEME.DIM));
    }
    c.add(this.label(GAME_WIDTH / 2, y, `PAGE ${page + 1}/${pageCount} · ${total} ${unit}`, 11, THEME.DIM));
  }

  private label(x: number, y: number, text: string, size: number, color: number): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color: hex(color), align: 'center', wordWrap: { width: 1000 } }).setOrigin(.5);
  }

  private goBack(): void { this.scene.start(this.returnTo); }
  shutdown(): void { if (this.onKey) window.removeEventListener('keydown', this.onKey); this.onKey = null; this.content?.destroy(true); this.content = null; }
}
