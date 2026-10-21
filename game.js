import {SAVE_KEY,initialState,sanitizeState,collect,activatePanel} from './state.js';
const $=id=>document.getElementById(id);
let state=initialState();
try {state=sanitizeState(JSON.parse(localStorage.getItem(SAVE_KEY)));} catch {}
const names={book:'Logbook',key:'Brass key',gun:'Pistol',bullet:'Cartridge'};
const assets={book:'inventory/book_inventory.jpg',key:'inventory/key_inventory.jpg',gun:'inventory/gun_inventory.jpg',bullet:'inventory/bullet_inventory.jpg'};
const has=item=>state.items.includes(item);
const say=text=>{$('message').textContent=text;};
const save=()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{}};
function button(label,action,parent) {const b=document.createElement('button');b.textContent=label;b.onclick=action;parent.append(b);return b;}
function spot(label,x,y,w,h,action) {const b=button('',action,$('hotspots'));b.className='hotspot';b.setAttribute('aria-label',label);Object.assign(b.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});const span=document.createElement('span');span.textContent=label;b.append(span);}
function go(scene) {state.scene=scene;render();say('Click to investigate. Press H to reveal points of interest.');}
function move(delta) {state.position=Math.max(0,Math.min(4,state.position+delta));go('hall');}
function showModal(title,text,src,action) {const content=$('modal-content');content.replaceChildren();const h=document.createElement('h2');h.textContent=title;content.append(h);if(src){const img=document.createElement('img');img.src=src;img.alt=title;if(src.endsWith('map.jpg'))img.className='deck-map';content.append(img);}if(text){const p=document.createElement('p');p.textContent=text;content.append(p);}if(action)button(action.label,action.run,content);if(!$('modal').open)$('modal').showModal();}
function pickup(item) {if(collect(state,item)){render();say(`${names[item]} collected. Inspect it in your personal effects.`);}}
function inspect(item) {
  if(item==='book')showModal('The last entry',has('key')?'“Emergency power: the brass key fits the control panel. Turn it, and bring us back.” The recess in the cover is empty.':'“Emergency power: the brass key fits the control panel. Turn it, and bring us back.” A small key is tucked inside the cover.',has('key')?'inventory/book_inventory.jpg':'inventory/key_book_inventory.jpg',has('key')?null:{label:'Take the brass key',run:()=>{pickup('key');$('modal').close();}});
  else showModal(names[item],{key:'A small brass key. The logbook points to the control room.',gun:'The captain’s pistol. It may explain what happened here, but it will not restore power.',bullet:'A single cartridge. You pocket it as evidence.'}[item],assets[item]);
}
function panel() {if(!activatePanel(state)){say('The emergency control is locked. Find a key; someone may have left a clue in the mess hall.');return;}render();showModal('The submarine answers.','Emergency power returns. A low vibration travels through the hull. For the first time since you woke, the boat feels alive. Prototype complete — you can keep exploring.',null,{label:'Continue exploring',run:()=>$('modal').close()});}
function render() {
  $('hotspots').replaceChildren();$('navigation').replaceChildren();$('inventory').replaceChildren();$('patch').hidden=true;
  let path,title; const s=state.scene;
  const nav=(label,fn)=>button(label,fn,$('navigation'));
  if(s==='hall') {
    title='Main passage';path=state.direction===1?`hall_main/hall_up_0${state.position+1}.jpg`:`hall_main/hall_down_0${Math.max(1,4-state.position)}.jpg`;
    if(state.direction===1&&state.position<4)spot('Move forward',810,310,300,430,()=>move(1));
    if(state.direction===-1&&state.position>0)spot('Move forward',810,310,300,430,()=>move(-1));
    if(state.position===0)nav('Captain’s quarters',()=>go('captain'));
    if(state.position===1)nav('Basement hatch',()=>go('basement'));
    if(state.position===2)nav('Look up · Vent',()=>go('vent'));
    if(state.position===3||state.position===4){nav('Mess hall',()=>go('mess'));nav('Control room',()=>go('control'));}
    nav('↶ Turn around',()=>{state.direction*=-1;render();});
    if(state.position+state.direction>=0&&state.position+state.direction<=4)nav('Forward ↑',()=>move(state.direction));
    if(state.position===4&&state.direction===1)spot('Sealed bulkhead',840,320,240,300,()=>say('The forward bulkhead is sealed. The control room is beside you.'));
  } else if(s==='captain'||s==='captainBody') {
    const close=s==='captainBody';title='Captain’s quarters';const stem=close?'body':'intro';path=`captains/captain_${stem}${has('gun')?'_no_gun':has('bullet')?'_no_bullet':''}.jpg`;
    if(has('gun')&&has('bullet')){$('patch').src=`captains/captain_${stem}_no_bullet.jpg`;$('patch').hidden=false;}
    if(!close)spot('Examine the captain',700,460,600,400,()=>go('captainBody'));
    else {if(!has('gun'))spot('Take pistol',500,295,430,180,()=>pickup('gun'));if(!has('bullet'))spot('Take cartridge',1030,480,140,140,()=>pickup('bullet'));}
    nav(close?'Step back':'Main passage',()=>go(close?'captain':'hall'));
  } else if(['mess','messBody','messBook'].includes(s)) {
    title='Mess hall';path=s==='mess'?`messhall/messhall_intro${has('book')?'_no_book':''}.jpg`:s==='messBody'?`messhall/messhall_full_body${has('book')?'_no_book':''}.jpg`:`messhall/messhall_${has('book')?'no_book':'book'}.jpg`;
    if(s==='mess')spot('Approach the crew member',200,380,400,440,()=>go('messBody'));
    if(s==='messBody')spot(has('book')?'Examine empty hand':'Examine the book',840,430,400,400,()=>go('messBook'));
    if(s==='messBook'&&!has('book'))spot('Take logbook',650,420,620,420,()=>pickup('book'));
    nav(s==='mess'?'Main passage':'Step back',()=>go(s==='mess'?'hall':s==='messBody'?'mess':'messBody'));
  } else if(s==='control'||s==='panel') {
    title='Control room';path=`control/control_${s==='control'?'intro':'panel'}.jpg`;
    spot(s==='control'?'Inspect the control panel':state.powered?'Power restored':'Turn emergency control',s==='control'?650:680,s==='control'?540:350,600,350,()=>s==='control'?go('panel'):state.powered?say('Emergency power is online. You completed the prototype.'):panel());
    nav(s==='control'?'Main passage':'Step back',()=>go(s==='control'?'hall':'control'));
  } else {title=s==='vent'?'Overhead vent':'Basement hatch';path=`hall_main/${s==='vent'?'hall_vent':'hall_basement_door'}.jpg`;spot('Inspect',700,300,520,480,()=>say(s==='vent'?'The vent is too narrow to enter. Somewhere beyond it, metal creaks.':'The hatch is jammed shut. This area is outside the current prototype.'));nav('Main passage',()=>go('hall'));}
  $('scene').src=path;$('scene').alt=title;$('location').textContent=title;
  $('objective').textContent=state.powered?'EMERGENCY POWER ONLINE · Exploration continues':'OBJECTIVE · Restore emergency power';
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
$('restart').onclick=()=>showModal('Begin again?','This clears your saved progress and collected items.',null,{label:'Restart exploration',run:()=>{state=initialState();state.started=true;$('modal').close();render();say('Find a way to restore emergency power.');}});
document.addEventListener('keydown',e=>{if($('modal').open||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key.toLowerCase()==='h')$('hints').click();if(e.key.toLowerCase()==='m')$('map').click();if(e.key==='ArrowUp'&&state.scene==='hall'){e.preventDefault();move(state.direction);}if(e.key==='ArrowDown'&&state.scene==='hall'){e.preventDefault();state.direction*=-1;render();}});
if(!state.started){showModal('Silent running','You wake aboard a silent submarine. Explore the passage, inspect the rooms, and find a way to restore emergency power. Click objects to investigate. Use H to reveal hotspots, M for the deck plan, and the arrow keys to move or turn.',null,{label:'Begin exploration →',run:()=>{state.started=true;save();$('modal').close();}});}
say(state.powered?'Emergency power is online. You completed the prototype.':'The boat is silent. Find a way to restore emergency power.');
