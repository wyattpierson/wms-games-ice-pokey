import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/rink';
import { takeAchievementPopup } from '../state/achievementsStore';
import { addTrophy } from '../ui/trophy';
import { FILL, FONT, THEME, hex } from '../ui/theme';

/** Independent overlay: unlocks queue and survive transitions between game scenes. */
export class AchievementToastScene extends Phaser.Scene {
  private showing = false;
  constructor() { super('AchievementToastScene'); }
  update(): void {
    if (this.showing) { this.scene.bringToTop(); return; }
    const achievement = takeAchievementPopup();
    if (!achievement) return;
    this.showing = true;
    this.scene.bringToTop();
    const c = this.add.container(GAME_WIDTH - 236, -100);
    c.add(this.add.rectangle(0, 5, 420, 104, 0x000000, .35));
    c.add(this.add.rectangle(0, 0, 420, 104, FILL.panel).setStrokeStyle(2, achievement.color));
    c.add(this.add.rectangle(-205, 0, 6, 100, achievement.color));
    c.add(addTrophy(this, -160, 0, achievement.color));
    c.add(this.add.text(-112, -29, 'ACHIEVEMENT UNLOCKED!', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.GOLD) }));
    c.add(this.add.text(-112, -5, achievement.name, { fontFamily: FONT, fontSize: '18px', color: hex(THEME.WHITE), fontStyle: 'bold' }));
    c.add(this.add.text(-112, 25, 'A new trophy for your collection.', { fontFamily: FONT, fontSize: '11px', color: hex(THEME.DIM) }));
    this.tweens.add({ targets: c, y: 76, duration: 420, ease: 'Back.Out', onComplete: () => {
      this.time.delayedCall(3600, () => {
        this.tweens.add({ targets: c, y: -100, alpha: 0, duration: 280, onComplete: () => { c.destroy(true); this.showing = false; } });
      });
    } });
  }
}
