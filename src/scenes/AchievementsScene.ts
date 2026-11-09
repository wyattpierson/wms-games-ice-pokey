import Phaser from 'phaser';
import { ACHIEVEMENTS } from '../config/achievements';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/rink';
import { getAchievements } from '../state/achievementsStore';
import { addRetroChrome, addRetroPanel } from '../ui/chrome';
import { TextButton } from '../ui/menu';
import { wireShutdown } from '../ui/sceneLifecycle';
import { addTrophy } from '../ui/trophy';
import { FILL, FONT, THEME, hex } from '../ui/theme';

const PAGE_SIZE = 8;
export class AchievementsScene extends Phaser.Scene {
  private page = 0;
  private content?: Phaser.GameObjects.Container;
  private onKey?: (e: KeyboardEvent) => void;
  constructor() { super('AchievementsScene'); }
  create(): void {
    wireShutdown(this);
    this.page = 0;
    addRetroChrome(this, THEME.GOLD);
    this.add.text(GAME_WIDTH / 2, 62, 'TROPHY ROOM', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: hex(THEME.GOLD) }).setOrigin(.5);
    this.add.text(GAME_WIDTH / 2, 99, 'Little victories. Forever yours. Even when you wipe your save.', { fontFamily: FONT, fontSize: '13px', color: hex(THEME.DIM) }).setOrigin(.5);
    this.render();
    new TextButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 42, 'BACK', { color: THEME.GREEN, minWidth: 180, onSelect: () => this.scene.start('TitleScene') });
    this.onKey = e => {
      if (['Escape', 'Enter', 'Space'].includes(e.code)) this.scene.start('TitleScene');
      if (e.code === 'ArrowLeft') this.changePage(-1);
      if (e.code === 'ArrowRight') this.changePage(1);
    };
    window.addEventListener('keydown', this.onKey);
  }
  private changePage(delta: number): void {
    this.page = Math.max(0, Math.min(Math.ceil(ACHIEVEMENTS.length / PAGE_SIZE) - 1, this.page + delta));
    this.render();
  }
  private render(): void {
    this.content?.destroy(true);
    const c = this.add.container(0, 0);
    this.content = c;
    const { earned } = getAchievements();
    c.add(this.add.text(GAME_WIDTH / 2, 132, `${ACHIEVEMENTS.filter(a => earned[a.id]).length} / ${ACHIEVEMENTS.length} TROPHIES EARNED`, { fontFamily: FONT, fontSize: '13px', color: hex(THEME.GREEN) }).setOrigin(.5));
    ACHIEVEMENTS.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE).forEach((a, i) => {
      const unlocked = !!earned[a.id];
      const x = 310 + (i % 2) * 572;
      const y = 210 + Math.floor(i / 2) * 104;
      const color = unlocked ? a.color : THEME.DIM;
      c.add(addRetroPanel(this, x, y, 540, 92, color, FILL.panel));
      c.add(addTrophy(this, x - 218, y, color, !unlocked).setAlpha(unlocked ? 1 : .35));
      const label = (dy: number, text: string, size: number, tint: number) => this.add.text(x - 170, y + dy, text, { fontFamily: FONT, fontSize: `${size}px`, color: hex(tint), wordWrap: { width: 410 } });
      c.add(label(-30, unlocked ? a.name : 'Unknown', 18, unlocked ? THEME.WHITE : THEME.DIM));
      if (unlocked) c.add(label(-3, a.criteria, 12, THEME.DIM));
      if (unlocked) c.add(label(28, 'EARNED · YOURS FOREVER', 9, color));
    });
    if (ACHIEVEMENTS.length > PAGE_SIZE) {
      c.add(new TextButton(this, 300, 584, '← PREVIOUS', { size: 12, onSelect: () => this.changePage(-1) }));
      c.add(new TextButton(this, GAME_WIDTH - 300, 584, 'NEXT →', { size: 12, onSelect: () => this.changePage(1) }));
    }
  }
  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = undefined;
    this.content?.destroy(true);
    this.content = undefined;
  }
}
