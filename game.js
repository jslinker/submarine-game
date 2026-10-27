import {PanoramaViewer, transitionFrame} from './panorama.js';
import {chooseStep, clamp, compassOptions, compassPoint, createWorld, normalizeYaw, parseMermaid} from './navigation.js';

const $ = id => document.getElementById(id);
const canvas = $('panorama');
const view = {yaw: 0, pitch: 0, fov: 80};
const TURN_DURATION = 320;
const manifestURL = new URL('./panoramas/manifest.json', import.meta.url);
const visited = new Set();
let viewer, world, locationId, loading = false, retryAction, frame, pointer, turn;
let movementButtons = [];
let mapPoints;
let manifestVersion = '';

function imageURL(location) {
  const url = new URL(location.file, manifestURL);
  if (manifestVersion) url.searchParams.set('v', manifestVersion);
  return url.href;
}

function preloadNeighbors() {
  const routes = compassOptions(world, locationId, view.yaw)
    .sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference));
  viewer.preload(routes.map(route => imageURL(world.locations[route.id])));
}

function showError(error, action = () => location.reload()) {
  $('error-title').textContent = viewer?.current ? "Couldn't move to that position" : "Couldn't open the submarine";
  $('error-message').textContent = error.message;
  $('error').hidden = false;
  retryAction = action;
}
function setLoading(value) {
  loading = value;
  $('explorer').setAttribute('aria-busy', String(value));
  for (const button of movementButtons) button.disabled = value;
}
function requestDraw() {
  if (!frame) frame = requestAnimationFrame(draw);
}
function draw(now) {
  frame = null;
  updateTurn(now);
  if (viewer?.draw(view, now)) requestDraw();
  const headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  $('heading').textContent = `${headings[Math.round(view.yaw / 45) % 8]} · ${String(Math.round(view.yaw) % 360).padStart(3, '0')}°`;
  $('compass-needle').style.setProperty('--heading', `${-view.yaw}deg`);
  $('compass-dial').style.transform = `rotate(${-view.yaw}deg)`;
  for (const cardinal of $('navigation').querySelectorAll('.compass-cardinal')) {
    const point = compassPoint(Number(cardinal.dataset.bearing), view.yaw, 15);
    cardinal.style.left = `${point.x}%`;
    cardinal.style.top = `${point.y}%`;
  }
  $('zoom-in').disabled = view.fov <= 45;
  $('zoom-out').disabled = view.fov >= 100;
  if (!world || !locationId) return;
  const options = compassOptions(world, locationId, view.yaw);
  for (const button of movementButtons) {
    const option = options.find(item => item.id === button.dataset.destination);
    button.style.setProperty('--bearing', `${option.difference}deg`);
    button.style.left = `${option.x}%`;
    button.style.top = `${option.y}%`;
    button.querySelector('.move-direction').textContent = option.direction;
    button.classList.toggle('ahead', option.direction === 'Ahead');
    button.setAttribute('aria-label', `${option.direction}: ${option.label}. Shortcut ${option.shortcut}`);
  }
  const point = mapPoints[locationId];
  $('map-facing').setAttribute('transform', `translate(${point[0]} ${point[1]}) rotate(${view.yaw})`);
}
function buildMovement() {
  const options = compassOptions(world, locationId, view.yaw);
  movementButtons = options.map(option => {
    const button = document.createElement('button');
    button.className = 'move-button';
    button.dataset.destination = option.id;
    button.innerHTML = '<span class="move-arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13l6-6 6 6M6 19l6-6 6 6"/></svg></span><span class="move-text"><span class="move-direction"></span><span class="move-label"></span></span><span class="move-key" aria-hidden="true"></span>';
    button.querySelector('.move-label').textContent = option.label;
    button.querySelector('.move-key').textContent = option.shortcut;
    button.title = `Move to ${option.label} · ${option.shortcut}`;
    button.setAttribute('aria-keyshortcuts', String(option.shortcut));
    button.addEventListener('click', () => move(option.id));
    return button;
  });
  $('compass-paths').replaceChildren(...movementButtons);
}
const svgElement = (name, attributes) => {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
};
function buildMap() {
  const nodes = Object.values(world.locations);
  const xs = nodes.map(node => node.position[0]);
  const ys = nodes.map(node => node.position[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(170 / (maxX - minX || 1), 240 / (maxY - minY || 1));
  mapPoints = Object.fromEntries(nodes.map(node => [node.id, [
    105 + (node.position[0] - (minX + maxX) / 2) * scale,
    142 + ((minY + maxY) / 2 - node.position[1]) * scale,
  ]]));
  const svg = $('deck-map');
  svg.setAttribute('viewBox', '0 0 210 285');
  for (const [a, b] of world.connections) svg.append(svgElement('line', {
    x1: mapPoints[a][0], y1: mapPoints[a][1], x2: mapPoints[b][0], y2: mapPoints[b][1], class: 'map-line',
  }));
  svg.append(svgElement('path', {id: 'map-facing', class: 'map-facing', d: 'M0 0 L-13 -25 Q0 -31 13 -25 Z'}));
  for (const node of nodes) {
    const circle = svgElement('circle', {cx: mapPoints[node.id][0], cy: mapPoints[node.id][1], r: 4.5, class: 'map-node', 'data-location': node.id});
    const title = svgElement('title', {});
    title.textContent = node.label;
    circle.append(title);
    svg.append(circle);
  }
}

function buildCompass() {
  for (let angle = 0; angle < 360; angle += 10) {
    $('compass-ticks').append(svgElement('line', {x1: 150, y1: 23, x2: 150,
      y2: angle % 90 === 0 ? 37 : 30, transform: `rotate(${angle} 150 150)`}));
  }
}
async function move(destination) {
  if (loading || destination === locationId) return;
  if (locationId && !world.locations[locationId].neighbors.includes(destination)) return;
  setLoading(true);
  $('error').hidden = true;
  const hadNavigationFocus = $('navigation').contains(document.activeElement);
  try {
    const location = world.locations[destination];
    const texture = await viewer.load(imageURL(location));
    const arrival = viewer.show(texture, world.locations[locationId]?.position, location.position);
    $('explorer').setAttribute('data-moving', 'true');
    requestDraw();
    // Keep movement locked until arrival so rapid clicks cannot skip views or
    // start a second transition from a half-blended image.
    await arrival;
    locationId = destination;
    visited.add(destination);
    $('location').textContent = location.label;
    const ids = Object.keys(world.locations);
    $('position-number').textContent = `POSITION ${String(ids.indexOf(locationId) + 1).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}`;
    $('explored').textContent = `${visited.size} / ${ids.length} visited`;
    $('status').textContent = `${location.label}. ${location.neighbors.length} available paths.`;
    for (const node of $('deck-map').querySelectorAll('.map-node')) {
      node.classList.toggle('current', node.dataset.location === destination);
      node.classList.toggle('visited', visited.has(node.dataset.location));
    }
    buildMovement();
    document.title = `${location.label} — Submarine`;
    requestDraw();
    preloadNeighbors();
    if (hadNavigationFocus) canvas.focus({preventScroll: true});
  } catch (error) {
    showError(error, () => move(destination));
  } finally {
    $('explorer').removeAttribute('data-moving');
    setLoading(false);
  }
}
function look(yaw, pitch, fov = view.fov) {
  turn = null;
  view.yaw = normalizeYaw(yaw);
  view.pitch = clamp(pitch, -90, 90);
  view.fov = clamp(fov, 45, 100);
  requestDraw();
}
function nextQuarterTurn(angle, direction) {
  return (direction > 0 ? Math.floor(angle / 90) + 1 : Math.ceil(angle / 90) - 1) * 90;
}
function updateTurn(now) {
  if (!turn) return;
  const {progress, active} = transitionFrame(now - turn.started, viewer?.motionPreference.matches ? 0 : TURN_DURATION);
  turn.currentYaw = turn.fromYaw + (turn.yaw - turn.fromYaw) * progress;
  view.yaw = normalizeYaw(turn.currentYaw);
  view.pitch = turn.fromPitch + (turn.pitch - turn.fromPitch) * progress;
  if (active) requestDraw();
  else turn = null;
}
function snapTurn(yawDirection, pitchDirection) {
  const now = performance.now();
  updateTurn(now);
  // Keep yaw unwrapped during a turn so crossing north follows the pressed
  // direction. Repeated presses advance the target; reversing turns back now.
  const fromYaw = turn?.currentYaw ?? view.yaw;
  const yawTarget = turn?.yaw ?? view.yaw;
  const pitchTarget = turn?.pitch ?? view.pitch;
  const yawBase = Math.sign(yawTarget - fromYaw) === yawDirection ? yawTarget : fromYaw;
  const pitchBase = Math.sign(pitchTarget - view.pitch) === pitchDirection ? pitchTarget : view.pitch;
  turn = {
    fromYaw, fromPitch: view.pitch, currentYaw: fromYaw,
    yaw: yawDirection ? nextQuarterTurn(yawBase, yawDirection) : yawTarget,
    pitch: pitchDirection ? clamp(nextQuarterTurn(pitchBase, pitchDirection), -90, 90) : pitchTarget,
    started: now,
  };
  requestDraw();
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointer) return;
  event.preventDefault();
  updateTurn(performance.now());
  turn = null;
  canvas.focus({preventScroll: true});
  pointer = {id: event.pointerId, x: event.clientX, y: event.clientY};
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', event => {
  if (pointer?.id !== event.pointerId) return;
  const sensitivity = view.fov / canvas.clientWidth * 1.3;
  look(view.yaw - (event.clientX - pointer.x) * sensitivity, view.pitch + (event.clientY - pointer.y) * sensitivity);
  pointer.x = event.clientX;
  pointer.y = event.clientY;
});
function stopDragging() { pointer = null; canvas.classList.remove('dragging'); }
canvas.addEventListener('pointerup', stopDragging);
canvas.addEventListener('pointercancel', stopDragging);
canvas.addEventListener('lostpointercapture', stopDragging);
window.addEventListener('blur', stopDragging);
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  showError(new Error('The graphics connection was interrupted. Reload to continue.'));
});
canvas.addEventListener('webglcontextrestored', () => location.reload());
window.addEventListener('resize', () => { viewer?.resize(); requestDraw(); });
$('north').onclick = () => look(0, 0);
$('zoom-in').onclick = () => look(view.yaw, view.pitch, view.fov - 10);
$('zoom-out').onclick = () => look(view.yaw, view.pitch, view.fov + 10);
$('map-toggle').onclick = () => {
  const open = $('map-panel').hidden;
  $('map-panel').hidden = !open;
  $('map-toggle').setAttribute('aria-expanded', String(open));
  $('map-toggle').setAttribute('aria-label', open ? 'Hide deck map' : 'Show deck map');
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('explorer').requestFullscreen();
  } catch { $('status').textContent = 'Fullscreen is unavailable in this browser.'; }
};
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});
$('retry').onclick = () => retryAction?.();
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  const turns = {arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1]};
  if (turns[key]) {
    event.preventDefault();
    if (event.repeat) return;
    snapTurn(...turns[key]);
  } else if (key === 'm') $('map-toggle').click();
  else if (key === 'escape' && !$('map-panel').hidden) $('map-toggle').click();
  else if (world && locationId && !loading) {
    if (/^[1-9]$/.test(key)) movementButtons[Number(key) - 1]?.click();
    const headings = {w: 0, d: 90, s: 180, a: -90};
    if (Object.hasOwn(headings, key)) {
      const destination = chooseStep(world, locationId, view.yaw, headings[key]);
      if (destination) move(destination);
      else $('status').textContent = 'There is no connected path in that direction.';
    }
  }
});
async function readManifest() {
  const response = await fetch(manifestURL, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`Couldn't load ${manifestURL.pathname} (${response.status}).`);
  // Rerendered files keep their names. Version image URLs with the manifest so
  // preloading cannot bring back pictures from an earlier render pass.
  manifestVersion = response.headers.get('etag') || response.headers.get('last-modified') || String(Date.now());
  return response.json();
}
async function readMap() {
  const response = await fetch(new URL('./map.mmd', import.meta.url));
  if (!response.ok) throw new Error(`Could not load map.mmd (${response.status}).`);
  return parseMermaid(await response.text());
}
async function boot() {
  try {
    viewer = new PanoramaViewer(canvas);
    const [manifest, navigation] = await Promise.all([
      readManifest(), readMap(),
    ]);
    world = createWorld(manifest, navigation);
    view.yaw = world.initialYaw;
    buildCompass();
    buildMap();
    loading = false;
    await move(world.start);
  } catch (error) {
    setLoading(false);
    showError(error);
  }
}
boot();
