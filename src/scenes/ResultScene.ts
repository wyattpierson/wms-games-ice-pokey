import { STORY_RULES } from '../config/storyCampaign';
import { settleSeason } from '../state/metaStore';
import Phaser from 'phaser';
import { getWorldState, resolveWorldZone } from '../core/worldState';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { isChampion, isIslandBoss, recordResult, skipPoach, teamById, syncStarterEvolution } from '../core/campaign';
import { getRun, resetRun, setRun } from '../state/runStore';
import { Menu, MenuButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { addRun, awardMatch, awardOpponentResource, beginNewYear, getMeta, isTournamentDue, recordZoneBossWin, setStoryFlag, updateMeta } from '../state/metaStore';
import { ZONES } from '../config/progression';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { STORY_BEATS, yearEndReflection, yearChampion, yearOpening } from '../config/story';
import { ITEM_IDS } from '../config/progression';
import { retryLastMatch } from '../core/campaign';
import { archiveCareerRun, beginCareerRun, finishCareerMatch, rollbackCareerMatch } from '../state/careerStatsStore';

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
    const finalBoss = data.teamId === 'story-arceus';
    const towerFloor = data.towerFloor ?? getMeta().towerFloor;
    const champion = isChampion(data.teamId);
    const islandBoss = isIslandBoss(data.teamId);
    const team = teamById(data.teamId);
    const state = getRun();
    const firstIslandResult = !state.results[data.teamId];
    // Record the outcome now (idempotent per run: recordResult throws if already faced).
    if (tournament) {
      const resultFlag = `tournament-result-${getMeta().seasonYear}-${data.teamId}-${win ? 'win' : 'loss'}-${getRun().retryUsed ? 'retry' : 'first'}`;
      if (!getMeta().flags.includes(resultFlag)) {
        awardMatch(win, finalBoss, !!getRun().bench?.some(p => p.isStarter));
        setRun({ ...syncStarterEvolution(getRun()), matchInProgress: undefined, gameOver: !win });
        const meta = getMeta();
        if (finalBoss) {
          updateMeta({ story: { ...meta.story, arceusDefeated: win || meta.story.arceusDefeated, arceusAttemptYear: meta.seasonYear } });
        } else if (win) {
          updateMeta({ towerFloor: towerFloor + 1, bestTowerFloor: Math.max(meta.bestTowerFloor, towerFloor + 1),
            bracket: meta.bracket ? { ...meta.bracket, completed: towerFloor + 1 } : null,
            story: { ...meta.story, rivalBeaten: meta.story.rivalBeaten || towerFloor === 0,
              mimikyuKnown: meta.story.mimikyuKnown || towerFloor + 1 >= STORY_RULES.mimikyuRevealAfterRound } });
          if (towerFloor + 1 >= 4) settleSeason(true);
        }
        setStoryFlag(resultFlag);
      }
    } else if (!state.results[data.teamId]) {
      setRun(recordResult(state, data.teamId, win ? 'win' : 'loss'));
      awardMatch(win, champion || islandBoss, !!getRun().bench?.some(p => p.isStarter));
      setRun(syncStarterEvolution(getRun()));
      if (win && islandBoss) {
        updateMeta({ activeIslandId: null });
        if (firstIslandResult) {
          const zone = ZONES.map(z => resolveWorldZone(z.id) || z).find(z => z.bossId === data.teamId);
          if (zone) recordZoneBossWin(zone.id);
        }
      }

      if (!win) { const beat = STORY_BEATS.find(b => b.when === 'run-loss' && (!b.requiresFlag || getMeta().flags.includes(b.requiresFlag)) && (!b.requiresNoFlag || !getMeta().flags.includes(b.requiresNoFlag))); if (beat) setStoryFlag(beat.setFlag || beat.id); }
    }
    const afterResult = getRun();
    const retrySnapshot = afterResult.retrySnapshot;
    const canRetry = !finalBoss && !win && getMeta().unlocked.includes(ITEM_IDS.secondChance) && !afterResult.retryUsed && !!retrySnapshot && retrySnapshot.teamId === data.teamId && retrySnapshot.tournament === tournament;
    const userTeam = getRun().userTeam;
    const lineup = userTeam.players.map(p => ({ name: p.name, sprite: p.sprite, isStarter: p.isStarter, goalie: p.goalie }));
    const winsBeforeEnd = Object.values(getRun().results).filter(r => r === 'win').length;
    if (!win) {
      archiveCareerRun({ outcome: 'loss', teamName: userTeam.name, year: getMeta().seasonYear, lineup, lostTo: team.name,
        score: { for: data.userScore, against: data.opponentScore }, winsBeforeEnd });
      if (!canRetry) finishCareerMatch();
    } else if (champion || (tournament && towerFloor + 1 >= 4)) {
      archiveCareerRun({ outcome: 'victory', teamName: userTeam.name, year: getMeta().seasonYear, lineup,
        score: { for: data.userScore, against: data.opponentScore }, winsBeforeEnd });
      finishCareerMatch();
    } else finishCareerMatch();
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GREEN);

    this.add
      .text(W / 2, 130, win ? (finalBoss ? 'WORLD RESTORED!' : 'VICTORY!') : 'DEFEAT', {
        fontFamily: FONT,
        fontSize: '52px',
        color: hex(win ? THEME.GOLD : THEME.RED),
      })
      .setOrigin(0.5);
    this.add
      .text(
        W / 2, 188,
        finalBoss ? (win ? 'Arceus understands. The world is whole again.' : 'Arceus will be waiting next year.') : tournament ? (win ? (towerFloor + 1 >= 4 ? 'you conquered the year-end tournament' : `tournament round ${towerFloor + 1} won`) : 'your tournament ends here') : (win ? (champion ? 'the tower champion has fallen' : `${islandBoss ? 'island boss defeated: ' : 'you beat '}${team.name}`) : 'the run is over'),
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
    if (finalBoss) note = win ? 'Mimikyu and Arceus are free. Every island is restored.' : 'The final challenge stays unlocked. Prepare your team and return next year.';
    else if (tournament) note = win ? (towerFloor + 1 >= 4 ? 'the tournament is won. A new year awaits.' : 'The bracket advances. Your next opponent awaits.') : 'the tournament is over for this year.';
    else if (win && islandBoss) note = 'Choose your boss reward on the next screen: recruit a Pokémon or claim this island’s unique resource.';
    else if (win && !champion && isTournamentDue() && !getMeta().activeIslandId) note = 'the season has run out. Return to the map; the tower is now open.';
    else if (win && !champion) note = 'choose one player to recruit to your bench. Your active lineup stays intact.';
    else if (win) note = 'first to 3 goals — the tower champion has fallen.';
    else note = canRetry ? 'Your Max Revive can replay this exact match once. It is consumed whether you win or lose the rematch.' : 'every match is a one-shot unless you have an unused Max Revive.';
    this.add.text(W / 2, 348, note, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.GRAY) }).setOrigin(0.5);

    const buttons: MenuButton[] = [];
    if (finalBoss) {
      buttons.push(new MenuButton(this, W / 2, 452, win ? 'RESTORE THE WORLD →' : 'NEXT YEAR · TRY AGAIN →', { color: THEME.GOLD, onSelect: () => win ? this.scene.start('VictoryScene') : this.startNextYearAfterLoss() }));
    } else if (tournament) {
      if (win && towerFloor + 1 >= 4) {
        buttons.push(new MenuButton(this, W / 2, 452, 'TOURNAMENT CHAMPION →', { color: THEME.GOLD, onSelect: () => { const story=yearChampion(getMeta().seasonYear); if(!getMeta().flags.includes(story.flag)) this.scene.start('DialogueScene',{nextScene:'VictoryScene',lines:story.lines,flag:story.flag}); else this.scene.start('VictoryScene'); } }));
      } else if (win) {
        buttons.push(new MenuButton(this, W / 2, 452, 'NEXT ROUND →', { color: THEME.GREEN, onSelect: () => this.scene.start('BattleTowerScene') }));
      } else {
        if (canRetry) buttons.push(new MenuButton(this, W / 2, 420, 'USE MAX REVIVE · RETRY MATCH', { color: THEME.GOLD, onSelect: () => this.retryMatch(data.teamId) }));
        buttons.push(new MenuButton(this, W / 2, canRetry ? 480 : 452, 'END YEAR · NEW RUN →', { color: THEME.GREEN, onSelect: () => this.endTournamentYear(data.teamId) }));
      }
    } else if (win && islandBoss) {
      buttons.push(new MenuButton(this, W / 2, 452, 'CHOOSE BOSS REWARD →', {
        color: THEME.GREEN,
        onSelect: () => this.scene.start('PoachScene', { teamId: data.teamId }),
      }));
    } else if (win && !champion && isTournamentDue() && !getMeta().activeIslandId) {
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
        new MenuButton(this, W / 2, 560, 'TAKE 3 BP INSTEAD', {
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
      if (canRetry) buttons.push(new MenuButton(this, W / 2, 414, 'USE MAX REVIVE · RETRY MATCH', { color: THEME.GOLD, onSelect: () => this.retryMatch(data.teamId) }));
      buttons.push(
        new MenuButton(this, W / 2, canRetry ? 474 : 452, 'NEW RUN →', {
          color: THEME.GREEN,
          onSelect: () => this.startNextYearAfterLoss(),
        }),
        new MenuButton(this, W / 2, canRetry ? 528 : 506, 'TITLE SCREEN', {
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



  /** Finish the year with a reflection beat before beginning the next season. */
  private startNextYearAfterLoss(): void {
    const reflection = yearEndReflection(getWorldState());
    if (reflection && !getMeta().flags.includes(reflection.flag)) {
      this.scene.start('DialogueScene', {
        nextScene: 'GameOverScene',
        nextData: { advanceYear: true },
        lines: reflection.lines,
        flag: reflection.flag,
      });
      return;
    }
    beginNewYear();
    resetRun();
    addRun();
    const freshRun = getRun();
    beginCareerRun(freshRun.userTeam.name, getMeta().seasonYear, freshRun.userTeam.players.map(p => ({ name: p.name, sprite: p.sprite, isStarter: p.isStarter, goalie: p.goalie })));
    const intro = yearOpening(getMeta().seasonYear, getWorldState());
    this.scene.start('DialogueScene', { nextScene: 'ZoneSelectScene', lines: intro.lines, flags: intro.flags });
  }

  private retryMatch(teamId: string): void {
    const current = getRun();
    const snapshot = current.retrySnapshot;
    if (!snapshot || snapshot.teamId !== teamId || current.retryUsed) return;
    rollbackCareerMatch();
    let next;
    try { next = retryLastMatch(current); } catch { return; }
    setRun(next);
    this.scene.start('GameScene', {
      userTeam: next.userTeam,
      opponent: teamById(snapshot.teamId),
      level: snapshot.level,
      tournament: snapshot.tournament,
      towerFloor: snapshot.towerFloor,
    });
  }

  private endTournamentYear(teamId: string): void {
    const reflection = yearEndReflection(getWorldState());
    const flags = getMeta().flags;
    if (reflection && !flags.includes(reflection.flag)) {
      this.scene.start('DialogueScene', {
        nextScene: 'GameOverScene',
        nextData: { reason: 'loss', teamId },
        lines: reflection.lines,
        flag: reflection.flag,
      });
      return;
    }
    this.scene.start('GameOverScene', { reason: 'loss', teamId });
  }

  shutdown(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.confirmDialog?.destroy(); this.confirmDialog = null;
  }
}
