import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { ITEM_IDS, SHOP_OFFERS, ZONES } from '../config/progression';
import { buyShopOffer, getMeta } from '../state/metaStore';
import { resolveWorldZone } from '../core/worldState';
import { isStarterAtFinalEvolution, applyPermanentSpeciesEvolutionToRun } from '../core/permanentItems';
import { getRun, setRun } from '../state/runStore';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
export class StoreScene extends Phaser.Scene {
 private onKey:((e:KeyboardEvent)=>void)|null=null;
 private returnTo: 'TitleScene' | 'GameOverScene' | 'ZoneSelectScene' = 'ZoneSelectScene';
 constructor(){super('StoreScene');}
 create(data?: { returnTo?: 'TitleScene' | 'GameOverScene' | 'ZoneSelectScene' }):void {
  if (data?.returnTo) this.returnTo = data.returnTo;
  wireShutdown(this); this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GOLD);
  const meta=getMeta();
  this.add.text(GAME_WIDTH/2,35,'ITEM SHOP',{fontFamily:FONT,fontSize:'30px',color:hex(THEME.GOLD)}).setOrigin(.5);
  this.add.text(GAME_WIDTH/2,69,`PERMANENT CREDITS: ${meta.currency}`,{fontFamily:FONT,fontSize:'15px',color:hex(THEME.GREEN)}).setOrigin(.5);
  const resources=ZONES.map(base=>{const z=resolveWorldZone(base.id)||base;return `${z.resourceName}: ${meta.islandResources[z.id]||0}`;}).join('   ·   ');
  this.add.text(GAME_WIDTH/2,94,resources,{fontFamily:FONT,fontSize:'12px',color:hex(THEME.GOLD)}).setOrigin(.5);
  SHOP_OFFERS.forEach((o,i)=>{
   const y=124+i*68;
   const owned=meta.unlocked.includes(o.unlock||o.id);
   const hidden=o.requiresStarterFinalEvolution===true && !isStarterAtFinalEvolution(meta.starter,meta.starterXp);
   const shownName=hidden?'UNKNOWN ITEM':o.name;
   const shownDescription=hidden?'A mysterious item. Its purpose is revealed when your chosen starter reaches its final evolution.':o.description;
   const required=o.requiresResource; const baseResource=required?ZONES.find(z=>z.id===required.zoneId):undefined; const resource=baseResource?resolveWorldZone(baseResource.id)||baseResource:undefined;
   const hasResource=!required || (meta.islandResources[required.zoneId]||0)>=required.amount;
   const canAfford=meta.currency>=o.cost; const available=!hidden&&!owned&&hasResource&&canAfford;
   this.add.rectangle(GAME_WIDTH/2,y+17,800,59,FILL.plate,1).setStrokeStyle(1,hidden?THEME.DIM:THEME.BLUE);
   this.add.text(220,y-4,shownName,{fontFamily:FONT,fontSize:'15px',color:hex(hidden?THEME.DIM:THEME.WHITE)}).setOrigin(0,0);
   const reqText=hidden?'UNIDENTIFIED':required?`Requires ${required.amount} ${resource?.resourceUnitName||resource?.resourceName||required.zoneId} · You have ${meta.islandResources[required.zoneId]||0}`:'Permanent unlock · no island resource required';
   this.add.text(220,y+17,`${shownDescription}  (${reqText})`,{fontFamily:FONT,fontSize:'9px',color:hex(THEME.DIM),wordWrap:{width:525},lineSpacing:1}).setOrigin(0,0);
   new TextButton(this,850,y+16,hidden?'UNDISCOVERED':owned?'OWNED':available?`BUY · ${o.cost} CR`:!hasResource?`NEED RESOURCE · ${o.cost} CR`:`NEED ${o.cost} CR`,{color:available?THEME.GREEN:THEME.GRAY,minWidth:190,onSelect:()=>{
     if(!available) return;
     const id=o.unlock||o.id;
     if(buyShopOffer(id,o.cost,required)) {
       if(id===ITEM_IDS.evolvePikachu||id===ITEM_IDS.evolvePsyduck) setRun(applyPermanentSpeciesEvolutionToRun(getRun(),getMeta().unlocked));
       this.scene.restart();
     }
   }});
  });
  const backLabel=this.returnTo==='TitleScene'?'BACK TO TITLE':this.returnTo==='GameOverScene'?'BACK TO GAME OVER':'BACK TO ZONES';
  new TextButton(this,GAME_WIDTH/2,630,backLabel,{color:THEME.BLUE,minWidth:220,onSelect:()=>this.scene.start(this.returnTo)});
  const onKey=(e:KeyboardEvent)=>{if(e.code==='Escape')this.scene.start(this.returnTo);};this.onKey=onKey;window.addEventListener('keydown',onKey);
 }
 shutdown():void{if(this.onKey)window.removeEventListener('keydown',this.onKey);this.onKey=null;}
}
