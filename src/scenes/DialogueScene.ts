import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { setStoryFlag } from '../state/metaStore';
import { wireShutdown } from '../ui/sceneLifecycle';
import { FONT, THEME, hex } from '../ui/theme';

export interface DialogueLine {
  speaker: string;
  text: string;
  /** Optional future portrait. No story line uses portraits by default. */
  portraitKey?: string;
  portraitScale?: number;
}

export class DialogueScene extends Phaser.Scene {
  private nextScene = 'ZoneSelectScene';
  private nextData?: Record<string, unknown>;
  private lines: DialogueLine[] = [];
  private index = 0;
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private flags: string[] = [];

  constructor() {
    super('DialogueScene');
  }

  init(data: { nextScene?: string; nextData?: Record<string, unknown>; lines?: DialogueLine[]; flag?: string; flags?: string[] }): void {
    this.nextScene = data?.nextScene || 'ZoneSelectScene';
    this.nextData = data?.nextData;
    this.lines = data?.lines || [];
    this.index = 0;
    this.flags = [...(data?.flags || []), ...(data?.flag ? [data.flag] : [])]
      .filter((flag, index, all) => all.indexOf(flag) === index);
  }

  create(): void {
    wireShutdown(this);

    // Empty beats are truly silent: save their flags and immediately continue.
    if (!this.lines.length) {
      this.finish();
      return;
    }

    this.cameras.main.setBackgroundColor(0x020610);

    // A dark, quiet backdrop with an abstract signal/tower silhouette. There are
    // deliberately no character sprites unless a future line explicitly opts in.
    const ambience = this.add.graphics();
    ambience.fillStyle(0x020610, 1).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ambience.fillStyle(0x102541, 0.24).fillCircle(GAME_WIDTH / 2, 245, 270);
    ambience.fillStyle(0x17304a, 0.16).fillCircle(GAME_WIDTH / 2, 238, 175);
    ambience.lineStyle(2, 0x476b91, 0.16).strokeCircle(GAME_WIDTH / 2, 236, 132);
    ambience.lineStyle(1, 0x476b91, 0.12).strokeCircle(GAME_WIDTH / 2, 236, 166);

    const stars: [number, number, number][] = [
      [78, 75, 2], [148, 143, 1], [233, 58, 1], [303, 177, 2], [383, 99, 1],
      [468, 63, 1], [526, 144, 2], [687, 86, 1], [762, 160, 2], [841, 63, 1],
      [916, 121, 1], [1080, 77, 2], [1118, 184, 1], [71, 286, 1], [198, 247, 1],
      [1003, 262, 1], [1095, 321, 1], [362, 263, 1], [822, 288, 1], [962, 57, 1],
    ];
    for (const [x, y, size] of stars) {
      ambience.fillStyle(0x9bb8d8, size === 2 ? 0.6 : 0.35).fillRect(x, y, size, size);
    }

    // A distant, intentionally indistinct tower: more atmosphere than illustration.
    ambience.fillStyle(0x040a14, 0.96);
    ambience.fillRect(554, 200, 84, 210);
    ambience.fillRect(571, 164, 50, 44);
    ambience.fillRect(584, 128, 24, 40);
    ambience.fillTriangle(584, 130, 596, 98, 608, 130);
    ambience.fillRect(531, 263, 23, 147);
    ambience.fillRect(638, 247, 25, 163);
    ambience.fillStyle(0x1b3b58, 0.28);
    ambience.fillRect(590, 180, 3, 164);
    ambience.fillRect(601, 180, 2, 106);
    ambience.lineStyle(1, 0x739ac0, 0.18).lineBetween(0, 410, GAME_WIDTH, 410);
    ambience.fillStyle(0x030811, 0.96).fillRect(0, 410, GAME_WIDTH, GAME_HEIGHT - 410);

    // Dialogue is the only bright, readable area; speaker portraits are opt-in per line.
    this.add.rectangle(GAME_WIDTH / 2, 510, 1012, 190, 0x071224, 0.98).setStrokeStyle(3, THEME.GOLD, 1);
    this.add.rectangle(GAME_WIDTH / 2, 510, 996, 174, 0x071224, 0).setStrokeStyle(1, 0x345a80, 1);
    this.add.rectangle(110, 420, 20, 3, THEME.GOLD, 1);
    this.add.rectangle(GAME_WIDTH - 110, 420, 20, 3, THEME.GOLD, 1);

    this.add.text(GAME_WIDTH / 2, 435, 'DIALOGUE  /  SIGNAL RECEIVED', {
      fontFamily: FONT, fontSize: '12px', color: hex(THEME.DIM), letterSpacing: 2,
    }).setOrigin(0.5);

    const speaker = this.add.text(145, 463, '', {
      fontFamily: FONT, fontSize: '13px', color: hex(THEME.BLUE), fontStyle: 'bold',
    });
    const body = this.add.text(145, 495, '', {
      fontFamily: FONT, fontSize: '20px', color: hex(THEME.WHITE),
      wordWrap: { width: 900 }, lineSpacing: 8,
    });
    const progress = this.add.text(GAME_WIDTH / 2, 625, 'ENTER / CLICK TO CONTINUE', {
      fontFamily: FONT, fontSize: '11px', color: hex(THEME.DIM),
    }).setOrigin(0.5);

    let portrait: Phaser.GameObjects.Image | null = null;
    const render = (): void => {
      const line = this.lines[this.index];
      const speakerName = (line?.speaker || 'UNKNOWN').toUpperCase();
      speaker.setText(speakerName);
      speaker.setColor(hex(speakerName === 'YOU' ? THEME.GREEN : speakerName === 'UNKNOWN' ? THEME.BLUE : THEME.GOLD));
      body.setText(line?.text || '');
      progress.setText(`${this.index + 1} / ${this.lines.length}   ·   ENTER / CLICK TO CONTINUE`);

      portrait?.destroy();
      portrait = null;
      const portraitKey = line?.portraitKey;
      if (portraitKey && this.textures.exists(portraitKey)) {
        const scale = Phaser.Math.Clamp(line.portraitScale ?? 1, 0.5, 1.5);
        portrait = this.add.image(228, 527, portraitKey).setDisplaySize(76 * scale, 76 * scale);
        portrait.setDepth(5);
        speaker.setPosition(300, 463);
        body.setPosition(300, 495).setWordWrapWidth(790);
      } else {
        speaker.setPosition(145, 463);
        body.setPosition(145, 495).setWordWrapWidth(900);
      }
    };

    const advance = (): void => {
      if (this.index < this.lines.length - 1) {
        this.index++;
        render();
        return;
      }
      this.finish();
    };

    this.input.on('pointerdown', advance);
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        advance();
      }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
    render();
  }

  private finish(): void {
    for (const flag of this.flags) setStoryFlag(flag);
    this.scene.start(this.nextScene, this.nextData);
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}
