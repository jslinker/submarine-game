// A new save slot prevents the old power-restoration puzzle bypassing these locks.
export const SAVE_KEY = 'submarine-game-v2';
export const initialState = () => ({
  scene: 'hall', position: 0, direction: 1, items: [], started: false,
  knocked: false, messUnlocked: false, captainUnlocked: false,
});
export function sanitizeState(raw) {
  const state = initialState();
  if (!raw || typeof raw !== 'object') return state;
  const scenes = ['hall', 'captainDoor', 'captain', 'captainBody', 'mess', 'messBody', 'messBook', 'control', 'panel', 'vent', 'basement'];
  state.scene = scenes.includes(raw.scene) ? raw.scene : 'hall';
  state.position = Number.isInteger(raw.position) ? Math.max(0, Math.min(4, raw.position)) : 0;
  state.direction = raw.direction === -1 ? -1 : 1;
  state.started = raw.started === true;
  state.knocked = raw.knocked === true;
  state.messUnlocked = raw.messUnlocked === true;
  const items = Array.isArray(raw.items) ? raw.items : [];
  if (state.messUnlocked && items.includes('book')) state.items.push('book');
  if (state.items.includes('book') && items.includes('key')) state.items.push('key');
  state.captainUnlocked = raw.captainUnlocked === true && state.items.includes('key');
  if (state.captainUnlocked) {
    for (const item of ['gun', 'bullet']) if (items.includes(item)) state.items.push(item);
  }
  if (!canEnter(state, state.scene)) state.scene = 'hall';
  return state;
}
export function canEnter(state, scene) {
  if (['mess', 'messBody', 'messBook'].includes(scene)) return state.messUnlocked;
  if (['captain', 'captainBody'].includes(scene)) return state.captainUnlocked;
  return true;
}
export function collect(state, item) {
  if (!['book', 'key', 'gun', 'bullet'].includes(item) || state.items.includes(item)) return false;
  if (item === 'book' && !state.messUnlocked) return false;
  if (item === 'key' && !state.items.includes('book')) return false;
  if (['gun', 'bullet'].includes(item) && !state.captainUnlocked) return false;
  state.items.push(item);
  return true;
}
export function activatePanel(state) { state.messUnlocked = true; }
export function unlockCaptain(state) {
  if (!state.items.includes('key')) return false;
  state.captainUnlocked = true;
  return true;
}
export function objective(state) {
  if (!state.knocked && !state.captainUnlocked) return 'Turn around and knock on the door behind you';
  if (!state.messUnlocked) return 'Find a way to unlock the mess hall';
  if (!state.items.includes('book')) return 'Search the mess hall for the notebook';
  if (!state.items.includes('key')) return 'Inspect the notebook for the key';
  if (!state.captainUnlocked) return 'Use the key on the captain’s quarters';
  if (!['gun', 'bullet'].every(item => state.items.includes(item))) return 'Search the captain’s quarters for a gun and bullet';
  return 'Gun and bullet collected · Further gameplay to come';
}
