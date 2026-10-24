import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/rink';
import { ALL_TEAMS, USER_TEAM } from './config/teams';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { OpponentSelectScene } from './scenes/OpponentSelectScene';
import { PoachScene } from './scenes/PoachScene';
import { ResultScene } from './scenes/ResultScene';
import { TitleScene } from './scenes/TitleScene';
import { VictoryScene } from './scenes/VictoryScene';
import { StarterSelectScene } from './scenes/StarterSelectScene';
import { ZoneSelectScene } from './scenes/ZoneSelectScene';
import { StoreScene } from './scenes/StoreScene';
import { LineupScene } from './scenes/LineupScene';
import { BattleTowerScene } from './scenes/BattleTowerScene';
import { DialogueScene } from './scenes/DialogueScene';
import { BalanceLabScene } from './scenes/BalanceLabScene';
import { StatsGuideScene } from './scenes/StatsGuideScene';
import { CareerStatsScene } from './scenes/CareerStatsScene';

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
    // Illustrated 16-bit archipelago artwork used by the actual overworld.
    this.load.image('overworld-regions', new URL('./assets/overworld-regions-v2.png', import.meta.url).href);
    // Every roster the campaign can ever show: the starting team plus all
    // campaign teams (poached players always have a sprite loaded).
    const seen = new Set<number>();
    for (const t of [USER_TEAM, ...ALL_TEAMS]) {
      for (const p of t.players) seen.add(p.sprite);
    }
    for (const id of [246, 247, 248, 443, 444, 445, 371, 372, 373, ...seen, 26, 55, 10049, 10058, 10089, 10169, 10170, 10171]) {
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
    this.scene.start('TitleScene');
  }
}

const game = new Phaser.Game({
  // Phaser's config key is `type` (not `renderer`). CANVAS lets tests sample pixels.
  ...(forcedRenderer ? { type: forcedRenderer === 'canvas' ? Phaser.CANVAS : Phaser.WEBGL } : { type: Phaser.AUTO }),
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#091522',
  pixelArt: true,
  render: { roundPixels: true, antialias: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [
    Preloader,
    TitleScene,
    StatsGuideScene,
    CareerStatsScene,
    StarterSelectScene,
    DialogueScene,
    BalanceLabScene,
    ZoneSelectScene,
    StoreScene,
    LineupScene,
    BattleTowerScene,
    OpponentSelectScene,
    GameScene,
    ResultScene,
    PoachScene,
    VictoryScene,
    GameOverScene,
  ],
});

// Dev debug hook (used by /tmp/debug.mjs; harmless in prod).
;(window as any).__game = game;
