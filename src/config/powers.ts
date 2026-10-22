import type { PowerDefinition } from '../core/powers';

/**
 * Power content lives here. The resolver supports event triggers, simple conditions,
 * timed stat multipliers, and one-use shot/pass multipliers. Keep values modest while
 * the combat economy is still being tuned.
 */
export const POWER_DEFINITIONS: PowerDefinition[] = [
  {
    id: 'clean-break', name: 'Clean Break',
    description: 'After completing a pass, the passer gains a short speed boost.',
    trigger: 'passComplete', cooldownSeconds: 8,
    effects: [{ type: 'statMultiplier', stat: 'speed', multiplier: 1.18, durationSeconds: 2.5 }],
  },
  {
    id: 'momentum-shot', name: 'Momentum Shot',
    description: 'Landing a juke empowers the next shot.',
    trigger: 'moveLanded', cooldownSeconds: 7,
    effects: [{ type: 'nextActionMultiplier', action: 'shot', multiplier: 1.15 }],
  },
  {
    id: 'riposte-legs', name: 'Riposte Legs',
    description: 'A successful parry grants a brief speed burst.',
    trigger: 'parrySuccess', cooldownSeconds: 6,
    effects: [{ type: 'statMultiplier', stat: 'speed', multiplier: 1.22, durationSeconds: 2 }],
  },
  {
    id: 'quick-distribution', name: 'Quick Distribution',
    description: 'A successful pass primes the next pass for extra speed.',
    trigger: 'passComplete', cooldownSeconds: 10,
    effects: [{ type: 'nextActionMultiplier', action: 'pass', multiplier: 1.2 }],
  },
];

/** Campaign default is intentionally empty until the player has an unlock/loadout UI. */
export const DEFAULT_CAMPAIGN_POWER_IDS: string[] = [];
