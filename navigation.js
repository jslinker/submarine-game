export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const normalizeYaw = degrees => ((degrees % 360) + 360) % 360;
export const angleDifference = (target, current) => normalizeYaw(target - current + 180) - 180;

// A deliberately small, documented Mermaid flowchart dialect. The same parser
// runs in the browser and build so the editable diagram is the actual game map.
export function parseMermaid(source) {
  const nodes = {};
  const connections = [], oneWayConnections = [];
  let start, initialYaw = 0, header = false;
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const nodePattern = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)*)(?:\[\s*(?:"((?:[^"\\]|\\.)*)"|([^\]\n]+))\s*\])?/;
  for (const [index, original] of lines.entries()) {
    let line = original.trim();
    const fail = message => { throw new Error(`map.mmd line ${index + 1}: ${message}`); };
    const startDirective = line.match(/^%%\s*start:\s*([a-z][a-z0-9_]*)\s*$/);
    const yawDirective = line.match(/^%%\s*yaw:\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (startDirective) { start = startDirective[1]; continue; }
    if (yawDirective) { initialYaw = Number(yawDirective[1]); continue; }
    if (/^%%\s*(start|yaw):/.test(line)) fail('Use %% start: location_id or %% yaw: 0.');
    if (!line || line.startsWith('%%')) continue;
    line = line.replace(/;\s*$/, '');
    if (/^(flowchart|graph)\s+(TB|TD|BT|LR|RL)$/.test(line)) { header = true; continue; }
    if (!header) fail('Start the diagram with flowchart BT (or another Mermaid direction).');
    if (/^(subgraph\b|end$|direction\s|classDef\s|class\s|style\s|linkStyle\s)/.test(line)) continue;
    const readNode = () => {
      const match = line.match(nodePattern);
      if (!match) fail('Expected a location ID, optionally followed by ["Location name"].');
      const id = match[1];
      let label;
      if (match[2] !== undefined) {
        try { label = JSON.parse(`"${match[2]}"`); } catch { fail('The location label has an invalid quoted string.'); }
      } else if (match[3] !== undefined) label = match[3].trim();
      if (!Object.hasOwn(nodes, id)) nodes[id] = {label: id};
      if (label !== undefined) nodes[id].label = label;
      line = line.slice(match[0].length).trim();
      return id;
    };
    let from = readNode();
    while (line) {
      if (line.startsWith('%%')) break;
      const edge = line.match(/^(<-->|---|-->)\s*/);
      if (!edge) fail('Use <--> or --- for a two-way passage, or --> for one-way travel.');
      line = line.slice(edge[0].length).trim();
      const to = readNode();
      (edge[1] === '-->' ? oneWayConnections : connections).push([from, to]);
      from = to;
    }
  }
  if (!header || !Object.keys(nodes).length) throw new Error('map.mmd needs a Mermaid flowchart with at least one location.');
  return {nodes, connections, oneWayConnections, start: start ?? Object.keys(nodes)[0], initialYaw};
}

export function bearing(from, to) {
  const [x, y, z] = to.map((value, index) => value - from[index]);
  const horizontal = Math.hypot(x, y);
  return {
    yaw: horizontal < 1e-6 ? null : normalizeYaw(Math.atan2(x, y) * 180 / Math.PI),
    pitch: Math.atan2(z, horizontal) * 180 / Math.PI,
    distance: Math.hypot(horizontal, z),
  };
}

export function relativeDirection(difference) {
  if (Math.abs(difference) < 45) return 'Ahead';
  if (Math.abs(difference) >= 135) return 'Behind';
  return difference > 0 ? 'Right' : 'Left';
}

export function createWorld(manifest, navigation) {
  if (manifest.projection !== 'equirectangular' || manifest.width !== manifest.height * 2) {
    throw new Error('The render manifest must describe 2:1 equirectangular panoramas.');
  }
  if (!navigation.nodes || !Array.isArray(navigation.connections) || !manifest.locations) {
    throw new Error('The location manifest or navigation graph is incomplete.');
  }
  const ids = Object.keys(navigation.nodes);
  if (!ids.length || ids.length !== Object.keys(manifest.locations).length) {
    throw new Error('Navigation and render manifests must contain the same locations.');
  }
  const locations = Object.fromEntries(ids.map(id => {
    const asset = manifest.locations[id];
    const label = navigation.nodes[id]?.label;
    if (!asset || !Array.isArray(asset.position) || asset.position.length !== 3 ||
        !asset.position.every(Number.isFinite) || typeof asset.file !== 'string' ||
        !/^[a-z][a-z0-9_]*\.(jpg|jpeg|png|webp)$/.test(asset.file) || typeof label !== 'string' || !label) {
      throw new Error(`Missing or invalid panorama data for ${id}.`);
    }
    return [id, {...asset, id, label, neighbors: []}];
  }));
  if (!Object.hasOwn(locations, navigation.start)) throw new Error('The starting location does not exist.');
  if (navigation.initialYaw !== undefined && !Number.isFinite(navigation.initialYaw)) {
    throw new Error('The starting heading must be a number.');
  }
  const edges = new Set();
  const passages = [
    ...navigation.connections.map(edge => ({edge, twoWay: true})),
    ...(navigation.oneWayConnections ?? []).map(edge => ({edge, twoWay: false})),
  ];
  for (const {edge, twoWay} of passages) {
    if (!Array.isArray(edge) || edge.length !== 2) throw new Error('Every connection needs two location IDs.');
    const [a, b] = edge;
    if (!Object.hasOwn(locations, a) || !Object.hasOwn(locations, b) || a === b) {
      throw new Error(`Invalid connection: ${a} / ${b}.`);
    }
    const key = [a, b].sort().join('/');
    if (edges.has(key)) throw new Error(`Duplicate connection: ${a} / ${b}.`);
    if (bearing(locations[a].position, locations[b].position).distance < 1e-6) {
      throw new Error(`Connected locations ${a} and ${b} have identical positions.`);
    }
    edges.add(key);
    locations[a].neighbors.push(b);
    if (twoWay) locations[b].neighbors.push(a);
  }
  const reachable = new Set([navigation.start]);
  for (const id of reachable) for (const neighbor of locations[id].neighbors) reachable.add(neighbor);
  if (reachable.size !== ids.length) throw new Error('Some camera locations cannot be reached from the start.');
  return {locations, connections: passages.map(passage => passage.edge), start: navigation.start,
    initialYaw: normalizeYaw(navigation.initialYaw ?? 0)};
}

export function movementOptions(world, id, yaw) {
  const source = world.locations[id];
  return source.neighbors.map(target => {
    const destination = world.locations[target];
    const direction = bearing(source.position, destination.position);
    const difference = angleDifference(direction.yaw ?? yaw, yaw);
    return {id: target, label: destination.label, ...direction, difference,
      direction: direction.yaw === null ? (direction.pitch > 0 ? 'Up' : 'Down') : relativeDirection(difference)};
  });
}

export function compassPoint(bearing, yaw, radius = 34) {
  const radians = angleDifference(bearing ?? yaw, yaw) * Math.PI / 180;
  return {x: 50 + Math.sin(radians) * radius, y: 50 - Math.cos(radians) * radius};
}

export function compassOptions(world, id, yaw) {
  // World-bearing order keeps number shortcuts stable when the player looks
  // around or arrives at this location from a different direction.
  return movementOptions(world, id, yaw)
    .sort((a, b) => (a.yaw ?? 0) - (b.yaw ?? 0) || a.id.localeCompare(b.id))
    .map((option, index) => ({...option, ...compassPoint(option.yaw, yaw), shortcut: index + 1}));
}

export function chooseStep(world, id, yaw, relativeHeading = 0) {
  return movementOptions(world, id, yaw + relativeHeading)
    .filter(option => Math.abs(option.difference) < 60)
    .sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference))[0]?.id ?? null;
}
