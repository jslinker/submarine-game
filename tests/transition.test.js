import test from 'node:test';
import assert from 'node:assert/strict';
import {MOVE_DURATION, transitionFrame, travelVector} from '../panorama.js';

test('travel starts and ends on the exact source and destination images', () => {
  assert.deepEqual(transitionFrame(0,MOVE_DURATION), {progress:0,blend:0,active:true});
  assert.deepEqual(transitionFrame(MOVE_DURATION,MOVE_DURATION), {progress:1,blend:1,active:false});
  assert.deepEqual(transitionFrame(MOVE_DURATION*10,MOVE_DURATION), {progress:1,blend:1,active:false});
  const midpoint = transitionFrame(MOVE_DURATION/2,MOVE_DURATION);
  assert.equal(midpoint.progress,.5);
  assert.ok(Math.abs(midpoint.blend-.5)<1e-10);
});

test('camera motion and blending ease monotonically without endpoint jumps', () => {
  let previous = {progress:0,blend:0};
  for (let elapsed=0; elapsed<=MOVE_DURATION; elapsed++) {
    const frame = transitionFrame(elapsed,MOVE_DURATION);
    assert.ok(frame.progress>=previous.progress && frame.progress<=1);
    assert.ok(frame.blend>=previous.blend && frame.blend<=1);
    previous = frame;
  }
  assert.ok(transitionFrame(1,MOVE_DURATION).progress<1e-6);
  assert.ok(1-transitionFrame(MOVE_DURATION-1,MOVE_DURATION).progress<1e-6);
  assert.ok(transitionFrame(MOVE_DURATION/4,MOVE_DURATION).progress<.25);
  assert.ok(transitionFrame(MOVE_DURATION*3/4,MOVE_DURATION).progress>.75);
});

test('reduced motion arrives immediately without a camera displacement', () => {
  assert.deepEqual(transitionFrame(0,0), {progress:1,blend:1,active:false});
  assert.deepEqual(travelVector(undefined,[1,2,3]), [0,0,0]);
  assert.deepEqual(travelVector([1,2,3],[1,2,3]), [0,0,0]);
});

test('travel follows the selected world direction, including backward and sideways moves', () => {
  const from = [0,0,0];
  const north = travelVector(from,[0,5,0]);
  const south = travelVector(from,[0,-5,0]);
  const east = travelVector(from,[5,0,0]);
  assert.equal(north[0],0);
  assert.ok(north[1]>0);
  assert.equal(south[1],-north[1]);
  assert.equal(east[0],north[1]);
  assert.equal(east[1],0);
  assert.deepEqual(from,[0,0,0]);
  const diagonal = travelVector(from,[3,4,0]);
  assert.ok(Math.abs(diagonal[0]/diagonal[1]-.75)<1e-10);
  assert.ok(Math.hypot(...travelVector(from,[0,1000,0]))<=.28+1e-10);
});
