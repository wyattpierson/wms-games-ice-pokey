import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/rink';
import { OPPONENTS, USER_TEAM } from './config/teams';
import { GameScene, readOpponentParam } from './scenes/GameScene';

// Dev deep-link: ?renderer=canvas forces the canvas renderer (for pixel tests).
const params = new URLSearchParams(window.location.search);
const forcedRenderer = params.get('renderer');

/**
 * Loads the Pokémon sprites (96×96 front sprites from the PokeAPI sprite
 * mirror). If the load fails (offline dev, network blocked) the game still
 * starts — players fall back to placeholder discs (see Player.ts).
 */
class Preloader extends Phaser.Scene {
  private launched = false;

  constructor() {
    super('Preloader');
  }

  // Files MUST be queued in preload() — Phaser only runs the load step once,
  // before create(). Queuing in create() sits in the queue forever and the
  // game never starts (this was the blank-screen bug).
  preload(): void {
    const seen = new Set<number>();
    for (const t of [USER_TEAM, ...OPPONENTS]) {
      for (const p of t.players) seen.add(p.sprite);
    }
    for (const id of seen) {
      this.load.image(
        `pkm-${id}`,
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
      );
    }
    // Failed loads (404/offline) just warn; the load step still completes and
    // players fall back to placeholder discs. A plain setTimeout is the hang
    // failsafe — a request that neither resolves nor 404s must not block the
    // game forever (the scene clock can't run until create() does).
    this.load.on('loaderror', (f: any) => console.warn(`[sprites] failed to load: ${f.url}`));
    setTimeout(() => this.launch(), 4000);
  }

  create(): void {
    this.launch();
  }

  private launch(): void {
    if (this.launched) return;
    this.launched = true;
    this.scene.start('GameScene', { opponentIndex: readOpponentParam() });
  }
}

const game = new Phaser.Game({
  // Phaser's config key is `type` (not `renderer`). CANVAS lets tests sample pixels.
  ...(forcedRenderer ? { type: forcedRenderer === 'canvas' ? Phaser.CANVAS : Phaser.WEBGL } : { type: Phaser.AUTO }),
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b0f16',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Preloader, GameScene],
});

// Dev debug hook (used by /tmp/debug.mjs; harmless in prod).
;(window as any).__game = game;
