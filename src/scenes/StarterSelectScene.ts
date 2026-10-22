import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { beginNewYear, chooseStarter, type StarterId } from '../state/metaStore';
import { getRun, resetRun, setRun } from '../state/runStore';
import { yearOpening } from '../config/story';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
const STARTERS: { id: StarterId; name: string; sprite: number; desc: string }[] = [
  { id: 'larvitar', name: 'LARVITAR', sprite: 246, desc: 'The stubborn bruiser' },
  { id: 'gible', name: 'GIBLE', sprite: 443, desc: 'The hungry playmaker' },
  { id: 'bagon', name: 'BAGON', sprite: 371, desc: 'The fearless speedster' },
];
export class StarterSelectScene extends Phaser.Scene {
  private onKey: ((e: KeyboardEvent)=>void)|null = null;
  constructor(){ super('StarterSelectScene'); }
  create(): void {
    wireShutdown(this); this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.BLUE);
    this.add.text(GAME_WIDTH/2,70,'CHOOSE YOUR PARTNER',{fontFamily:FONT,fontSize:'32px',color:hex(THEME.GOLD)}).setOrigin(.5);
    this.add.text(GAME_WIDTH/2,108,'This choice is permanent for this save file.',{fontFamily:FONT,fontSize:'15px',color:hex(THEME.DIM)}).setOrigin(.5);
    STARTERS.forEach((s,i)=>{
      const x=GAME_WIDTH/2+(i-1)*300;
      const accent = [THEME.GREEN, THEME.BLUE, THEME.GOLD][i];
      const panel=this.add.rectangle(x,330,250,310,FILL.plate,1).setStrokeStyle(2,accent).setInteractive({useHandCursor:true});
      this.add.rectangle(x,330,240,300,0x000000,0).setStrokeStyle(1,0x34465a,0.9);
      this.add.rectangle(x,183,64,4,accent,1);
      this.add.image(x,255,`pkm-${s.sprite}`).setScale(1.5);
      this.add.text(x,350,s.name,{fontFamily:FONT,fontSize:'24px',color:hex(THEME.WHITE),fontStyle:'bold'}).setOrigin(.5);
      this.add.text(x,390,s.desc,{fontFamily:FONT,fontSize:'13px',color:hex(THEME.DIM)}).setOrigin(.5);
      this.add.text(x,475,`[ ${i+1} ] CHOOSE`,{fontFamily:FONT,fontSize:'16px',color:hex(accent)}).setOrigin(.5);
      panel.on('pointerover',()=>panel.setFillStyle(FILL.plateHi,1).setStrokeStyle(3,THEME.GOLD));
      panel.on('pointerout',()=>panel.setFillStyle(FILL.plate,1).setStrokeStyle(2,accent));
      panel.on('pointerdown',()=>this.pick(s.id));
    });
    const onKey=(e:KeyboardEvent)=>{ if(e.code==='Digit1'||e.code==='Numpad1')this.pick('larvitar'); if(e.code==='Digit2'||e.code==='Numpad2')this.pick('gible'); if(e.code==='Digit3'||e.code==='Numpad3')this.pick('bagon'); }; this.onKey=onKey; window.addEventListener('keydown',onKey);
  }
  private pick(id:StarterId):void { const entered = window.prompt('Name your team', 'Puck Masters'); if (entered === null) return; const teamName = entered.trim().slice(0, 24) || 'Puck Masters'; chooseStarter(id); beginNewYear(); resetRun(); const run = getRun(); setRun({ ...run, userTeam: { ...run.userTeam, name: teamName } }); const intro=yearOpening(1); this.scene.start('DialogueScene', { nextScene: 'ZoneSelectScene', lines: intro.lines, flag: intro.flag }); }
  shutdown():void { if(this.onKey)window.removeEventListener('keydown',this.onKey); this.onKey=null; }
}
