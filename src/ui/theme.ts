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
  GOLD: 0xfacc15,
  WHITE: 0xf5f5f4,
  RED: 0xf87171,
  GREEN: 0x4ade80,
  BLUE: 0x60a5fa,
  GRAY: 0x9ca3af,
  DIM: 0x6b7280,
};

export const FILL: Record<'background' | 'plate' | 'panel', number> = {
  background: 0x0b0f16, // matches the Phaser config background
  plate: 0x111827,
  panel: 0x111a24,
};

export const FONT = 'monospace';

/** 0x12ab34 -> "#12ab34" for Phaser text colors. */
export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
