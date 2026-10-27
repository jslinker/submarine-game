// Each fragment chooses a direction in a flat equirectangular photograph.
// The browser loads no scene geometry.
const VERTEX = `
attribute vec2 position;
varying vec2 screen;
void main() { screen = position; gl_Position = vec4(position, 0.0, 1.0); }
`;
const FRAGMENT = `
precision highp float;
varying vec2 screen;
uniform sampler2D currentImage;
uniform sampler2D previousImage;
uniform float yaw;
uniform float pitch;
uniform float tanHalfFov;
uniform float aspect;
uniform float blend;
uniform float progress;
uniform vec3 travel;
const float PI = 3.141592653589793;
vec2 panoramaUV(vec3 ray) {
  return vec2(fract(0.5 + atan(ray.x, ray.y)/(2.0*PI)), 0.5 + asin(clamp(ray.z,-1.0,1.0))/PI);
}
void main() {
  vec3 forward = vec3(sin(yaw)*cos(pitch), cos(yaw)*cos(pitch), sin(pitch));
  vec3 right = vec3(cos(yaw), -sin(yaw), 0.0);
  vec3 up = vec3(-sin(yaw)*sin(pitch), -cos(yaw)*sin(pitch), cos(pitch));
  vec3 ray = normalize(forward + screen.x*tanHalfFov*right + screen.y*tanHalfFov/aspect*up);
  // Approximate translation between two photographed spheres. Both images
  // advance in the travel direction; the visible endpoint is always unwarped.
  vec3 leavingRay = normalize(ray + travel*progress);
  vec3 arrivingRay = normalize(ray - travel*(1.0-progress));
  vec4 color = mix(texture2D(previousImage, panoramaUV(leavingRay)),
                   texture2D(currentImage, panoramaUV(arrivingRay)), blend);
  // Sub-pixel, static dithering prevents quantization bands on smooth gray
  // walls. It never animates or creates screen-wide bright stripes.
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  gl_FragColor = vec4(clamp(color.rgb + noise/255.0, 0.0, 1.0), 1.0);
}
`;

export const MOVE_DURATION = 680;

export function reconcilePanoramaEdges(pixels, width, height, channels = 4) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      ![3,4].includes(channels) || pixels.length !== width*height*channels) {
    throw new RangeError('Expected tightly packed RGB or RGBA panorama pixels.');
  }
  const border = Math.min(24, Math.floor(width/8));
  if (border < 2) return pixels;
  for (let row = 0; row < height; row++) {
    const left = row*width*channels;
    const right = left+(width-1)*channels;
    // A large jump may be a genuine object edge. Correct only the small
    // exposure/denoising mismatch found at the wrap of the Blender renders.
    const edgeGap = [0,1,2].map(channel => pixels[right+channel]-pixels[left+channel]);
    if (Math.max(...edgeGap.map(Math.abs)) > 32) continue;
    for (let offset = 0; offset < border; offset++) {
      const t = offset/(border-1);
      const feather = 1-t*t*(3-2*t);
      const a = left+offset*channels;
      const b = right-offset*channels;
      const gap = [0,1,2].map(channel => pixels[b+channel]-pixels[a+channel]);
      if (Math.max(...gap.map(Math.abs)) > 32) continue;
      for (let channel = 0; channel < 3; channel++) {
        const correction = gap[channel]*.5*feather;
        pixels[a+channel] = Math.round(pixels[a+channel]+correction);
        pixels[b+channel] = Math.round(pixels[b+channel]-correction);
      }
    }
  }
  return pixels;
}

export function travelVector(from, to) {
  if (!from || !to) return [0, 0, 0];
  const delta = to.map((value, index) => value - from[index]);
  const distance = Math.hypot(...delta);
  if (distance < 1e-6) return [0, 0, 0];
  const strength = Math.max(.14, Math.min(.28, distance / 18));
  return delta.map(value => value / distance * strength);
}

export function transitionFrame(elapsed, duration) {
  if (duration <= 0) return {progress: 1, blend: 1, active: false};
  const time = Math.max(0, Math.min(1, elapsed / duration));
  // Quintic easing has zero velocity and acceleration at both ends.
  const progress = time*time*time*(time*(time*6-15)+10);
  const dissolve = Math.max(0, Math.min(1, (progress-.18)/.64));
  return {progress, blend: dissolve*dissolve*(3-2*dissolve), active: time < 1};
}

export class PanoramaViewer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl', {alpha: false, antialias: false, depth: false});
    if (!gl) throw new Error('This browser could not start WebGL. Enable hardware acceleration or try another browser.');
    const program = this.program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Panorama shader could not compile: ${message}`);
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('The panorama renderer could not start.');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    this.uniforms = Object.fromEntries(['currentImage', 'previousImage', 'yaw', 'pitch', 'tanHalfFov', 'aspect', 'blend', 'progress', 'travel']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    gl.uniform1i(this.uniforms.currentImage, 0);
    gl.uniform1i(this.uniforms.previousImage, 1);
    this.cache = new Map();
    this.prefetches = new Map();
    this.warmed = new Set();
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.duration = 0;
    this.travel = [0, 0, 0];
    this.resize();
  }

  resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.canvas.clientWidth * ratio);
    this.canvas.height = Math.round(this.canvas.clientHeight * ratio);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  async load(url) {
    if (this.cache.has(url)) {
      const texture = this.cache.get(url);
      this.cache.delete(url);
      this.cache.set(url, texture);
      return texture;
    }
    // Let an existing download finish rather than requesting the image twice.
    if (this.prefetches.has(url)) await this.prefetches.get(url);
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('The panorama image could not be loaded. Check your connection and try again.'); }
    if (image.naturalWidth !== image.naturalHeight * 2) throw new Error('This panorama image is not in the expected 2:1 format.');
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error('The graphics connection was interrupted. Reload to continue.');
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const source = document.createElement('canvas');
    source.width = Math.min(image.naturalWidth, maxSize);
    source.height = source.width/2;
    const context = source.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0, source.width, source.height);
    const pixels = context.getImageData(0, 0, source.width, source.height);
    reconcilePanoramaEdges(pixels.data, source.width, source.height);
    context.putImageData(pixels, 0, 0);
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const powerOfTwo = value => (value & (value - 1)) === 0;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,
      powerOfTwo(source.width) && powerOfTwo(source.height) ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.cache.set(url, texture);
    return texture;
  }

  preload(urls) {
    // Warm the HTTP cache, not GPU textures or decoded full-resolution images.
    for (const url of urls) {
      if (this.cache.has(url) || this.warmed.has(url) || this.prefetches.has(url)) continue;
      const download = fetch(url)
        .then(async response => {
          if (!response.ok) return;
          await response.arrayBuffer();
          this.warmed.add(url);
        })
        .catch(() => {}) // A failed prefetch must not block exploration.
        .finally(() => this.prefetches.delete(url));
      this.prefetches.set(url, download);
    }
  }

  show(texture, from, to) {
    const hadImage = Boolean(this.current);
    this.previous = this.current || texture;
    this.current = texture;
    this.travel = travelVector(from, to);
    this.duration = hadImage && !this.motionPreference.matches && Math.hypot(...this.travel) > 0 ? MOVE_DURATION : 0;
    this.started = performance.now();
    for (const [url, cached] of this.cache) {
      if (this.cache.size <= 3) break;
      if (cached !== this.current && cached !== this.previous) {
        this.gl.deleteTexture(cached);
        this.cache.delete(url);
      }
    }
    if (!this.duration) return Promise.resolve();
    return new Promise(resolve => { this.finishTransition = resolve; });
  }

  draw(view, now) {
    if (!this.current || this.gl.isContextLost()) return false;
    const gl = this.gl;
    const frame = transitionFrame(now - this.started, this.motionPreference.matches ? 0 : this.duration);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.current);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.previous);
    gl.uniform1f(this.uniforms.yaw, view.yaw * Math.PI / 180);
    gl.uniform1f(this.uniforms.pitch, view.pitch * Math.PI / 180);
    gl.uniform1f(this.uniforms.tanHalfFov, Math.tan(view.fov * Math.PI / 360));
    gl.uniform1f(this.uniforms.aspect, this.canvas.width / this.canvas.height);
    gl.uniform1f(this.uniforms.blend, frame.blend);
    gl.uniform1f(this.uniforms.progress, frame.progress);
    gl.uniform3f(this.uniforms.travel, ...this.travel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!frame.active && this.finishTransition) {
      this.finishTransition();
      this.finishTransition = null;
    }
    return frame.active;
  }
}
