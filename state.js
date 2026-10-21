export const SAVE_KEY = 'submarine-game-v1';
export const initialState = () => ({scene:'hall',position:0,direction:1,items:[],powered:false,started:false});
export function sanitizeState(raw) {
  const state=initialState();
  if(!raw || typeof raw!=='object') return state;
  const scenes=['hall','captain','captainBody','mess','messBody','messBook','control','panel','vent','basement'];
  state.scene=scenes.includes(raw.scene)?raw.scene:'hall';
  state.position=Number.isInteger(raw.position)?Math.max(0,Math.min(4,raw.position)):0;
  state.direction=raw.direction===-1?-1:1;
  state.items=[...new Set(Array.isArray(raw.items)?raw.items.filter(x=>['book','key','gun','bullet'].includes(x)):[])];
  state.powered=raw.powered===true && state.items.includes('key');
  state.started=raw.started===true;
  return state;
}
export function collect(state,item) {
  if(!['book','key','gun','bullet'].includes(item)) return false;
  if(item==='key' && !state.items.includes('book')) return false;
  if(state.items.includes(item)) return false;
  state.items.push(item); return true;
}
export function activatePanel(state) {
  if(!state.items.includes('key')) return false;
  state.powered=true; return true;
}
