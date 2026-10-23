import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { TOWER_STAGES } from '../config/progression';
import { ALL_TEAMS } from '../config/teams';
import { startMatch } from '../core/campaign';
import { getRun, setRun } from '../state/runStore';
import { getMeta, isTournamentDue } from '../state/metaStore';
import { resolveWorldZone } from '../core/worldState';
import { ZONES } from '../config/progression';
import { towerOpening } from '../config/story';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';

export class BattleTowerScene extends Phaser.Scene {
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  constructor() { super('BattleTowerScene'); }

  create(): void {
    wireShutdown(this);
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.RED);
    const meta = getMeta();
    this.add.text(GAME_WIDTH / 2, 48, 'BATTLE TOWER', { fontFamily: FONT, fontSize: '32px', color: hex(THEME.GOLD) }).setOrigin(.5);
    this.add.text(GAME_WIDTH / 2, 86, `YEAR ${meta.seasonYear} · ${meta.daysRemaining} DAYS REMAINING`, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.RED) }).setOrigin(.5);

    if (isTournamentDue()) {
      const clearedBosses = ZONES.map(base => resolveWorldZone(base.id) || base).filter(zone => getRun().results[zone.bossId] === 'win').length;
      const story = towerOpening(meta.seasonYear, clearedBosses);
      if(!meta.flags.includes(story.flag)){ this.scene.start('DialogueScene',{nextScene:'BattleTowerScene',lines:story.lines,flag:story.flag}); return; }
    }

    if (!isTournamentDue()) {
      this.add.text(GAME_WIDTH / 2, 245, 'THE GATES ARE SEALED', { fontFamily: FONT, fontSize: '27px', color: hex(THEME.RED) }).setOrigin(.5);
      this.add.text(GAME_WIDTH / 2, 292, 'The Battle Tower opens when the year ends. Spend your remaining days wisely.', { fontFamily: FONT, fontSize: '15px', color: hex(THEME.DIM), align: 'center', wordWrap: { width: 780 } }).setOrigin(.5);
      new TextButton(this, GAME_WIDTH / 2, 390, 'BACK TO THE ISLANDS', { color: THEME.BLUE, minWidth: 250, onSelect: () => this.scene.start('ZoneSelectScene') });
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') this.scene.start('ZoneSelectScene'); };
      this.onKey = onKey; window.addEventListener('keydown', onKey); return;
    }

    const floor = Math.min(meta.towerFloor, TOWER_STAGES.length - 1);
    const stage = TOWER_STAGES[floor];
    this.add.text(GAME_WIDTH / 2, 120, 'The year-end tournament. One continuous ladder. No opponent selection.', { fontFamily: FONT, fontSize: '14px', color: hex(THEME.DIM) }).setOrigin(.5);
    TOWER_STAGES.forEach((s, i) => {
      const x = 150 + (i % 6) * 180, y = 195 + Math.floor(i / 6) * 105;
      const active = i === floor, cleared = i < meta.towerFloor;
      this.add.rectangle(x, y, 150, 72, FILL.plate, 1).setStrokeStyle(2, active ? THEME.GOLD : cleared ? THEME.GREEN : THEME.DIM);
      this.add.text(x, y - 9, cleared ? '✓ CLEARED' : s.name, { fontFamily: FONT, fontSize: '14px', color: hex(cleared ? THEME.GREEN : active ? THEME.GOLD : THEME.DIM) }).setOrigin(.5);
      this.add.text(x, y + 15, `THREAT ${Math.round(s.difficulty * 100)}%`, { fontFamily: FONT, fontSize: '11px', color: hex(THEME.DIM) }).setOrigin(.5);
    });
    const team = ALL_TEAMS.find(t => t.id === stage.opponentId)!;
    this.add.text(GAME_WIDTH / 2, 420, `NEXT: ${stage.name} · ${team.name} · THREAT ${Math.round(stage.difficulty * 100)}%`, { fontFamily: FONT, fontSize: '16px', color: hex(THEME.WHITE) }).setOrigin(.5);
    const launch = () => {
      // Keep this year's island clears and recruitment history intact. Tower fights
      // use their own stable team IDs and do not consume or rewrite island results.
      const current = getRun();
      const state = startMatch(current, team.id, { level: stage.difficulty, tournament: true, towerFloor: floor });
      setRun(state);
      this.scene.start('GameScene', { userTeam: state.userTeam, opponent: team, level: stage.difficulty, towerFloor: floor, tournament: true });
    };
    new TextButton(this, GAME_WIDTH / 2, 485, 'CLIMB THE TOWER', { color: THEME.GREEN, minWidth: 250, onSelect: launch });
    new TextButton(this, GAME_WIDTH / 2, 545, 'BACK TO ZONES', { color: THEME.GRAY, minWidth: 220, onSelect: () => this.scene.start('ZoneSelectScene') });
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') this.scene.start('ZoneSelectScene'); if (e.code === 'Enter' || e.code === 'Space') launch(); };
    this.onKey = onKey; window.addEventListener('keydown', onKey);
  }
  shutdown(): void { if (this.onKey) window.removeEventListener('keydown', this.onKey); this.onKey = null; }
}
