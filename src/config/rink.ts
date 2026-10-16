/**
 * Rink geometry. All gameplay happens in the ice rectangle [ICE_X, ICE_X+RINK_W]
 * × [ICE_Y, ICE_Y+RINK_H]. Team 0 (the user) defends the LEFT goal and attacks
 * RIGHT; team 1 is mirrored. The camera is static — the whole rink is on screen
 * (classic arcade layout).
 */

export const MARGIN = 34; // dark margin around the boards
export const BOARD = 22; // board thickness
export const RINK_W = 1080;
export const RINK_H = 560;

export const ICE_X = MARGIN + BOARD;
export const ICE_Y = MARGIN + BOARD;

export const GAME_WIDTH = RINK_W + 2 * (MARGIN + BOARD);
export const GAME_HEIGHT = RINK_H + 2 * (MARGIN + BOARD);

export const CENTER_X = ICE_X + RINK_W / 2;
export const CENTER_Y = ICE_Y + RINK_H / 2;

export const GOAL_W = 16; // depth of the net behind the goal line
export const GOAL_H = 120; // height of the goal mouth
export const GOAL_TOP = CENTER_Y - GOAL_H / 2;
export const GOAL_BOTTOM = CENTER_Y + GOAL_H / 2;

export const GOALIE_LINE_X = { left: ICE_X + 24, right: ICE_X + RINK_W - 24 };
export const CREST_R = 58; // goalie crease radius
