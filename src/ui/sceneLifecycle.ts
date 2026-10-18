import Phaser from 'phaser';

/**
 * Phaser 3.90 does NOT automatically invoke a `shutdown()` method defined on a
 * Scene subclass — stopping a scene only emits the 'shutdown' event
 * (Phaser.Scenes.Events#SHUTDOWN). Wire a scene's user-defined shutdown() to that
 * event so window-level key listeners and other non-Phaser resources are reliably
 * released when the scene stops.
 *
 * Call from create(). Safe to call every time: it re-arms itself after each stop.
 */
export function wireShutdown(scene: Phaser.Scene): void {
  scene.events.once('shutdown', () => {
    (scene as Phaser.Scene & { shutdown?: () => void }).shutdown?.();
    wireShutdown(scene);
  });
}
