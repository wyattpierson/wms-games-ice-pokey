/**
 * Shared visual constants for the menu/campaign scenes.
 *
 * ice-pokey is monospace (no pixel font — see index.html), so these helpers
 * drop the 8px pixel-grid of the reference theme and use plain monospace text.
 * The rink is the stage: menus are dark plates that read over the ice.
 */
// Note: NOT `as const` — plain number fields so callers can reassign/copy colors
// without fighting literal types.
export const THEME: Record<'GOLD' | 'WHITE' | 'RED' | 'GREEN' | 'BLUE' | 'GRAY' | 'DIM', number> = {
  GOLD: 0xf4c95d,
  WHITE: 0xf4f1de,
  RED: 0xef6b73,
  GREEN: 0x73d2a4,
  BLUE: 0x75bde0,
  GRAY: 0xaab6c5,
  DIM: 0x7d8a9a,
};

export const FILL: Record<'background' | 'plate' | 'plateHi' | 'panel' | 'goalie', number> = {
  background: 0x091522, // deep rink-night blue
  plate: 0x122236,
  plateHi: 0x20364e, // hard-edged focus state
  panel: 0x0e1d2d,
  goalie: 0x2a281b, // warm-tinted goalie slot
};

export const FONT = 'monospace';

/** 0x12ab34 -> "#12ab34" for Phaser text colors. */
export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
