import Phaser from 'phaser';
import { DRILLS, INTRO_DRILLS, ONBOARDING } from '../config/training';
import { GAME_WIDTH } from '../config/rink';
import { getMeta } from '../state/metaStore';
import { needsFirstRunIntro, prepareFirstCoastalMatch } from '../state/onboarding';
import { addRetroChrome } from '../ui/chrome';
import { FONT, FILL, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

export class TrainingMenuScene extends Phaser.Scene {
  private onKey: ((event: KeyboardEvent) => void) | null = null;
  constructor() { super('TrainingMenuScene'); }
  create(data?: { onboarding?: boolean; startFirstMatch?: boolean }): void {
    wireShutdown(this);
    if (data?.startFirstMatch) {
      const config = prepareFirstCoastalMatch();
      this.scene.start(config ? 'GameScene' : 'ZoneSelectScene', config ?? undefined);
      return;
    }
    if (data?.onboarding && needsFirstRunIntro()) {
      const flags = getMeta().flags;
      const drill = INTRO_DRILLS.find(id => !flags.includes(`training-complete-${id}`));
      if (drill && !flags.includes(ONBOARDING.introDone)) {
        this.scene.start('GameScene', { practice: { drill, onboarding: true } });
      } else {
        this.scene.restart({ startFirstMatch: true });
      }
      return;
    }
    addRetroChrome(this, THEME.BLUE);
    const center = GAME_WIDTH / 2;
    this.add.text(center, 52, 'TRAINING RINK', { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: hex(THEME.GOLD) }).setOrigin(.5);
    this.add.text(center, 91, 'Short lessons. Instant retries. Practice never spends days, BP, or match rewards.', { fontFamily: FONT, fontSize: '13px', color: hex(THEME.BLUE) }).setOrigin(.5);
    DRILLS.forEach((drill, index) => {
      const x = index % 2 ? 870 : 322, y = 170 + Math.floor(index / 2) * 102;
      const complete = getMeta().flags.includes(`training-complete-${drill.id}`);
      const panel = this.add.rectangle(x, y, 520, 86, FILL.plate, 1).setStrokeStyle(2, complete ? THEME.GREEN : THEME.BLUE).setInteractive({ useHandCursor: true });
      this.add.text(x - 242, y - 27, `[${index + 1}] ${drill.name}${complete ? '  ✓' : ''}`, { fontFamily: FONT, fontSize: '19px', color: hex(complete ? THEME.GREEN : THEME.WHITE), fontStyle: 'bold' });
      this.add.text(x - 242, y + 3, drill.objective, { fontFamily: FONT, fontSize: '12px', color: hex(THEME.DIM), wordWrap: { width: 480 } });
      panel.on('pointerover', () => panel.setFillStyle(FILL.plateHi));
      panel.on('pointerout', () => panel.setFillStyle(FILL.plate));
      panel.on('pointerdown', () => this.scene.start('GameScene', { practice: { drill: drill.id } }));
    });
    this.add.text(center, 574, 'Choose a lesson / press 1–8  ·  R retries any attempt  ·  ESC returns here', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.DIM) }).setOrigin(.5);
    const guide = this.add.text(330, 626, 'CONTROL GUIDE  [C]', { fontFamily: FONT, fontSize: '18px', color: hex(THEME.BLUE) }).setOrigin(.5).setInteractive({ useHandCursor: true });
    guide.on('pointerdown', () => this.scene.start('TitleScene', { showHelp: true }));
    this.add.text(870, 626, 'BACK TO TITLE  [ESC]', { fontFamily: FONT, fontSize: '18px', color: hex(THEME.GOLD) }).setOrigin(.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.scene.start('TitleScene'));
    this.onKey = e => {
      if (e.repeat) return;
      const digit = /^(Digit|Numpad)([1-8])$/.exec(e.code);
      if (digit) this.scene.start('GameScene', { practice: { drill: DRILLS[Number(digit[2]) - 1].id } });
      else if (e.code === 'Escape') this.scene.start('TitleScene');
      else if (e.code === 'KeyC') this.scene.start('TitleScene', { showHelp: true });
    };
    window.addEventListener('keydown', this.onKey);
  }
  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
