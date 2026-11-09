/** Threat bands describe actual AI settings, independently of realm order or theme. */
export const ZONE_DIFFICULTY_BANDS = [
  { min: 0, label: 'APPROACHABLE', color: 0x73d2a4 },
  { min: 0.25, label: 'CHALLENGING', color: 0x85c9ff },
  { min: 0.50, label: 'ELITE', color: 0xf4c95d },
  { min: 0.75, label: 'SEVERE', color: 0xf3a56c },
  { min: 0.95, label: 'EXTREME', color: 0xef6b73 },
];

export function zoneDifficultyBand(level: number) {
  const clamped = Math.max(0, Math.min(1, level));
  const index = ZONE_DIFFICULTY_BANDS.reduce((best, band, i) => clamped >= band.min ? i : best, 0);
  return { ...ZONE_DIFFICULTY_BANDS[index], tier: index + 1 };
}
