import type Phaser from 'phaser';
import {
  CREST_R, CENTER_X, CENTER_Y, GAME_HEIGHT, GAME_WIDTH, GOAL_BOTTOM,
  GOAL_TOP, GOAL_W, ICE_X, ICE_Y, MARGIN, RINK_H, RINK_W,
} from '../../config/rink';

const ICE = 0xeaf2fb;
const LINE_RED = 0xe2554f;
const LINE_BLUE = 0x2f6fd0;

/** Draws the whole rink once (static camera, everything on screen). */
export function drawRink(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // dark margin + boards + ice
  g.fillStyle(0x10151f, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.fillStyle(0x93a1b5, 1);
  g.fillRect(MARGIN, MARGIN, GAME_WIDTH - 2 * MARGIN, GAME_HEIGHT - 2 * MARGIN);
  g.fillStyle(ICE, 1);
  g.fillRect(ICE_X, ICE_Y, RINK_W, RINK_H);

  // center line + faceoff circle
  g.fillStyle(LINE_RED, 1);
  g.fillRect(CENTER_X - 2, ICE_Y, 4, RINK_H);
  g.lineStyle(3, LINE_RED, 1);
  g.strokeCircle(CENTER_X, CENTER_Y, 62);
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
    g.fillStyle(LINE_BLUE, 0.14);
    g.fillCircle(creaseX, CENTER_Y, CREST_R);
    g.lineStyle(2, LINE_BLUE, 0.5);
    g.strokeCircle(creaseX, CENTER_Y, CREST_R);

    // net (drawn into the margin behind the goal line)
    const nx = side === 'left' ? ICE_X - GOAL_W : ICE_X + RINK_W;
    g.fillStyle(0x14181f, 1);
    g.fillRect(nx, GOAL_TOP, GOAL_W, GOAL_BOTTOM - GOAL_TOP);
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
