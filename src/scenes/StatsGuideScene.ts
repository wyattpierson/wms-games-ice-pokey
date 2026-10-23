import Phaser from 'phaser';
import { addRetroChrome, addRetroPanel } from '../ui/chrome';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/rink';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { TextButton } from '../ui/menu';
import { wireShutdown } from '../ui/sceneLifecycle';

interface StatsGuideData { returnTo?: string; teamId?: string; selected?: number }
const STAT_ROWS: Array<[string, string, string]> = [
  ['HP', 'Staying power', 'More max health before a skater is knocked down.'],
  ['ATTACK', 'Shots and passes', 'Stronger shots and faster passes. A great offensive stat.'],
  ['SPECIAL ATTACK', 'Skill moves', 'Stronger juke bursts and shorter, harder-to-read move tells.'],
  ['DEFENSE', 'Checks and walls', 'Stronger checks and tougher defensive blocks. Especially dangerous in CPU hands.'],
  ['SPECIAL DEFENSE', 'Parries and puck sense', 'A more forgiving parry window, better puck reads, and stronger goalie reactions.'],
  ['SPEED', 'Skating', 'Higher skating speed. Particularly valuable when you control the player yourself.'],
];

/** Plain-language guide so the stat system is understandable during recruitment. */
export class StatsGuideScene extends Phaser.Scene {
  private returnTo = 'TitleScene';
  private returnData: StatsGuideData = {};
  private onKey: ((e: KeyboardEvent) => void) | null = null;
  constructor() { super('StatsGuideScene'); }
  init(data?: StatsGuideData): void { this.returnTo = data?.returnTo || 'TitleScene'; this.returnData = data || {}; }
  create(): void {
    wireShutdown(this);
    this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GOLD);
    addRetroPanel(this, GAME_WIDTH/2, GAME_HEIGHT/2, 1000, 540, THEME.GOLD, FILL.panel);
    this.add.text(GAME_WIDTH/2, 92, 'HOW STATS WORK', {fontFamily:FONT,fontSize:'30px',color:hex(THEME.GOLD),fontStyle:'bold'}).setOrigin(.5);
    this.add.text(GAME_WIDTH/2, 124, 'Higher stats are generally better, but the role and matchup matter too.', {fontFamily:FONT,fontSize:'13px',color:hex(THEME.DIM)}).setOrigin(.5);
    STAT_ROWS.forEach(([name, impact, desc], i) => {
      const col = i % 2, row = Math.floor(i/2);
      const x = 360 + col*480, y = 190 + row*110;
      this.add.rectangle(x, y, 430, 86, FILL.plate, 1).setStrokeStyle(1, THEME.DIM);
      this.add.text(x-192,y-24,name,{fontFamily:FONT,fontSize:'15px',color:hex(THEME.GOLD),fontStyle:'bold'}).setOrigin(0,.5);
      this.add.text(x-192,y-2,impact,{fontFamily:FONT,fontSize:'11px',color:hex(THEME.GREEN)}).setOrigin(0,.5);
      this.add.text(x-192,y+19,desc,{fontFamily:FONT,fontSize:'10px',color:hex(THEME.WHITE),wordWrap:{width:382},lineSpacing:1}).setOrigin(0,.5);
    });
    this.add.text(GAME_WIDTH/2, 480, 'OVR is a quick summary, not the whole story. Attack + Speed feel great in your hands; CPU defenders with high Defense and Special Defense can be harder to score on.', {fontFamily:FONT,fontSize:'12px',color:hex(THEME.BLUE),align:'center',wordWrap:{width:890},lineSpacing:4}).setOrigin(.5);
    new TextButton(this,GAME_WIDTH/2,550,'BACK',{color:THEME.GREEN,minWidth:220,onSelect:()=>this.goBack()});
    this.onKey=(e:KeyboardEvent)=>{ if(e.code==='Escape'||e.code==='Enter'||e.code==='Space') this.goBack(); };
    window.addEventListener('keydown',this.onKey);
  }
  private goBack():void { this.scene.start(this.returnTo, this.returnData); }
  shutdown():void { if(this.onKey) window.removeEventListener('keydown',this.onKey); this.onKey=null; }
}
