import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {angleDifference, bearing, chooseStep, compassOptions, compassPoint, createWorld, movementOptions, normalizeYaw, parseMermaid} from '../navigation.js';

// A fixed layout fixture keeps authoring map.mmd independent of unit test edits.
const navigation = parseMermaid(`%% start: stand_00
flowchart BT
stand_07 <--> stand_00
stand_00 <--> stand_01
stand_01 <--> stand_02
stand_02 <--> stand_03
stand_03 <--> stand_06
stand_02 <--> stand_04
stand_04 <--> stand_08
stand_02 <--> stand_05
`);
// Measured Blender camera positions. Assets are tested against these at build time.
const positions = {
  stand_00: [.0171, -4.1960, 1.1453], stand_01: [.0171, -.0577, 1.1453],
  stand_02: [.0171, 6.4078, 1.1453], stand_03: [-2.7538, 6.4078, 1.1453],
  stand_04: [3.2538, 6.4078, 1.1453], stand_05: [.0171, 9.8656, 1.1453],
  stand_06: [-2.7538, .2502, 1.1453], stand_07: [-.0303, -7.4705, 1.1453],
  stand_08: [3.2538, .5535, 1.1453],
};
const manifest = {projection: 'equirectangular', width: 2048, height: 1024,
  locations: Object.fromEntries(Object.entries(positions).map(([id, position]) => [id, {file: `${id}.jpg`, position}]))};
const world = createWorld(manifest, navigation);

test('the editable Mermaid map matches the actual exported camera manifest', async () => {
  const [mapSource, manifestSource] = await Promise.all([
    readFile(new URL('../map.mmd',import.meta.url),'utf8'),
    readFile(new URL('../panoramas/manifest.json',import.meta.url),'utf8'),
  ]);
  const authored = createWorld(JSON.parse(manifestSource),parseMermaid(mapSource));
  for (const location of Object.values(authored.locations)) {
    assert.ok((await readFile(new URL(`../panoramas/${location.file}`,import.meta.url))).length > 0);
  }
});

test('Mermaid is the source of labels, start position, heading, and chained passages', () => {
  const parsed = parseMermaid(`%% start: b
%% yaw: -90
flowchart LR
  subgraph passage["Passage"]
    a["Aft"] <--> b["Middle"] --- c["Forward"]
  end
  style a fill:#fff
`);
  assert.equal(parsed.start,'b');
  assert.equal(parsed.initialYaw,-90);
  assert.equal(parsed.nodes.a.label,'Aft');
  assert.deepEqual(parsed.connections,[['a','b'],['b','c']]);
});

test('Mermaid one-way arrows do not create a return route', () => {
  const parsed = parseMermaid('flowchart LR\na["A"] --> b["B"] <--> c["C"]');
  const assets = {projection:'equirectangular',width:8,height:4,locations:{
    a:{file:'a.jpg',position:[0,0,0]}, b:{file:'b.jpg',position:[1,0,0]}, c:{file:'c.jpg',position:[2,0,0]},
  }};
  const graph = createWorld(assets,parsed);
  assert.deepEqual(graph.locations.a.neighbors,['b']);
  assert.deepEqual(graph.locations.b.neighbors,['c']);
  assert.deepEqual(graph.locations.c.neighbors,['b']);
});

test('unsupported Mermaid edge syntax gives an actionable line number', () => {
  assert.throws(() => parseMermaid('flowchart BT\na["A"] -- north --> b["B"]'), /map.mmd line 2.*Use/);
  assert.throws(() => parseMermaid('a <--> b'), /flowchart/);
  assert.throws(() => parseMermaid('flowchart BT'), /at least one/);
});

test('bearings follow actual world coordinates and handle vertical travel', () => {
  for (const [position, yaw] of [[[0,1,0],0],[[1,0,0],90],[[0,-1,0],180],[[-1,0,0],270]]) {
    assert.equal(bearing([0,0,0], position).yaw, yaw);
  }
  assert.equal(bearing([0,0,0],[0,0,1]).yaw, null);
  assert.equal(bearing([0,0,0],[0,0,1]).pitch, 90);
  assert.equal(normalizeYaw(-10), 350);
  assert.equal(angleDifference(5,355), 10);
  assert.equal(angleDifference(355,5), -10);
});

test('all nine cameras are reachable and every passage is reversible', () => {
  assert.equal(Object.keys(world.locations).length, 9);
  for (const [a,b] of world.connections) {
    assert.ok(world.locations[a].neighbors.includes(b));
    assert.ok(world.locations[b].neighbors.includes(a));
    const forward = bearing(world.locations[a].position,world.locations[b].position).yaw;
    const reverse = bearing(world.locations[b].position,world.locations[a].position).yaw;
    assert.ok(Math.abs(Math.abs(angleDifference(forward,reverse))-180) < 1e-8);
  }
});

test('side compartments are entered at the forward junction, not through corridor walls', () => {
  assert.deepEqual(new Set(world.locations.stand_01.neighbors), new Set(['stand_00','stand_02']));
  assert.deepEqual(new Set(world.locations.stand_03.neighbors), new Set(['stand_02','stand_06']));
  assert.deepEqual(new Set(world.locations.stand_04.neighbors), new Set(['stand_02','stand_08']));
  assert.equal(chooseStep(world,'stand_01',90), null);
});

test('movement arrows and keyboard travel rotate relative to the current view', () => {
  const directions = Object.fromEntries(movementOptions(world,'stand_02',90).map(option => [option.id,option.direction]));
  assert.equal(directions.stand_04,'Ahead');
  assert.equal(directions.stand_03,'Behind');
  assert.equal(directions.stand_05,'Left');
  assert.equal(directions.stand_01,'Right');
  assert.equal(chooseStep(world,'stand_02',0),'stand_05');
  assert.equal(chooseStep(world,'stand_02',90),'stand_04');
  assert.equal(chooseStep(world,'stand_02',90,-90),'stand_05');
  assert.equal(chooseStep(world,'stand_02',355),'stand_05');
});

test('the compass places routes around the dial relative to the viewing direction', () => {
  assert.deepEqual(compassPoint(0,0), {x:50,y:16});
  assert.deepEqual(compassPoint(90,0), {x:84,y:50});
  const south = compassPoint(180,0);
  assert.ok(Math.abs(south.x-50)<1e-8);
  assert.equal(south.y,84);
  const northWhenFacingEast = compassPoint(0,90);
  assert.equal(northWhenFacingEast.x,16);
  assert.ok(Math.abs(northWhenFacingEast.y-50)<1e-8);
  assert.deepEqual(compassPoint(90,90), {x:50,y:16});
  assert.deepEqual(compassPoint(0,360), compassPoint(0,0));
});

test('compass shortcuts and destination bindings stay stable while looking around', () => {
  const north = compassOptions(world,'stand_02',0);
  const east = compassOptions(world,'stand_02',90);
  const bindings = options => options.map(({id,shortcut}) => [id,shortcut]);
  assert.deepEqual(bindings(north), bindings(east));
  assert.deepEqual(bindings(north), [['stand_05',1],['stand_04',2],['stand_01',3],['stand_03',4]]);
  assert.equal(north.find(option => option.id==='stand_05').y,16);
  assert.equal(east.find(option => option.id==='stand_04').y,16);
  assert.equal(east.find(option => option.id==='stand_05').direction,'Left');
});

test('bad asset maps and graph edits fail before the game starts', () => {
  const altered = patch => ({...navigation,...patch});
  assert.throws(() => createWorld(manifest,altered({start:'absent'})), /starting location/);
  assert.throws(() => createWorld(manifest,altered({connections:[...navigation.connections,['stand_00','missing']]})), /Invalid connection/);
  assert.throws(() => createWorld(manifest,altered({connections:[...navigation.connections,['stand_01','stand_00']]})), /Duplicate/);
  assert.throws(() => createWorld(manifest,altered({connections:navigation.connections.slice(1)})), /cannot be reached/);
  const missing = structuredClone(manifest);
  delete missing.locations.stand_03;
  assert.throws(() => createWorld(missing,navigation), /same locations/);
  const coincident = structuredClone(manifest);
  coincident.locations.stand_01.position = coincident.locations.stand_00.position;
  assert.throws(() => createWorld(coincident,navigation), /identical positions/);
  assert.throws(() => createWorld({...manifest,width:1920,height:1080},navigation), /2:1/);
});
