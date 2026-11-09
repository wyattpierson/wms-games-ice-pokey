export const DRILLS = [
  { id: 'skate', name: 'Learn to Skate', objective: 'Skate through the three gates in order.', controls: 'ARROWS / WASD move. Release to glide; turn back for the next gate.', target: 3 },
  { id: 'pass', name: 'Pass and Move', objective: 'Complete three passes between your two partners.', controls: 'SPACE passes. Control follows the receiver. Aim toward your partner with the arrows.', target: 3 },
  { id: 'shoot', name: 'Pick Your Corner', objective: 'Score in the highlighted top corner, then the bottom corner.', controls: 'Hold SHIFT to charge. UP / DOWN aims. Release SHIFT to shoot.', target: 2 },
  { id: 'timing', name: 'Find the Release', objective: 'Release two perfect shots when the gold ring pulses.', controls: 'Hold SHIFT. Release when the ring fills and pulses; holding too long loses power.', target: 2 },
  { id: 'pressure', name: 'Escape the Pressure', objective: 'Pass out of pressure, then escape with a juke.', controls: 'SPACE passes to safety. On the second attempt, E spins or F dekes out of pressure.', target: 2 },
  { id: 'check', name: 'Stand Your Ground', objective: 'Land two checks on the approaching carrier.', controls: 'Without the puck, SHIFT plants a check. Let the carrier enter your blue ring.', target: 2 },
  { id: 'parry', name: 'Read the Juke', objective: 'Counter a Spin with E, then a Deke with F.', controls: 'Stand in front. Match the badge key when its ring pulses. The first tell is slowed.', target: 2 },
  { id: 'one-timer', name: 'The One-Timer', objective: 'Redirect two arriving passes with an instant shot.', controls: 'Press SHIFT as the cyan ring closes on you. UP / DOWN chooses the corner.', target: 2 },
] as const;
export type DrillId = typeof DRILLS[number]['id'];
export interface PracticeConfig { drill: DrillId; onboarding?: boolean }
export const INTRO_DRILLS: readonly DrillId[] = ['skate', 'pass', 'shoot'];
export const ONBOARDING = {
  introDone: 'tutorial-intro-complete',
  firstMatchStarted: 'tutorial-first-match-started',
  firstMatchDone: 'tutorial-first-match-complete',
  hintsOff: 'tutorial-hints-off',
} as const;
