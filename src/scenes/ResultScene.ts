import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { isChampion, isIslandBoss, recordResult, skipPoach, teamById, syncStarterEvolution } from '../core/campaign';
import { getRun, resetRun, setRun } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { awardIslandResource, awardMatch, awardOpponentResource, beginNewYear, getMeta, isTournamentDue, setStoryFlag, updateMeta } from '../state/metaStore';
import { TOWER_STAGES, ZONES } from '../config/progression';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { STORY_BEATS, bossVictory, yearChampion, yearOpening } from '../config/story';

export interface ResultData {
  teamId: string;
  userScore: number;
  opponentScore: number;
  tournament?: boolean;
  towerFloor?: number;
}

export class ResultScene extends Phaser.Scene {
  private menu!: Menu;
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  private confirmDialog: ConfirmDialog | null = null;

  constructor() {
    super('ResultScene');
  }

  create(data: ResultData): void {
    wireShutdown(this);
    const W = GAME_WIDTH;
    const win = data.userScore > data.opponentScore;
    const tournament = data.tournament === true;
    const towerFloor = data.towerFloor ?? getMeta().towerFloor;
    const champion = isChampion(data.teamId);
    const islandBoss = isIslandBoss(data.teamId);
    const team = teamById(data.teamId);
    const state = getRun();
    const firstIslandResult = !state.results[data.teamId];
    // Record the outcome now (idempotent per run: recordResult throws if already faced).
    if (tournament) {
      awardMatch(win, false, !!getRun().bench?.some(p => p.isStarter));
      setRun(syncStarterEvolution(getRun()));
      // Tournament results are tracked in meta, not campaign results. Clear the
      // in-progress marker so returning to the map or closing the game isn't a false forfeit.
      setRun({ ...getRun(), matchInProgress: undefined });
      if (win) updateMeta({ towerFloor: towerFloor + 1 });
    } else if (!state.results[data.teamId]) {
      setRun(recordResult(state, data.teamId, win ? 'win' : 'loss'));
      awardMatch(win, champion || islandBoss, !!getRun().bench?.some(p => p.isStarter));
      setRun(syncStarterEvolution(getRun()));

      if (!win) { const beat = STORY_BEATS.find(b => b.when === 'run-loss' && (!b.requiresFlag || getMeta().flags.includes(b.requiresFlag)) && (!b.requiresNoFlag || !getMeta().flags.includes(b.requiresNoFlag))); if (beat) setStoryFlag(beat.setFlag || beat.id); }
    }
    const userTeam = getRun().userTeam;
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GREEN);

    this.add
      .text(W / 2, 130, win ? 'VICTORY!' : 'DEFEAT', {
        fontFamily: FONT,
        fontSize: '52px',
        color: hex(win ? THEME.GOLD : THEME.RED),
      })
      .setOrigin(0.5);
    this.add
      .text(
        W / 2, 188,
        tournament ? (win ? (towerFloor + 1 >= TOWER_STAGES.length ? 'you conquered the year-end tournament' : `tower floor ${towerFloor + 1} cleared`) : 'your tournament ends here') : (win ? (champion ? 'the tower champion has fallen' : `${islandBoss ? 'island boss defeated: ' : 'you beat '}${team.name}`) : 'the run is over'),
        { fontFamily: FONT, fontSize: '17px', color: hex(THEME.DIM) },
      )
      .setOrigin(0.5);

    this.add.rectangle(W / 2, 272, 560, 96, FILL.plate, 1).setStrokeStyle(2, THEME.DIM);
    this.add
      .text(W / 2, 272, `${userTeam.name}  ${data.userScore} — ${data.opponentScore}  ${team.name}`, {
        fontFamily: FONT,
        fontSize: '24px',
        color: hex(THEME.WHITE),
      })
      .setOrigin(0.5);

    let note = '';
    if (tournament) note = win ? (towerFloor + 1 >= TOWER_STAGES.length ? 'the tournament is won. A new year awaits.' : 'the next floor is harder. Keep climbing.') : 'the tournament is over for this year.';
    else if (win && islandBoss) note = 'Choose your reward: claim this island’s unique resource, or recruit one Pokémon from the boss team.';
    else if (win && !champion && isTournamentDue()) note = 'the season has run out. Return to the map; the tower is now open.';
    else if (win && !champion) note = 'choose one player to recruit to your bench. Your active lineup stays intact.';
    else if (win) note = 'first to 3 goals — the tower champion has fallen.';
    else note = 'every match is a one-shot: lose and the run ends.';
    this.add.text(W / 2, 348, note, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.GRAY) }).setOrigin(0.5);

    const buttons: MenuButton[] = [];
    if (tournament) {
      if (win && towerFloor + 1 >= TOWER_STAGES.length) {
        buttons.push(new MenuButton(this, W / 2, 452, 'TOURNAMENT CHAMPION →', { color: THEME.GOLD, onSelect: () => { const story=yearChampion(getMeta().seasonYear); if(!getMeta().flags.includes(story.flag)) this.scene.start('DialogueScene',{nextScene:'VictoryScene',lines:story.lines,flag:story.flag}); else this.scene.start('VictoryScene'); } }));
      } else if (win) {
        buttons.push(new MenuButton(this, W / 2, 452, 'NEXT FLOOR →', { color: THEME.GREEN, onSelect: () => this.scene.start('BattleTowerScene') }));
      } else {
        buttons.push(new MenuButton(this, W / 2, 452, 'END YEAR · NEW RUN →', { color: THEME.GREEN, onSelect: () => this.scene.start('GameOverScene', { reason: 'loss', teamId: data.teamId }) }));
      }
    } else if (win && islandBoss) {
      buttons.push(
        new MenuButton(this, W / 2, 432, 'TAKE ISLAND RESOURCE', { color: THEME.GOLD, onSelect: () => this.confirmIslandResource(data.teamId, firstIslandResult) }),
        new MenuButton(this, W / 2, 490, 'RECRUIT A BOSS POKÉMON', { color: THEME.GREEN, onSelect: () => this.scene.start('PoachScene', { teamId: data.teamId }) }),
      );
    } else if (win && !champion && isTournamentDue()) {
      buttons.push(new MenuButton(this, W / 2, 452, 'SEASON OVER · RETURN TO MAP →', { color: THEME.GREEN, onSelect: () => { setRun(skipPoach(getRun())); this.scene.start('ZoneSelectScene'); } }));
    } else if (win && !champion) {
      buttons.push(
        new MenuButton(this, W / 2, 452, 'RECRUIT TO BENCH →', {
          color: THEME.GREEN,
          onSelect: () => this.scene.start('PoachScene', { teamId: data.teamId }),
        }),
        new MenuButton(this, W / 2, 506, 'SKIP POACH (team consumed)', {
          color: THEME.GRAY,
          size: 18,
          onSelect: () => {
            setRun(skipPoach(getRun()));
            this.scene.start(isTournamentDue() ? 'ZoneSelectScene' : 'OpponentSelectScene');
          },
        }),
        new MenuButton(this, W / 2, 560, 'TAKE 3 CREDITS INSTEAD', {
          color: THEME.GOLD,
          size: 17,
          onSelect: () => {
            awardOpponentResource();
            setRun(skipPoach(getRun()));
            this.scene.start(isTournamentDue() ? 'ZoneSelectScene' : 'OpponentSelectScene');
          },
        }),
      );
    } else if (win) {
      buttons.push(
        new MenuButton(this, W / 2, 452, 'CONTINUE →', {
          color: THEME.GREEN,
          onSelect: () => this.scene.start('VictoryScene'),
        }),
      );
    } else {
      buttons.push(
        new MenuButton(this, W / 2, 452, 'NEW RUN →', {
          color: THEME.GREEN,
          onSelect: () => {
            resetRun();
            beginNewYear();
            const intro=yearOpening(getMeta().seasonYear);
            this.scene.start('DialogueScene',{nextScene:'ZoneSelectScene',lines:intro.lines,flag:intro.flag});
          },
        }),
        new MenuButton(this, W / 2, 506, 'TITLE SCREEN', {
          color: THEME.GRAY,
          size: 18,
          onSelect: () => this.scene.start('TitleScene'),
        }),
      );
    }
    this.menu = new Menu(this, buttons);

    const onKey = (e: KeyboardEvent) => {
      if (this.confirmDialog) return;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          this.menu.moveUp();
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.menu.moveDown();
          break;
        case 'Enter':
        case 'Space':
          this.menu.select();
          break;
      }
    };
    this.onKey = onKey;
    window.addEventListener('keydown', onKey);
  }

  private confirmIslandResource(teamId: string, firstIslandResult: boolean): void {
    if (this.confirmDialog) return;
    const zone = ZONES.find(z => z.bossId === teamId) || ZONES.find(z => z.id === getMeta().selectedZoneId) || ZONES[0];
    this.confirmDialog = new ConfirmDialog(
      this,
      `CLAIM ${zone.resourceName.toUpperCase()}?`,
      `Gain 1 ${zone.resourceName}. This commits the island boss reward and skips recruiting a Pokémon from this boss team.`,
      'CLAIM RESOURCE',
      () => {
        this.confirmDialog?.destroy(); this.confirmDialog = null;
        if (firstIslandResult && zone.bossId === teamId) awardIslandResource(zone.id);
        setRun(skipPoach(getRun()));
        const flag = `story-year-${getMeta().seasonYear}-boss-${zone.id}`;
        if (!getMeta().flags.includes(flag)) this.scene.start('DialogueScene', { nextScene: 'ZoneSelectScene', lines: bossVictory(zone.name, zone.resourceName, getMeta().seasonYear), flag });
        else this.scene.start('ZoneSelectScene');
      },
      () => { this.confirmDialog?.destroy(); this.confirmDialog = null; },
    );
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.confirmDialog?.destroy(); this.confirmDialog = null;
  }
}
