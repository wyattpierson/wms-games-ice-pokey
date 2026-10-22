import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import type { Team } from '../config/teams';
import { POWER_DEFINITIONS } from '../config/powers';
import { STARTER_EVOLUTIONS } from '../config/progression';
import { SHOP_OFFERS } from '../config/progression';
import { getMeta } from '../state/metaStore';
import { getRun } from '../state/runStore';
import { overall } from '../core/poach';
import { ConfirmDialog } from './ConfirmDialog';
import { Menu, MenuButton } from './menu';
import { FILL, FONT, THEME, hex } from './theme';

type PausePage = 'menu' | 'controls' | 'team';

/** View-only pause pages for live campaign matches. Match simulation stops while visible. */
export class PauseOverlay {
  visible = false;
  get dialogOpen(): boolean { return this.dialog !== null; }

  private mainGroup: Phaser.GameObjects.Container;
  private controlsGroup: Phaser.GameObjects.Container;
  private teamGroup: Phaser.GameObjects.Container;
  private menu: Menu;
  private dialog: ConfirmDialog | null = null;
  private bindings: [string, () => void][] = [];
  private page: PausePage = 'menu';

  constructor(
    private scene: Phaser.Scene,
    opponentName: string,
    userTeam: Team,
    powerIds: string[],
    campaignMode: boolean,
    private onResume: () => void,
    private onForfeit: () => void,
    private onQuit: () => void,
  ) {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const mainDim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setInteractive();
    const mainShadow = scene.add.rectangle(W / 2 + 5, H / 2 + 5, 590, 510, 0x000000, 0.5);
    const mainPanel = scene.add.rectangle(W / 2, H / 2, 590, 510, FILL.panel, 1).setStrokeStyle(3, THEME.GOLD);
    const mainInset = scene.add.rectangle(W / 2, H / 2, 576, 496, 0x000000, 0).setStrokeStyle(1, 0x34465a, 1);
    const mainTitle = scene.add.text(W / 2, 120, 'PAUSED', { fontFamily: FONT, fontSize: '42px', color: hex(THEME.GOLD), fontStyle: 'bold' }).setOrigin(.5);
    const mainSub = scene.add.text(W / 2, 160, `vs ${opponentName}`, { fontFamily: FONT, fontSize: '15px', color: hex(THEME.DIM) }).setOrigin(.5);
    const resume = new MenuButton(scene, W / 2, 226, 'RESUME MATCH', { color: THEME.GREEN, onSelect: () => this.onResume() });
    const controls = new MenuButton(scene, W / 2, 281, 'VIEW CONTROLS  (C)', { color: THEME.BLUE, size: 20, onSelect: () => this.showPage('controls') });
    const team = new MenuButton(scene, W / 2, 333, 'TEAM, STARTER & POWERS  (I)', { color: THEME.GOLD, size: 20, onSelect: () => this.showPage('team') });
    const forfeit = new MenuButton(scene, W / 2, 389, 'FORFEIT RUN  (F)', { color: THEME.RED, size: 20, onSelect: () => this.confirmForfeit() });
    const quit = new MenuButton(scene, W / 2, 438, 'QUIT TO TITLE  (Q)', { color: THEME.GRAY, size: 20, onSelect: () => this.confirmQuit() });
    const mainHint = scene.add.text(W / 2, 500, 'W / S or ↑ / ↓ navigate  ·  ENTER select  ·  ESC resume', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.DIM) }).setOrigin(.5);
    this.mainGroup = scene.add.container(0, 0, [mainDim, mainShadow, mainPanel, mainInset, mainTitle, mainSub, resume, controls, team, forfeit, quit, mainHint]).setDepth(5000).setVisible(false);
    this.menu = new Menu(scene, [
      { text: 'RESUME MATCH', enabled: true, color: THEME.GREEN, highlight: on => resume.highlight(on), onSelect: () => this.onResume() },
      { text: 'VIEW CONTROLS', enabled: true, color: THEME.BLUE, highlight: on => controls.highlight(on), onSelect: () => this.showPage('controls') },
      { text: 'TEAM / POWERS', enabled: true, color: THEME.GOLD, highlight: on => team.highlight(on), onSelect: () => this.showPage('team') },
      { text: 'FORFEIT RUN', enabled: true, color: THEME.RED, highlight: on => forfeit.highlight(on), onSelect: () => this.confirmForfeit() },
      { text: 'QUIT TO TITLE', enabled: true, color: THEME.GRAY, highlight: on => quit.highlight(on), onSelect: () => this.confirmQuit() },
    ]);

    // Controls page — these labels are intentionally read-only; no game action is possible here.
    const controlsParts: Phaser.GameObjects.GameObject[] = [
      scene.add.rectangle(W/2,H/2,W,H,0x000000,.72).setInteractive(),
      scene.add.rectangle(W/2+5,H/2+5,760,492,0x000000,.48),
      scene.add.rectangle(W/2,H/2,760,492,FILL.panel,1).setStrokeStyle(3,THEME.BLUE),
      scene.add.rectangle(W/2,H/2,746,478,0x000000,0).setStrokeStyle(1,0x34465a,1),
      scene.add.text(W/2,126,'CONTROLS',{fontFamily:FONT,fontSize:'32px',color:hex(THEME.BLUE),fontStyle:'bold'}).setOrigin(.5),
      scene.add.text(W/2,160,'Same controls on offense and defense; the situation changes the action.',{fontFamily:FONT,fontSize:'13px',color:hex(THEME.DIM),align:'center'}).setOrigin(.5),
    ];
    const controlsRows = [
      ['WASD / ARROW KEYS','Move your skater'],
      ['SPACE','Pass with the puck · switch defender without it'],
      ['SHIFT or ENTER','Hold to charge and release to shoot · check on defense'],
      ['E','Spin juke on offense · parry / counter on defense'],
      ['F','Deke on offense · parry / counter on defense'],
      ['ESC','Return to pause menu or resume play'],
    ];
    controlsRows.forEach(([key, desc], i) => {
      const y = 208 + i * 42;
      controlsParts.push(scene.add.rectangle(W/2, y+4, 660, 34, i % 2 ? 0x14283c : 0x102236, 1));
      controlsParts.push(scene.add.text(W/2-300,y,key,{fontFamily:FONT,fontSize:'14px',color:hex(THEME.GOLD),fontStyle:'bold'}).setOrigin(0,.5));
      controlsParts.push(scene.add.text(W/2-95,y,desc,{fontFamily:FONT,fontSize:'12px',color:hex(THEME.WHITE),wordWrap:{width:480}}).setOrigin(0,.5));
    });
    const controlsBack = new MenuButton(scene,W/2,484,'BACK TO PAUSE MENU',{color:THEME.BLUE,size:20,onSelect:()=>this.showPage('menu')});
    controlsParts.push(controlsBack);
    this.controlsGroup = scene.add.container(0,0,controlsParts).setDepth(5000).setVisible(false);

    // Team / starter / power page: no swapping, bench actions, or item use from pause.
    const teamParts: Phaser.GameObjects.GameObject[] = [
      scene.add.rectangle(W/2,H/2,W,H,0x000000,.74).setInteractive(),
      scene.add.rectangle(W/2+5,H/2+5,954,528,0x000000,.5),
      scene.add.rectangle(W/2,H/2,954,528,FILL.panel,1).setStrokeStyle(3,THEME.GOLD),
      scene.add.rectangle(W/2,H/2,940,514,0x000000,0).setStrokeStyle(1,0x34465a,1),
      scene.add.text(W/2,89,'TEAM & POWER INSPECTOR',{fontFamily:FONT,fontSize:'28px',color:hex(THEME.GOLD),fontStyle:'bold'}).setOrigin(.5),
      scene.add.text(W/2,118,'VIEW ONLY  ·  NO SUBSTITUTIONS OR EQUIPMENT CHANGES DURING A MATCH',{fontFamily:FONT,fontSize:'10px',color:hex(THEME.DIM)}).setOrigin(.5),
      scene.add.rectangle(382,337,466,382,0x102236,1).setStrokeStyle(1,0x32485c),
      scene.add.rectangle(852,337,440,382,0x102236,1).setStrokeStyle(1,0x32485c),
      scene.add.text(382,153,'ACTIVE LINEUP',{fontFamily:FONT,fontSize:'14px',color:hex(THEME.GREEN),fontStyle:'bold'}).setOrigin(.5),
      scene.add.text(852,153,'POWERS & UNLOCKS',{fontFamily:FONT,fontSize:'14px',color:hex(THEME.BLUE),fontStyle:'bold'}).setOrigin(.5),
    ];
    userTeam.players.forEach((p, i) => {
      const y = 185 + i * 40;
      teamParts.push(scene.add.rectangle(382,y,430,34,i%2?0x172c40:0x142638,1));
      teamParts.push(scene.add.text(178,y,p.goalie?'GOALIE':`FIELD ${i+1}`,{fontFamily:FONT,fontSize:'10px',color:hex(p.isStarter?THEME.GOLD:THEME.DIM)}).setOrigin(0,.5));
      teamParts.push(scene.add.text(250,y,`${p.name}${p.isStarter?'  ★ STARTER':''}`,{fontFamily:FONT,fontSize:'13px',color:hex(THEME.WHITE),fontStyle:p.isStarter?'bold':'normal'}).setOrigin(0,.5));
      teamParts.push(scene.add.text(582,y,`OVR ${overall(p)}  ATK ${p.stats.attack}  SPD ${p.stats.speed}`,{fontFamily:FONT,fontSize:'10px',color:hex(THEME.GOLD)}).setOrigin(1,.5));
    });
    const meta = getMeta();
    const starter = meta.starter;
    if (starter) {
      const stages = STARTER_EVOLUTIONS[starter];
      const stage = [...stages].reverse().find(x => meta.starterXp[starter] >= x.at) || stages[0];
      const next = stages.find(x => x.at > meta.starterXp[starter]);
      teamParts.push(scene.add.text(179,354,`STARTER: ${stage.name.toUpperCase()}  ·  ${meta.starterXp[starter]} XP`,{fontFamily:FONT,fontSize:'12px',color:hex(THEME.GOLD),fontStyle:'bold'}));
      teamParts.push(scene.add.text(179,376,next?`NEXT EVOLUTION: ${next.name} AT ${next.at} XP`:'FINAL EVOLUTION REACHED',{fontFamily:FONT,fontSize:'10px',color:hex(THEME.DIM)}));
    } else {
      teamParts.push(scene.add.text(179,354,'STARTER NOT SELECTED',{fontFamily:FONT,fontSize:'12px',color:hex(THEME.GOLD),fontStyle:'bold'}));
    }
    const bench = campaignMode ? (getRun().bench || []) : [];
    teamParts.push(scene.add.text(179,407,`BENCH (${campaignMode ? bench.length : 'N/A'}) · VIEW ONLY`,{fontFamily:FONT,fontSize:'11px',color:hex(THEME.GREEN),fontStyle:'bold'}));
    teamParts.push(scene.add.text(179,431,bench.length?bench.map(p=>p.name+(p.isStarter?' ★':'')).join('  ·  '):(campaignMode?'No extra players recruited yet.':'Bench is not part of this lab match.'),{fontFamily:FONT,fontSize:'10px',color:hex(THEME.WHITE),wordWrap:{width:405},lineSpacing:4}));

    const activeIds = new Set(powerIds);
    POWER_DEFINITIONS.forEach((power, i) => {
      const y = 184 + i * 48;
      teamParts.push(scene.add.text(644,y,`${power.name.toUpperCase()}  ·  ${activeIds.has(power.id)?'EQUIPPED':'NOT EQUIPPED'}`,{fontFamily:FONT,fontSize:'10px',color:hex(activeIds.has(power.id)?THEME.GREEN:THEME.GOLD),fontStyle:'bold'}));
      teamParts.push(scene.add.text(644,y+16,power.description,{fontFamily:FONT,fontSize:'9px',color:hex(THEME.WHITE),wordWrap:{width:397},lineSpacing:2}));
    });
    teamParts.push(scene.add.rectangle(852,389,400,1,0x32485c,1));
    teamParts.push(scene.add.text(644,406,'UNLOCKED LOCKER ROOM ITEMS',{fontFamily:FONT,fontSize:'10px',color:hex(THEME.BLUE),fontStyle:'bold'}));
    const owned = SHOP_OFFERS.filter(o => meta.unlocked.includes(o.unlock || o.id));
    teamParts.push(scene.add.text(644,430,owned.length?owned.map(o=>o.name).join('  ·  '):'No shop items unlocked yet.',{fontFamily:FONT,fontSize:'10px',color:hex(THEME.WHITE),wordWrap:{width:395},lineSpacing:3}));
    teamParts.push(scene.add.text(644,478,'Inventory entries may be prototypes; this screen is informational only.',{fontFamily:FONT,fontSize:'9px',color:hex(THEME.DIM),wordWrap:{width:395}}));
    const teamBack = new MenuButton(scene,W/2,578,'BACK TO PAUSE MENU',{color:THEME.GOLD,size:19,onSelect:()=>this.showPage('menu')});
    teamParts.push(teamBack);
    this.teamGroup = scene.add.container(0,0,teamParts).setDepth(5000).setVisible(false);

    const bind = (code: string, fn: () => void) => {
      this.scene.input.keyboard!.on(code, fn);
      this.bindings.push([code, fn]);
    };
    bind('keydown-ENTER', () => {
      if (!this.visible || this.dialog) return;
      if (this.page === 'menu') this.menu.select(); else this.showPage('menu');
    });
    bind('keydown-SPACE', () => {
      if (!this.visible || this.dialog) return;
      if (this.page === 'menu') this.menu.select(); else this.showPage('menu');
    });
    bind('keydown-W', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.menu.moveUp(); });
    bind('keydown-UP', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.menu.moveUp(); });
    bind('keydown-S', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.menu.moveDown(); });
    bind('keydown-DOWN', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.menu.moveDown(); });
    bind('keydown-C', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.showPage('controls'); });
    bind('keydown-I', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.showPage('team'); });
    bind('keydown-F', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.confirmForfeit(); });
    bind('keydown-Q', () => { if (this.visible && this.page === 'menu' && !this.dialog) this.confirmQuit(); });
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.showPage('menu');
  }

  /** ESC in a detail page returns to the pause menu; ESC in the menu resumes play. */
  handleEscape(): void {
    if (!this.visible || this.dialog) return;
    if (this.page !== 'menu') this.showPage('menu');
    else this.hide();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.closeDialog();
    this.mainGroup.setVisible(false);
    this.controlsGroup.setVisible(false);
    this.teamGroup.setVisible(false);
  }

  destroy(): void {
    this.hide();
    for (const [code, fn] of this.bindings) this.scene.input.keyboard!.off(code, fn);
    this.bindings = [];
    this.mainGroup.destroy();
    this.controlsGroup.destroy();
    this.teamGroup.destroy();
  }

  private showPage(page: PausePage): void {
    this.page = page;
    this.mainGroup.setVisible(this.visible && page === 'menu');
    this.controlsGroup.setVisible(this.visible && page === 'controls');
    this.teamGroup.setVisible(this.visible && page === 'team');
  }

  private confirmForfeit(): void {
    if (this.dialog) return;
    this.dialog = new ConfirmDialog(this.scene, 'FORFEIT MATCH?', 'The match ends in a loss and this run is over. Your current year ends here.', 'FORFEIT', () => {
      this.closeDialog(); this.onForfeit();
    }, () => this.closeDialog());
  }

  private confirmQuit(): void {
    if (this.dialog) return;
    this.dialog = new ConfirmDialog(this.scene, 'QUIT TO TITLE?', 'The current match is forfeited and the run is over. This does not pause the run for later.', 'QUIT', () => {
      this.closeDialog(); this.onQuit();
    }, () => this.closeDialog());
  }

  private closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = null;
  }
}
