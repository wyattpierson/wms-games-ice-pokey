export interface CoachContext {
  carrying: boolean;
  charging: boolean;
  pressure: number;
  incomingPass: boolean;
  enemyMove: 'spin' | 'deke' | null;
  closeCarrier: boolean;
}
const HINTS = {
  move: 'ARROWS / WASD move · Follow the gold arrow above your Pokémon. Your goal is on the RIGHT.',
  possession: 'SPACE passes to a partner. Control follows the pass—keep moving with the receiver.',
  charge: 'UP / DOWN aims while charging. Release SHIFT when the goalie’s gold ring pulses.',
  pressure: 'Pressure is building! SPACE passes to safety; E spins and F dekes away from defenders.',
  defense: 'Without the puck, SPACE switches defenders. Follow the gold arrow to find your Pokémon.',
  check: 'SHIFT plants a check. Meet the carrier in your blue ring to bump them and add pressure.',
  spin: 'Incoming SPIN: stand in front and press E when the orange ring pulses.',
  deke: 'Incoming DEKE: stand in front and press F when the yellow diamond pulses.',
  receive: 'A pass is arriving! Press SHIFT as the cyan ring closes to fire an instant one-timer.',
} as const;
type HintId = keyof typeof HINTS;
export interface CoachHint { id: HintId; text: string }

/** Read-only coaching: never consumes gameplay inputs or changes the simulation. */
export class ContextCoach {
  private seen: Set<string>;
  private elapsed = 0;
  private nextAt = 0;
  private until = 0;
  private current: CoachHint | null = null;
  constructor(seen: readonly string[] = [], private readonly onShown: (id: string) => void = () => {}) {
    this.seen = new Set(seen);
  }
  private relevant(id: HintId, c: CoachContext): boolean {
    switch (id) {
      case 'move': return true;
      case 'possession': return c.carrying && !c.charging;
      case 'charge': return c.carrying && c.charging;
      case 'pressure': return c.carrying && c.pressure > 0.35;
      case 'defense': return !c.carrying && !c.incomingPass;
      case 'check': return !c.carrying && c.closeCarrier && !c.enemyMove && !c.incomingPass;
      case 'spin': case 'deke': return !c.carrying && c.enemyMove === id;
      case 'receive': return c.incomingPass;
    }
  }
  update(c: CoachContext, dt: number): CoachHint | null {
    this.elapsed += dt;
    if (this.current && (this.elapsed >= this.until || !this.relevant(this.current.id, c))) this.current = null;
    const urgent: HintId[] = ['pressure', 'spin', 'deke', 'receive'];
    const immediate = urgent.find(id => !this.seen.has(id) && this.relevant(id, c));
    const candidates: HintId[] = ['move', 'charge', 'check', 'possession', 'defense'];
    const id = immediate ?? (!this.current && this.elapsed >= this.nextAt
      ? candidates.find(id => !this.seen.has(id) && this.relevant(id, c)) : undefined);
    if (id) {
      this.current = { id, text: HINTS[id] };
      this.seen.add(id);
      this.onShown(id);
      this.until = this.elapsed + 6;
      this.nextAt = this.until + 3;
    }
    return this.current;
  }
}
