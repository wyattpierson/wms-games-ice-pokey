import Phaser from 'phaser';
import { getWorldState } from '../core/worldState';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { beginNewYear, chooseStarter, getMeta, type StarterId } from '../state/metaStore';
import { getRun, resetRun, setRun } from '../state/runStore';
import { yearOpening } from '../config/story';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
import { beginCareerRun } from '../state/careerStatsStore';
const STARTERS: { id: StarterId; name: string; sprite: number; desc: string }[] = [
  { id: 'larvitar', name: 'LARVITAR', sprite: 246, desc: 'The stubborn bruiser' },
  { id: 'gible', name: 'GIBLE', sprite: 443, desc: 'The hungry playmaker' },
  { id: 'bagon', name: 'BAGON', sprite: 371, desc: 'The fearless speedster' },
];
export class StarterSelectScene extends Phaser.Scene {
  private onKey: ((e: KeyboardEvent)=>void)|null = null;
  private nameEntry: { panel: Phaser.GameObjects.Container; text: Phaser.GameObjects.Text; starter: StarterId; value: string; replaceOnType: boolean } | null = null;
  constructor(){ super('StarterSelectScene'); }
  create(): void {
    this.nameEntry = null;
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
    const onKey=(e:KeyboardEvent)=>{
      if (this.nameEntry) { this.editName(e); return; }
      if (e.repeat) return;
      if(e.code==='Digit1'||e.code==='Numpad1')this.pick('larvitar');
      if(e.code==='Digit2'||e.code==='Numpad2')this.pick('gible');
      if(e.code==='Digit3'||e.code==='Numpad3')this.pick('bagon');
    }; this.onKey=onKey; window.addEventListener('keydown',onKey);
  }
  private pick(id: StarterId): void {
    if (this.nameEntry) return;
    const center = GAME_WIDTH / 2;
    const panel = this.add.container(0, 0).setDepth(100);
    panel.add(this.add.rectangle(center, 336, GAME_WIDTH, 672, 0x000000, .75).setInteractive());
    panel.add(this.add.rectangle(center, 336, 660, 260, FILL.panel, 1).setStrokeStyle(3, THEME.GOLD));
    panel.add(this.add.text(center, 246, 'NAME YOUR TEAM', { fontFamily: FONT, fontSize: '25px', color: hex(THEME.GOLD) }).setOrigin(.5));
    panel.add(this.add.rectangle(center, 314, 560, 52, FILL.plateHi, 1).setStrokeStyle(2, THEME.BLUE));
    const text = this.add.text(center, 314, 'Team Volt Tackle', { fontFamily: FONT, fontSize: '22px', color: hex(THEME.WHITE) }).setOrigin(.5);
    panel.add(text);
    panel.add(this.add.text(center, 361, 'Type a name · 24 characters · BACKSPACE edits · ESC cancels', { fontFamily: FONT, fontSize: '12px', color: hex(THEME.BLUE) }).setOrigin(.5));
    const confirm = this.add.text(center, 419, 'CHOOSE PARTNER & BEGIN  [ENTER]', { fontFamily: FONT, fontSize: '18px', color: hex(THEME.GREEN) }).setOrigin(.5).setInteractive({ useHandCursor: true });
    panel.add(confirm);
    confirm.on('pointerdown', () => this.confirmPartner());
    this.nameEntry = { panel, text, starter: id, value: 'Team Volt Tackle', replaceOnType: true };
  }

  private editName(event: KeyboardEvent): void {
    const entry = this.nameEntry;
    if (!entry || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Escape') { entry.panel.destroy(); this.nameEntry = null; return; }
    if (event.code === 'Enter' && !event.repeat) { event.preventDefault(); this.confirmPartner(); return; }
    if (event.code === 'Backspace') {
      event.preventDefault();
      entry.value = entry.replaceOnType ? '' : entry.value.slice(0, -1);
      entry.replaceOnType = false;
    } else if (event.key.length === 1) {
      event.preventDefault();
      entry.value = (entry.replaceOnType ? event.key : entry.value + event.key).slice(0, 24);
      entry.replaceOnType = false;
    }
    entry.text.setText(entry.value || '_');
  }

  private confirmPartner(): void {
    const entry = this.nameEntry;
    if (!entry) return;
    const teamName = entry.value.trim() || 'Team Volt Tackle';
    this.nameEntry = null;
    chooseStarter(entry.starter);
    beginNewYear();
    resetRun();
    const run = getRun();
    setRun({ ...run, userTeam: { ...run.userTeam, name: teamName } });
    const namedRun = getRun();
    beginCareerRun(teamName, getMeta().seasonYear, namedRun.userTeam.players.map(p => ({ name: p.name, sprite: p.sprite, isStarter: p.isStarter, goalie: p.goalie })));
    const intro = yearOpening(getMeta().seasonYear, getWorldState());
    this.scene.start('DialogueScene', { nextScene: 'TrainingMenuScene', nextData: { onboarding: true }, lines: intro.lines, flags: intro.flags });
  }
  shutdown():void {
    if(this.onKey)window.removeEventListener('keydown',this.onKey);
    this.onKey=null;
    this.nameEntry = null;
  }
}
