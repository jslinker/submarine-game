import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,sanitizeState,collect,activatePanel,canEnter,unlockCaptain} from '../state.js';
test('gameplay follows control button, notebook key, captain, then gun and bullet',()=>{
  const s=initialState();
  assert.equal(canEnter(s,'mess'),false);
  assert.equal(collect(s,'book'),false);
  assert.equal(unlockCaptain(s),false);
  assert.equal(collect(s,'gun'),false);
  s.knocked=true;
  activatePanel(s);
  assert.equal(canEnter(s,'mess'),true);
  assert.equal(canEnter(s,'captain'),false);
  assert.equal(collect(s,'key'),false);
  assert.equal(collect(s,'book'),true);
  assert.equal(collect(s,'key'),true);
  assert.equal(unlockCaptain(s),true);
  assert.equal(canEnter(s,'captainBody'),true);
  collect(s,'gun');
  collect(s,'bullet');
  assert.equal(collect(s,'bullet'),false);
  assert.deepEqual(sanitizeState(s),s);
});
test('restored saves cannot bypass locked rooms or manufacture ammunition',()=>{
  const s=sanitizeState({scene:'captainBody',position:500,items:['gun','bullet','key'],gunLoaded:true,captainUnlocked:true});
  assert.equal(s.scene,'hall');assert.equal(s.position,4);
  assert.deepEqual(s.items,[]);assert.equal('gunLoaded' in s,false);
  assert.equal(sanitizeState({scene:'messBook'}).scene,'hall');
  assert.deepEqual(sanitizeState(null),initialState());
});
test('button needs no key and repeated activation preserves progress',()=>{
  const s=initialState();activatePanel(s);collect(s,'book');activatePanel(s);
  assert.equal(s.messUnlocked,true);assert.deepEqual(s.items,['book']);
  assert.equal(collect(s,'book'),false);assert.equal(collect(s,'invalid'),false);
});
