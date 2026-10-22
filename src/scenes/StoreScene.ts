import Phaser from 'phaser';
import { addRetroChrome } from '../ui/chrome';
import { GAME_WIDTH } from '../config/rink';
import { SHOP_OFFERS, ZONES } from '../config/progression';
import { buyShopOffer, getMeta } from '../state/metaStore';
import { TextButton } from '../ui/menu';
import { FILL, FONT, THEME, hex } from '../ui/theme';
import { wireShutdown } from '../ui/sceneLifecycle';
export class StoreScene extends Phaser.Scene {
 private onKey:((e:KeyboardEvent)=>void)|null=null;
 constructor(){super('StoreScene');}
 create():void {
  wireShutdown(this); this.cameras.main.setBackgroundColor(FILL.background);
    addRetroChrome(this, THEME.GOLD);
  const meta=getMeta();
  this.add.text(GAME_WIDTH/2,35,'THE LOCKER ROOM',{fontFamily:FONT,fontSize:'30px',color:hex(THEME.GOLD)}).setOrigin(.5);
  this.add.text(GAME_WIDTH/2,69,`PERMANENT CREDITS: ${meta.currency}`,{fontFamily:FONT,fontSize:'15px',color:hex(THEME.GREEN)}).setOrigin(.5);
  const resources=ZONES.map(z=>`${z.resourceName}: ${meta.islandResources[z.id]||0}`).join('   ·   ');
  this.add.text(GAME_WIDTH/2,94,resources,{fontFamily:FONT,fontSize:'12px',color:hex(THEME.GOLD)}).setOrigin(.5);
  SHOP_OFFERS.forEach((o,i)=>{
   const y=147+i*76; const owned=meta.unlocked.includes(o.unlock||o.id);
   const required=o.requiresResource; const resource=required?ZONES.find(z=>z.id===required.zoneId):undefined;
   const hasResource=!required || (meta.islandResources[required.zoneId]||0)>=required.amount;
   const canAfford=meta.currency>=o.cost; const available=!owned&&hasResource&&canAfford;
   this.add.rectangle(GAME_WIDTH/2,y+18,800,66,FILL.plate,1).setStrokeStyle(1,THEME.DIM);
   this.add.text(220,y-3,o.name,{fontFamily:FONT,fontSize:'16px',color:hex(THEME.WHITE)}).setOrigin(0,0);
   const reqText=required?`Requires ${required.amount} ${resource?.resourceName||required.zoneId} · You have ${meta.islandResources[required.zoneId]||0}`:'No island resource required';
   this.add.text(220,y+18,`${o.description}  (${reqText})`,{fontFamily:FONT,fontSize:'10px',color:hex(THEME.DIM),wordWrap:{width:510}}).setOrigin(0,0);
   new TextButton(this,850,y+16,owned?'OWNED':available?`BUY · ${o.cost} CR`:`LOCKED · ${o.cost} CR`,{color:available?THEME.GREEN:THEME.GRAY,minWidth:160,onSelect:()=>{if(available&&buyShopOffer(o.unlock||o.id,o.cost,required))this.scene.restart();}});
  });
  new TextButton(this,GAME_WIDTH/2,620,'BACK TO ZONES',{color:THEME.BLUE,minWidth:220,onSelect:()=>this.scene.start('ZoneSelectScene')});
  const onKey=(e:KeyboardEvent)=>{if(e.code==='Escape')this.scene.start('ZoneSelectScene');};this.onKey=onKey;window.addEventListener('keydown',onKey);
 }
 shutdown():void{if(this.onKey)window.removeEventListener('keydown',this.onKey);this.onKey=null;}
}
