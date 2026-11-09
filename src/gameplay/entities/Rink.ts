import type Phaser from 'phaser';
import {
  CREST_R, CENTER_X, CENTER_Y, GAME_HEIGHT, GAME_WIDTH, GOAL_BOTTOM,
  GOAL_TOP, GOAL_W, ICE_X, ICE_Y, MARGIN, RINK_H, RINK_W,
} from '../../config/rink';

const ICE = 0xe5f1f5;
const LINE_RED = 0xe2554f;
const LINE_BLUE = 0x2f6fd0;

/** Draws the whole rink once (static camera, everything on screen). */
export function drawRink(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // dark margin + boards + ice
  g.fillStyle(0x10151f, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.fillStyle(0x293e54, 1);
  g.fillRect(MARGIN, MARGIN, GAME_WIDTH - 2 * MARGIN, GAME_HEIGHT - 2 * MARGIN);
  g.fillStyle(0xb7d0dd, 1);
  g.fillRect(MARGIN + 4, MARGIN + 4, GAME_WIDTH - 2 * MARGIN - 8, GAME_HEIGHT - 2 * MARGIN - 8);
  // Segmented boards and a gold kick plate: hard edges, no soft gradients.
  g.lineStyle(2, 0x7798ab, 1);
  for (let x = ICE_X + 36; x < ICE_X + RINK_W; x += 72) {
    g.lineBetween(x, MARGIN + 5, x, ICE_Y);
    g.lineBetween(x, ICE_Y + RINK_H, x, GAME_HEIGHT - MARGIN - 5);
  }
  g.fillStyle(0xd7b866, 1);
  g.fillRect(ICE_X - 3, ICE_Y - 3, RINK_W + 6, RINK_H + 6);
  g.fillStyle(ICE, 1);
  g.fillRect(ICE_X, ICE_Y, RINK_W, RINK_H);
  // Quiet resurfacing bands and fixed pixel scratches stay behind every cue.
  g.fillStyle(0xffffff, 0.22);
  for (let y = ICE_Y; y < ICE_Y + RINK_H; y += 80) g.fillRect(ICE_X, y, RINK_W, 40);
  g.fillStyle(0x88b5c8, 0.16);
  for (let i = 0; i < 110; i++) {
    const x = ICE_X + 20 + (i * 197 % (RINK_W - 54));
    const y = ICE_Y + 16 + (i * 83 % (RINK_H - 32));
    g.fillRect(x, y, 5 + i % 12, 1);
  }
  g.fillStyle(0x6c9eb5, 0.12);
  g.fillRect(ICE_X, ICE_Y, RINK_W, 4);
  g.fillRect(ICE_X, ICE_Y, 4, RINK_H);
  // Centre-ice crest echoes a Poké Ball without competing with the players.
  g.fillStyle(0xffffff, 0.38);
  g.fillCircle(CENTER_X, CENTER_Y, 58);

  // center line + faceoff circle
  g.fillStyle(LINE_RED, 1);
  g.fillRect(CENTER_X - 2, ICE_Y, 4, RINK_H);
  g.lineStyle(3, LINE_RED, 1);
  g.strokeCircle(CENTER_X, CENTER_Y, 62);
  g.lineStyle(2, LINE_RED, 0.35);
  g.lineBetween(CENTER_X - 60, CENTER_Y, CENTER_X + 60, CENTER_Y);
  g.fillStyle(ICE, 1);
  g.fillCircle(CENTER_X, CENTER_Y, 14);
  g.lineStyle(2, LINE_RED, 0.7);
  g.strokeCircle(CENTER_X, CENTER_Y, 14);
  g.fillStyle(LINE_RED, 1);
  g.fillCircle(CENTER_X, CENTER_Y, 4);

  // faceoff dots (four)
  const dots: Array<[number, number]> = [
    [ICE_X + RINK_W * 0.27, ICE_Y + RINK_H * 0.28],
    [ICE_X + RINK_W * 0.27, ICE_Y + RINK_H * 0.72],
    [ICE_X + RINK_W * 0.73, ICE_Y + RINK_H * 0.28],
    [ICE_X + RINK_W * 0.73, ICE_Y + RINK_H * 0.72],
  ];
  for (const [x, y] of dots) {
    g.lineStyle(2, LINE_BLUE, 0.8);
    g.strokeCircle(x, y, 38);
    g.fillStyle(LINE_BLUE, 1);
    g.fillCircle(x, y, 4);
  }

  // goal lines + creases + nets, both ends
  for (const side of ['left', 'right'] as const) {
    const lineX = side === 'left' ? ICE_X + 64 : ICE_X + RINK_W - 64;
    g.fillStyle(LINE_BLUE, 1);
    g.fillRect(lineX - 2, ICE_Y, 4, RINK_H);

    const creaseX = side === 'left' ? ICE_X : ICE_X + RINK_W;
    const creaseStart = side === 'left' ? -Math.PI / 2 : Math.PI / 2;
    g.fillStyle(LINE_BLUE, 0.14);
    g.beginPath();
    g.slice(creaseX, CENTER_Y, CREST_R, creaseStart, creaseStart + Math.PI, false);
    g.fillPath();
    g.lineStyle(2, LINE_BLUE, 0.5);
    g.beginPath();
    g.arc(creaseX, CENTER_Y, CREST_R, creaseStart, creaseStart + Math.PI, false);
    g.strokePath();

    // net (drawn into the margin behind the goal line)
    const nx = side === 'left' ? ICE_X - GOAL_W : ICE_X + RINK_W;
    g.fillStyle(0x14181f, 1);
    g.fillRect(nx, GOAL_TOP, GOAL_W, GOAL_BOTTOM - GOAL_TOP);
    g.lineStyle(2, LINE_RED, 1);
    g.strokeRect(nx, GOAL_TOP, GOAL_W, GOAL_BOTTOM - GOAL_TOP);
    g.lineStyle(1, 0x8b98ab, 0.9);
    for (let i = 1; i < 4; i++) {
      const x = side === 'left' ? ICE_X - (GOAL_W / 4) * i : ICE_X + RINK_W + (GOAL_W / 4) * i;
      g.lineBetween(x, GOAL_TOP, x, GOAL_BOTTOM);
    }
    for (let i = 1; i < 6; i++) {
      const y = GOAL_TOP + ((GOAL_BOTTOM - GOAL_TOP) / 6) * i;
      g.lineBetween(nx, y, nx + GOAL_W, y);
    }
    // goal mouth frame
    g.fillStyle(0xf2f6fc, 1);
    g.fillRect(side === 'left' ? ICE_X - 3 : ICE_X + RINK_W - 1, GOAL_TOP - 4, 4, 4);
    g.fillRect(side === 'left' ? ICE_X - 3 : ICE_X + RINK_W - 1, GOAL_BOTTOM, 4, 4);
  }
}
