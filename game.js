import {SAVE_KEY,initialState,sanitizeState,collect,activatePanel,canEnter,unlockCaptain,objective} from './state.js';
const $=id=>document.getElementById(id);
let state=initialState();
try {state=sanitizeState(JSON.parse(localStorage.getItem(SAVE_KEY)));} catch {}
const names={book:'Notebook',key:'Brass key',gun:'Pistol',bullet:'Cartridge'};
const assets={book:'inventory/book_inventory.jpg',key:'inventory/key_inventory.jpg',gun:'inventory/gun_inventory.jpg',bullet:'inventory/bullet_inventory.jpg'};
const has=item=>state.items.includes(item);
const say=text=>{$('message').textContent=text;};
const save=()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{}};
function button(label,action,parent) {const b=document.createElement('button');b.textContent=label;b.onclick=action;parent.append(b);return b;}
function spot(label,x,y,w,h,action) {const b=button('',action,$('hotspots'));b.className='hotspot';b.setAttribute('aria-label',label);Object.assign(b.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});const span=document.createElement('span');span.textContent=label;b.append(span);}
function go(scene) {if(!canEnter(state,scene)){say(scene.startsWith('mess')?'The mess hall is locked. Try the control room.':'The captain’s quarters are locked. You need the key.');return;}state.scene=scene;render();say('Click to investigate. Press H to reveal points of interest.');}
function move(delta) {state.position=Math.max(0,Math.min(4,state.position+delta));go('hall');}
function look(direction) {
  if(['vent','basement'].includes(state.scene)){if((state.scene==='vent'&&direction==='down')||(state.scene==='basement'&&direction==='up'))go('hall');return;}
  if(state.scene!=='hall')return;
  if(direction==='up'&&state.position===2)go('vent');
  else if(direction==='down'&&state.position===1)go('basement');
  else say(direction==='up'?'There is nothing overhead to inspect here. Look for the vent along the passage.':'There is nothing below to inspect here. Look for the basement hatch along the passage.');
}
function turnAround() {if(!['hall','vent','basement'].includes(state.scene))return;state.direction*=-1;go('hall');}

function showModal(title,text,src,action) {const content=$('modal-content');content.replaceChildren();const h=document.createElement('h2');h.textContent=title;content.append(h);if(src){const img=document.createElement('img');img.src=src;img.alt=title;if(src.endsWith('map.jpg'))img.className='deck-map';content.append(img);}if(text){const p=document.createElement('p');p.textContent=text;content.append(p);}if(action)button(action.label,action.run,content);if(!$('modal').open)$('modal').showModal();}
function pickup(item) {if(collect(state,item)){render();say(`${names[item]} collected. Inspect it in your personal effects.`);}}
function inspect(item) {
  if(item==='book') showModal('The notebook',has('key')?'The note reads: “Captain’s quarters.” The key has been removed from the cover.':'The note reads: “Captain’s quarters.” A small key is tucked inside the cover.',has('key')?assets.book:'inventory/key_book_inventory.jpg',has('key')?null:{label:'Take the key',run:()=>{pickup('key');$('modal').close();}});
  else if(item==='gun'||item==='bullet') showModal(names[item],item==='gun'?'A pistol from the captain’s quarters. You cannot use it yet.':'A single cartridge from the captain’s quarters. You cannot use it yet.',assets[item]);
  else showModal('Captain’s key','The key from the notebook opens the captain’s quarters.',assets.key);
}
function knock() {
  state.knocked=true;render();
  showModal('A voice behind the door','“I’m locked inside. You’ll need the key to get me out.”');
}
function enterCaptain() {
  if(!unlockCaptain(state)){say('The door is locked. Find the key.');return;}
  go('captain');say('The notebook key turns in the lock. You enter the captain’s quarters.');
}
function panel() {
  activatePanel(state);render();say('You press the button. A lock releases down the hall. The mess hall is now open.');
}
function render() {
  $('hotspots').replaceChildren();$('navigation').replaceChildren();$('inventory').replaceChildren();$('patch').hidden=true;
  let path,title; const s=state.scene;
  const nav=(label,fn)=>button(label,fn,$('navigation'));
  if(s==='hall') {
    title='Main passage';path=state.direction===1?`hall_main/hall_up_0${state.position+1}.jpg`:`hall_main/hall_down_0${Math.max(1,4-state.position)}.jpg`;
    if(state.direction===1&&state.position<4)spot('Move forward',810,310,300,430,()=>move(1));
    if(state.direction===-1&&state.position>0)spot('Move forward',810,310,300,430,()=>move(-1));
    if(state.position===0&&state.direction===-1){path='hall_main/hall_door_end.jpg';spot('Approach the door',760,280,400,500,()=>go('captainDoor'));nav('Door behind you',()=>go('captainDoor'));}
    nav('Look up · R',()=>look('up'));
    nav('Look down · F',()=>look('down'));
    if(state.position===1)spot('Look down · Basement hatch',730,745,460,120,()=>look('down'));
    if(state.position===2)spot('Look up · Vent',730,110,460,180,()=>look('up'));
    if(state.position===3||state.position===4){nav('Mess hall',()=>go('mess'));nav('Control room',()=>go('control'));}
    nav('↶ Turn around',turnAround);
    if(state.position-state.direction>=0&&state.position-state.direction<=4)nav('Step backward',()=>move(-state.direction));
    if(state.position+state.direction>=0&&state.position+state.direction<=4)nav('Forward ↑',()=>move(state.direction));
    if(state.position===4&&state.direction===1)spot('Sealed bulkhead',840,320,240,300,()=>say('The forward bulkhead is sealed. The control room is beside you.'));
  } else if(s==='captainExit'||s==='messExit') {
    const captain=s==='captainExit';
    title=captain?'Captain’s quarters · Exit':'Mess hall · Exit';
    path=captain?'captains/captain_outro.jpg':'messhall/messhall_outro.jpg';
    spot('Leave through the door',captain?725:1020,captain?205:390,captain?470:195,captain?600:420,()=>go('hall'));
    nav('↶ Turn around',()=>go(captain?'captain':'mess'));
  } else if(s==='captainDoor') {
    title='Captain’s quarters · Door';path='hall_door_01.jpg';
    spot(state.captainUnlocked?'Enter captain’s quarters':'Knock on the door',790,300,350,440,state.captainUnlocked?enterCaptain:knock);
    nav(state.captainUnlocked?'Open door':has('key')?'Use notebook key':'Try the door',enterCaptain);
    nav('Main passage',()=>go('hall'));
  } else if(s==='captain'||s==='captainBody') {
    const close=s==='captainBody';title='Captain’s quarters';const stem=close?'body':'intro';path=`captains/captain_${stem}${has('gun')?'_no_gun':has('bullet')?'_no_bullet':''}.jpg`;
    if(has('gun')&&has('bullet')){$('patch').src=`captains/captain_${stem}_no_bullet.jpg`;$('patch').hidden=false;}
    if(!close)spot('Examine the captain',700,460,600,400,()=>go('captainBody'));
    else {if(!has('gun'))spot('Take pistol',500,295,430,180,()=>pickup('gun'));if(!has('bullet'))spot('Take cartridge',1030,480,140,140,()=>pickup('bullet'));}
    if(close)nav('Step back',()=>go('captain'));
    nav('↶ Turn around',()=>go('captainExit'));
  } else if(['mess','messBody','messBook'].includes(s)) {
    title='Mess hall';path=s==='mess'?`messhall/messhall_intro${has('book')?'_no_book':''}.jpg`:s==='messBody'?`messhall/messhall_full_body${has('book')?'_no_book':''}.jpg`:`messhall/messhall_${has('book')?'no_book':'book'}.jpg`;
    if(s==='mess')spot('Approach the crew member',200,380,400,440,()=>go('messBody'));
    if(s==='messBody')spot(has('book')?'Examine empty hand':'Examine the book',840,430,400,400,()=>go('messBook'));
    if(s==='messBook'&&!has('book'))spot('Take notebook',650,420,620,420,()=>pickup('book'));
    if(s!=='mess')nav('Step back',()=>go(s==='messBody'?'mess':'messBody'));
    nav('↶ Turn around',()=>go('messExit'));
  } else if(s==='control'||s==='panel') {
    title='Control room';path=`control/control_${s==='control'?'intro':'panel'}.jpg`;
    spot(s==='control'?'Inspect the control panel':state.messUnlocked?'Mess hall unlocked':'Press unlock button',s==='control'?650:680,s==='control'?540:350,600,350,()=>s==='control'?go('panel'):panel());
    nav(s==='control'?'Main passage':'Step back',()=>go(s==='control'?'hall':'control'));
  } else {title=s==='vent'?'Overhead vent':'Basement hatch';path=`hall_main/${s==='vent'?'hall_vent':'hall_basement_door'}.jpg`;spot('Inspect',700,300,520,480,()=>say(s==='vent'?'The vent is too narrow to enter. Somewhere beyond it, metal creaks.':'The hatch is jammed shut. This area is outside the current prototype.'));nav('Look ahead',()=>go('hall'));nav('↶ Turn around',turnAround);}
  $('scene').src=path;$('scene').alt=title;$('location').textContent=title;
  $('objective').textContent='OBJECTIVE · '+objective(state);
  for(const item of state.items){const b=button('',()=>inspect(item),$('inventory'));b.setAttribute('aria-label',`Inspect ${names[item]}`);const img=document.createElement('img');img.src=assets[item];img.alt='';b.append(img,document.createTextNode(names[item]));}
  if(!state.items.length){const p=document.createElement('p');p.className='empty';p.textContent='Nothing collected yet';$('inventory').append(p);}
  save();
}
function resize(){const scale=Math.min(innerWidth/1920,innerHeight/1080);$('stage').style.transform=`translate(-50%, -50%) scale(${scale})`;}
window.addEventListener('resize',resize);resize();render();
$('close-modal').onclick=()=>$('modal').close();
$('hints').onclick=()=>{const on=$('stage').classList.toggle('show-hotspots');$('hints').setAttribute('aria-pressed',String(on));};
$('map').onclick=()=>showModal('Deck plan','Your route runs between the captain’s quarters and the mess hall / control room junction.','hall_main/map.jpg');
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport').requestFullscreen();}catch{say('Fullscreen is unavailable in this browser. The viewport still scales to fit.');}};
$('restart').onclick=()=>showModal('Begin again?','This clears your saved progress and collected items.',null,{label:'Restart exploration',run:()=>{state=initialState();state.started=true;$('modal').close();render();say('There is a door behind you. Turn around and knock.');}});
document.addEventListener('keydown',e=>{if($('modal').open||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='h')$('hints').click();if(e.key.toLowerCase()==='m')$('map').click();if(e.key==='ArrowUp'&&state.scene==='hall'){e.preventDefault();move(state.direction);}if(e.key==='ArrowDown'&&state.scene==='hall'){e.preventDefault();turnAround();}if(e.key.toLowerCase()==='r')look('up');if(e.key.toLowerCase()==='f')look('down');if(e.key==='Escape'&&['vent','basement'].includes(state.scene))go('hall');});
if(!state.started){showModal('Silent running','You wake aboard a silent submarine. There is a door behind you. Turn around and knock, then find a way to open it. Click objects to investigate. Use H to reveal hotspots, M for the deck plan, the arrow keys to move or turn, and R / F to look up / down.',null,{label:'Begin exploration →',run:()=>{state.started=true;save();$('modal').close();}});}
say(objective(state)+'.');
