/** Data-driven power definitions and deterministic runtime. No Phaser dependencies. */
export type PowerTrigger = 'passComplete' | 'shotTaken' | 'goalScored' | 'moveLanded' | 'parrySuccess' | 'checkHit' | 'possessionGained';
export type PowerStat = 'speed' | 'shotPower' | 'passPower' | 'skill' | 'checkPower';
export type PowerAction = 'shot' | 'pass';
export type PowerEffect =
  | { type: 'statMultiplier'; stat: PowerStat; multiplier: number; durationSeconds: number }
  | { type: 'nextActionMultiplier'; action: PowerAction; multiplier: number };
export interface PowerCondition {
  /** If present, event actor must be carrying / not carrying the puck. */
  hasPuck?: boolean;
  /** If present, only the matching role can trigger the power. */
  role?: 'goalie' | 'field';
}
export interface PowerDefinition {
  id: string;
  name: string;
  description: string;
  trigger: PowerTrigger;
  cooldownSeconds: number;
  condition?: PowerCondition;
  effects: PowerEffect[];
}
export interface PowerEventContext {
  actorKey: string;
  team: 0 | 1;
  role: 'goalie' | 'field';
  hasPuck: boolean;
  now: number;
}
interface ActiveStatEffect { actorKey: string; stat: PowerStat; multiplier: number; expiresAt: number; powerId: string }
interface QueuedActionEffect { actorKey: string; action: PowerAction; multiplier: number; powerId: string }
export interface PowerActivation { powerId: string; powerName: string; actorKey: string; trigger: PowerTrigger; at: number }

export class PowerRuntime {
  private cooldowns = new Map<string, number>();
  private activeStats: ActiveStatEffect[] = [];
  private queuedActions: QueuedActionEffect[] = [];
  readonly activations: PowerActivation[] = [];

  constructor(private readonly definitions: readonly PowerDefinition[], private readonly activePowerIds: readonly string[]) {}

  emit(trigger: PowerTrigger, context: PowerEventContext): PowerActivation[] {
    this.activeStats = this.activeStats.filter((e) => e.expiresAt > context.now);
    const fired: PowerActivation[] = [];
    for (const id of this.activePowerIds) {
      const power = this.definitions.find((p) => p.id === id);
      if (!power || power.trigger !== trigger || context.team !== 0) continue;
      if (power.condition?.hasPuck !== undefined && power.condition.hasPuck !== context.hasPuck) continue;
      if (power.condition?.role && power.condition.role !== context.role) continue;
      const key = `${context.actorKey}:${power.id}`;
      if ((this.cooldowns.get(key) ?? -Infinity) > context.now) continue;
      this.cooldowns.set(key, context.now + Math.max(0, power.cooldownSeconds));
      for (const effect of power.effects) {
        if (effect.type === 'statMultiplier') {
          this.activeStats.push({ actorKey: context.actorKey, stat: effect.stat, multiplier: effect.multiplier, expiresAt: context.now + Math.max(0, effect.durationSeconds), powerId: power.id });
        } else {
          this.queuedActions.push({ actorKey: context.actorKey, action: effect.action, multiplier: effect.multiplier, powerId: power.id });
        }
      }
      const activation = { powerId: power.id, powerName: power.name, actorKey: context.actorKey, trigger, at: context.now };
      this.activations.push(activation);
      fired.push(activation);
    }
    return fired;
  }

  statMultiplier(actorKey: string, stat: PowerStat, now: number): number {
    this.activeStats = this.activeStats.filter((e) => e.expiresAt > now);
    return this.activeStats.filter((e) => e.actorKey === actorKey && e.stat === stat).reduce((n, e) => n * e.multiplier, 1);
  }

  consumeActionMultiplier(actorKey: string, action: PowerAction): number {
    const matches = this.queuedActions.filter((e) => e.actorKey === actorKey && e.action === action);
    this.queuedActions = this.queuedActions.filter((e) => !(e.actorKey === actorKey && e.action === action));
    return matches.reduce((n, e) => n * e.multiplier, 1);
  }

  reset(): void {
    this.cooldowns.clear();
    this.activeStats = [];
    this.queuedActions = [];
    this.activations.length = 0;
  }
}

/** Fast validation for authoring tools/tests; unknown triggers/effects are excluded by TS types. */
export function validatePowerDefinitions(definitions: readonly PowerDefinition[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const p of definitions) {
    if (!p.id.trim()) errors.push('Power id cannot be blank.');
    if (ids.has(p.id)) errors.push(`Duplicate power id: ${p.id}`);
    ids.add(p.id);
    if (!p.name.trim()) errors.push(`${p.id || '(unnamed power)'}: name cannot be blank.`);
    if (!Number.isFinite(p.cooldownSeconds) || p.cooldownSeconds < 0) errors.push(`${p.id}: cooldownSeconds must be a non-negative number.`);
    if (!p.effects.length) errors.push(`${p.id}: at least one effect is required.`);
    for (const e of p.effects) {
      if (!Number.isFinite(e.multiplier) || e.multiplier <= 0) errors.push(`${p.id}: effect multiplier must be a positive number.`);
      if (e.type === 'statMultiplier' && (!Number.isFinite(e.durationSeconds) || e.durationSeconds <= 0)) errors.push(`${p.id}: stat effect durationSeconds must be positive.`);
    }
  }
  return errors;
}
