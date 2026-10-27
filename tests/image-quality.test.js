import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePanoramaEdges} from '../panorama.js';

test('the panorama wrap meets with matching colors and a smooth local correction', () => {
  const width=256, height=3, channels=4;
  const pixels = new Uint8ClampedArray(width*height*channels).fill(120);
  for (let y=0;y<height;y++) {
    const start=y*width*channels;
    pixels.set([108,110,112,255],start);
    pixels.set([132,130,128,200],start+(width-1)*channels);
  }
  const before = pixels.slice();
  assert.equal(reconcilePanoramaEdges(pixels,width,height),pixels);
  for (let y=0;y<height;y++) {
    const start=y*width*channels;
    assert.deepEqual(Array.from(pixels.slice(start,start+3)),[120,120,120]);
    assert.deepEqual(Array.from(pixels.slice(start+(width-1)*channels,start+(width-1)*channels+3)),[120,120,120]);
    assert.equal(pixels[start+3],255);
    assert.equal(pixels[start+(width-1)*channels+3],200);
    assert.deepEqual(pixels.slice(start+24*channels,start+(width-24)*channels),before.slice(start+24*channels,start+(width-24)*channels));
  }
  // A one-column mismatch must not create a new bright strip beside it.
  assert.deepEqual(pixels.slice(4,24*4),before.slice(4,24*4));
});

test('a wider wrap mismatch feathers away without overshooting either side', () => {
  const width=256;
  const pixels=new Uint8ClampedArray(width*4).fill(120);
  for(let offset=0;offset<24;offset++) for(let channel=0;channel<3;channel++) {
    pixels[offset*4+channel]=108;
    pixels[(width-1-offset)*4+channel]=132;
  }
  reconcilePanoramaEdges(pixels,width,1);
  assert.equal(pixels[0],120);
  assert.equal(pixels[23*4],108);
  for(let offset=1;offset<24;offset++) {
    assert.ok(pixels[offset*4]<=pixels[(offset-1)*4]);
    assert.ok(pixels[offset*4]>=108 && pixels[offset*4]<=120);
  }
});

test('matching edges and strong real object edges are preserved', () => {
  const pixels = new Uint8Array(64*3).fill(100);
  const original=pixels.slice();
  reconcilePanoramaEdges(pixels,64,1,3);
  assert.deepEqual(pixels,original);
  pixels.set([0,0,0],0);
  pixels.set([200,200,200],63*3);
  const highContrast=pixels.slice();
  reconcilePanoramaEdges(pixels,64,1,3);
  assert.deepEqual(pixels,highContrast);
});

test('edge reconciliation handles small images and rejects invalid pixel shapes', () => {
  const tiny=new Uint8Array(4*4).fill(50);
  assert.equal(reconcilePanoramaEdges(tiny,4,1),tiny);
  assert.throws(() => reconcilePanoramaEdges(new Uint8Array(10),64,2),RangeError);
});
