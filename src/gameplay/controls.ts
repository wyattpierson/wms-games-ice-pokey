import Phaser from 'phaser';
import { ACTION_KEYS, MOVE_KEYS, type Action } from '../config/bindings';
import { norm, v, type Vec2 } from '../core/vec2';

/** Reads the keyboard; all key names come from config/bindings.ts. */
export class Controls {
  private move: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key[]>;
  private actions: Record<Action, Phaser.Input.Keyboard.Key[]>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.move = {
      up: MOVE_KEYS.up.map((c) => kb.addKey(c)),
      down: MOVE_KEYS.down.map((c) => kb.addKey(c)),
      left: MOVE_KEYS.left.map((c) => kb.addKey(c)),
      right: MOVE_KEYS.right.map((c) => kb.addKey(c)),
    };
    this.actions = {
      pass: ACTION_KEYS.pass.map((c) => kb.addKey(c)),
      shoot: ACTION_KEYS.shoot.map((c) => kb.addKey(c)),
      spin: ACTION_KEYS.spin.map((c) => kb.addKey(c)),
      crossover: ACTION_KEYS.crossover.map((c) => kb.addKey(c)),
      deke: ACTION_KEYS.deke.map((c) => kb.addKey(c)),
    };
  }

  /** Normalized input direction, or (0,0) when nothing is pressed. */
  direction(): Vec2 {
    const d = v();
    if (this.move.up.some((k) => k.isDown)) d.y -= 1;
    if (this.move.down.some((k) => k.isDown)) d.y += 1;
    if (this.move.left.some((k) => k.isDown)) d.x -= 1;
    if (this.move.right.some((k) => k.isDown)) d.x += 1;
    return norm(d);
  }

  justPressed(a: Action): boolean {
    return this.actions[a].some((k) => Phaser.Input.Keyboard.JustDown(k));
  }

  held(a: Action): boolean {
    return this.actions[a].some((k) => k.isDown);
  }

  justReleased(a: Action): boolean {
    return this.actions[a].some((k) => Phaser.Input.Keyboard.JustUp(k));
  }
}
