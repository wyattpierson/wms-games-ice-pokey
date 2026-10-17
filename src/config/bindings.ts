/**
 * EVERY keyboard binding lives here. The same key may back different actions as
 * long as they never happen at the same time (Enter/Shift = charge shot on
 * offense, check on defense; SPACE = pass on offense, switch on defense).
 * Swap the whole scheme here without touching game logic.
 */

export type Action = 'pass' | 'shoot' | 'spin' | 'crossover' | 'deke';

export const ACTION_KEYS: Record<Action, string[]> = {
  pass: ['SPACE'], // offense: pass · defense: switch controlled defender
  shoot: ['SHIFT', 'ENTER'], // offense: hold to charge, release in the window to shoot · defense: CHECK (block — never steals)
  // The FIRST key is the primary (shown in the on-screen key hint); the rest are alternates.
  // E / F sit under the LEFT hand so the right hand can stay on the arrow keys.
  spin: ['E', 'J'], // offense: Spin juke · defense: parry (same key)
  deke: ['F', 'K'], // offense: Deke juke · defense: parry
  crossover: ['L'], // (disabled — see ENABLED_MOVES)
};

export const MOVE_KEYS: Record<'up' | 'down' | 'left' | 'right', string[]> = {
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
};
