import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { startMatch, teamById } from '../core/campaign';
import { getRun, setRun } from '../state/runStore';
import { getMeta, isTournamentDue, updateMeta } from '../state/metaStore';
import { towerOpening, pendingStory, arceusOpening } from '../config/story';
import { STORY_CHARACTERS } from '../config/storyCampaign';
import { createBracket, bracketOpponent, ROUND_NAMES, ROUND_DIFFICULTY } from '../core/tournament';
import { arceusAvailable, checkCatastrophe } from '../core/storyCampaign';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

export class BattleTowerScene extends Phaser.Scene {
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  constructor() { super('BattleTowerScene'); }
  create(data?: { finalBoss?: boolean }): void {
    wireShutdown(this);
    let meta = getMeta();
    if (data?.finalBoss) {
      if (!arceusAvailable(meta.story, meta.seasonYear)) { this.scene.start('ZoneSelectScene'); return; }
      const flag = 'story-arceus-challenge';
      if (!meta.flags.includes(flag)) { this.scene.start('DialogueScene', { lines: arceusOpening(), flag, nextScene: 'BattleTowerScene', nextData: data }); return; }
      const state = startMatch(getRun(), 'story-arceus', { level: 1, tournament: true, towerFloor: 4 });
      setRun(state);
      this.scene.start('GameScene', { userTeam: state.userTeam, opponent: teamById('story-arceus'), level: 1, tournament: true, towerFloor: 4 });
      return;
    }
    if (!isTournamentDue()) { this.scene.start('ZoneSelectScene'); return; }
    if (meta.story.settledYear === meta.seasonYear) { this.scene.start(meta.towerFloor >= 4 ? 'VictoryScene' : 'GameOverScene'); return; }
    if (!meta.bracket || meta.bracket.year !== meta.seasonYear) {
      updateMeta({ bracket: createBracket(meta.seasonYear, meta.story.rivalBeaten), towerFloor: 0 });
    }
    updateMeta({ activeIslandId: null, story: checkCatastrophe({ ...getMeta().story, towerVisited: true }) });
    meta = getMeta();
    const beat = pendingStory() || (!meta.flags.includes(`story-year-${meta.seasonYear}-tower-open`) ? towerOpening(meta.seasonYear, 0) : undefined);
    if (beat) { this.scene.start('DialogueScene', { nextScene: 'BattleTowerScene', lines: beat.lines, flag: beat.flag }); return; }
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GOLD);
    this.add.text(GAME_WIDTH / 2, 40, `YEAR ${meta.seasonYear} · CHAMPIONSHIP`, { fontFamily: FONT, fontSize: '28px', color: hex(THEME.GOLD) }).setOrigin(.5);
    const bracket = meta.bracket!;
    const floor = bracket.completed;
    const label = (id: string) => id === 'player' ? getRun().userTeam.name : id === 'story-villain' && !meta.story.catastrophe ? '???' : id === 'story-rival' ? STORY_CHARACTERS.rival.name : teamById(id).name;
    const graphics = this.add.graphics().lineStyle(1, 0x52657b);
    // Full 16 → 8 → 4 → 2 bracket; outcomes are revealed as the player advances.
    bracket.rounds.forEach((round, r) => {
      const x = 130 + r * 280;
      this.add.text(x, 82, ROUND_NAMES[r], { fontFamily: FONT, fontSize: '13px', color: hex(r === floor ? THEME.GOLD : THEME.DIM) }).setOrigin(.5);
      const spacing = 440 / round.length;
      round.forEach((id, i) => {
        const y = 110 + spacing * (i + .5);
        const visible = r <= floor;
        const text = visible ? label(id) : '—';
        this.add.rectangle(x, y, 236, 24, FILL.plate).setStrokeStyle(1, visible && id === 'player' ? THEME.GOLD : 0x52657b);
        this.add.text(x, y, text, { fontFamily: FONT, fontSize: '11px', color: hex(visible && id === 'player' ? THEME.GOLD : THEME.WHITE) }).setOrigin(.5);
        if (r < 3) {
          const nextY = 110 + spacing * 2 * (Math.floor(i / 2) + .5);
          graphics.lineBetween(x + 118, y, x + 140, y);
          graphics.lineBetween(x + 140, y, x + 140, nextY);
          graphics.lineBetween(x + 140, nextY, x + 162, nextY);
        }
      });
    });
    this.add.text(GAME_WIDTH / 2, 580, `NEXT: ${ROUND_NAMES[floor]} · ${label(bracketOpponent(bracket))}`, { fontFamily: FONT, fontSize: '17px', color: hex(THEME.GOLD) }).setOrigin(.5);
    let launched = false;
    const launch = () => {
      if (launched) return; launched = true;
      const team = teamById(bracketOpponent(bracket));
      const state = startMatch(getRun(), team.id, { level: ROUND_DIFFICULTY[floor], tournament: true, towerFloor: floor });
      setRun(state);
      this.scene.start('GameScene', { userTeam: state.userTeam, opponent: team, level: ROUND_DIFFICULTY[floor], towerFloor: floor, tournament: true });
    };
    new TextButton(this, GAME_WIDTH / 2, 625, 'PLAY NEXT ROUND', { color: THEME.GREEN, minWidth: 250, onSelect: launch });
    this.onKey = e => { if (e.code === 'Enter' || e.code === 'Space') launch(); };
    window.addEventListener('keydown', this.onKey);
  }
  shutdown(): void { if (this.onKey) window.removeEventListener('keydown', this.onKey); this.onKey = null; }
}
