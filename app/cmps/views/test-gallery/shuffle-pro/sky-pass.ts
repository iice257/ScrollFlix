// The Shuffle Pro sky: a fullscreen shader drawn behind the globe in the
// globe's own GL context, plus a particle pass drawn over it. Everything is
// created lazily on the first run and skipped entirely at intensity 0, so an
// idle globe pays nothing.

import type { Tier } from './shuffle-pro-logic'

export type SkyTheme = 'dark' | 'light'

export type SkyState = {
  tier: Tier
  theme: SkyTheme
  // Overall presence of the sky (reveal, hold at 60%, fade out).
  intensity: number
  // The path's signature washing in (frost creep, smoke, filigree...).
  color: number
  // Particle arrival, 0..1.
  particles: number
  // Spin speed in rad/s.
  omega: number
  // Screen-space direction the surface is moving (right, up).
  spinDir: [number, number]
  // Seconds, drives twinkle and drift; frozen under reduced motion.
  time: number
  // Accumulated drift along spinDir, in sky units; frozen under reduced motion.
  flow: number
  // Accumulated orbit phase for particles.
  orbit: number
  // Rim light level (breathing included), 0..1.
  rim: number
  // Seconds since the trigger ring started (< 0 = off) and where.
  ringAge: number
  ringPos: [number, number]
  // Seconds since the peak shockwave (< 0 = off).
  shockAge: number
  // Gold filigree draw progress, 0..1.
  filigree: number
  // Soft exposure lift on the globe at the peak (0.15 = +15%).
  exposure: number
  // Extra motion blur during a run, 0..1.
  blur: number
  // 1 when the sky fades in static (reduced motion).
  reduced: boolean
}

export type SkyQuality = {
  // Resolution of the sky buffer relative to the canvas.
  scale: number
  octaves: number
  particleScale: number
}

export const QUALITY_FULL: SkyQuality = {
  scale: 0.5,
  octaves: 4,
  particleScale: 1,
}
export const QUALITY_LITE: SkyQuality = {
  scale: 0.35,
  octaves: 2,
  particleScale: 0.5,
}

export const createSkyState = (): SkyState => ({
  tier: 'frost',
  theme: 'dark',
  intensity: 0,
  color: 0,
  particles: 0,
  omega: 0,
  spinDir: [1, 0],
  time: 0,
  flow: 0,
  orbit: 0,
  rim: 0,
  ringAge: -1,
  ringPos: [0.5, 0.5],
  shockAge: -1,
  filigree: 0,
  exposure: 0,
  blur: 0,
  reduced: false,
})

type Rgb = [number, number, number]

const hex = (value: string): Rgb => {
  const n = Number.parseInt(value.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

type Palette = {
  c0: Rgb
  c1: Rgb
  c2: Rgb
  deep: Rgb
  accent: Rgb
  skyTop: Rgb
  skyBottom: Rgb
}

// Palettes come straight from the spec. Light-mode sky colours are the pale
// sky each path blends into: icy silver, lavender dawn, teal mist, golden hour.
export const PALETTES: Record<Tier, Palette> = {
  frost: {
    c0: hex('#E8FBFF'),
    c1: hex('#BFE9FF'),
    c2: hex('#7CC8FF'),
    deep: hex('#06223A'),
    accent: hex('#FFFFFF'),
    skyTop: hex('#7DB9EE'),
    skyBottom: hex('#E6F4FF'),
  },
  amethyst: {
    c0: hex('#F1E4FF'),
    c1: hex('#C9A7FF'),
    c2: hex('#9B6BFF'),
    deep: hex('#1D0F33'),
    accent: hex('#FFC8F0'),
    skyTop: hex('#A58BEA'),
    skyBottom: hex('#FFD9EE'),
  },
  jade: {
    c0: hex('#B8FFF0'),
    c1: hex('#5FE3C5'),
    c2: hex('#1FA88C'),
    deep: hex('#0E3B35'),
    accent: hex('#E8FFF9'),
    skyTop: hex('#6FD2BE'),
    skyBottom: hex('#DDF8EE'),
  },
  gold: {
    c0: hex('#FFF3D1'),
    c1: hex('#F7D58B'),
    c2: hex('#E0A93B'),
    deep: hex('#2A1A05'),
    accent: hex('#F2C46D'),
    skyTop: hex('#F3B35B'),
    skyBottom: hex('#FFE7B0'),
  },
}

const TIER_INDEX: Record<Tier, number> = {
  frost: 0,
  amethyst: 1,
  jade: 2,
  gold: 3,
}

// Camera matrices and the globe's size, supplied by the engine each frame.
export type SkyView = {
  width: number
  height: number
  viewMatrix: Float32Array
  projectionMatrix: Float32Array
  // Screen radius of the globe in sky units (vertical extent is -1..1).
  globeRadius: number
  sphereRadius: number
  cameraZ: number
}

// ---------------------------------------------------------------- shaders

const FULLSCREEN_VERTEX = `#version 300 es
void main() {
  vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}
`

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, gl_FragCoord.xy / uRes);
  // The buffer is premultiplied; the canvas is straight alpha.
  outColor = vec4(t.a > 0.0005 ? t.rgb / t.a : vec3(0.0), t.a);
}
`

const SKY_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uOmega;
uniform vec2 uDir;
uniform float uFlow;
uniform float uSky;
uniform float uColor;
uniform float uRim;
uniform float uGlobeR;
uniform vec3 uRing;      // x,y position (sky units), z age in seconds (<0 off)
uniform float uShock;    // seconds since the peak shockwave (<0 off)
uniform float uFiligree;
uniform float uDark;
uniform float uReduced;
uniform int uTier;
uniform int uOctaves;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uDeep;
uniform vec3 uAccent;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 17.31));
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p, int oct) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    if (i >= oct) break;
    v += a * vnoise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v / 0.9375;
}

// ---- stars: three parallax layers, stretched into streaks along the spin.
float starCell(vec2 q, float scale, float seed, float px) {
  vec2 g = q * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash21(id + seed);
  if (h < 0.42) return 0.0;
  vec2 off = (hash22(id + seed * 1.7) - 0.5) * 0.56;
  float size = max(mix(0.05, 0.14, hash21(id * 1.3 + seed)), 1.15 * px * scale);
  float d = length(f - off);
  float tw = 0.7 + 0.3 * sin(uTime * (0.7 + hash21(id + 3.0) * 1.9) + h * 40.0);
  return smoothstep(size, 0.0, d) * tw * (0.35 + 0.9 * hash21(id + 9.0));
}
vec3 stars(vec2 p, float px) {
  vec2 a = uDir;
  vec2 b = vec2(-uDir.y, uDir.x);
  float sum = 0.0;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float par = 0.35 + 0.4 * fl;
    float scale = 13.0 + fl * 17.0;
    // Squashing the lookup along the spin stretches stars into streaks.
    float k = 1.0 + uOmega * (2.4 + 3.6 * par);
    vec2 pp = p + uDir * uFlow * par;
    vec2 q = vec2(dot(pp, a) / k, dot(pp, b));
    float s = starCell(q, scale, 3.7 + fl * 11.3, px);
    sum += s * (0.55 + 0.5 * fl) * (1.0 + 0.25 * min(k, 6.0));
  }
  return mix(vec3(1.0), uC0, 0.35) * sum;
}

// ---- dark: a galaxy.
vec3 galaxy(vec2 p, float r, float px) {
  float outside = smoothstep(uGlobeR * 0.92, uGlobeR * 1.65, r);
  float clearDisk = mix(0.14, 1.0, outside);
  vec3 col = uDeep * (0.5 + 0.5 * smoothstep(1.9, 0.0, r));

  vec2 q = p * 1.15 + uDir * uFlow * 0.12;
  float w = fbm(q * 1.7 + vec2(0.0, uTime * 0.015), uOctaves);
  float n = fbm(q + 2.2 * vec2(w, fbm(q + 3.1, uOctaves)), uOctaves);
  n = smoothstep(0.28, 0.86, n);
  vec3 neb = mix(uC2, uC1, n);
  col += mix(uDeep, neb, 0.85) * n * 0.82 * clearDisk * (0.45 + 0.55 * uColor);

  float lane = 1.0 - abs(2.0 * fbm(p * 2.4 + 7.0 + uDir * uFlow * 0.05, 3) - 1.0);
  col *= 1.0 - 0.42 * pow(lane, 3.0) * outside;

  col += stars(p, px) * (0.35 + 0.65 * outside);
  return col;
}

// ---- light: heavenly clouds and god rays.
vec3 heavenly(vec2 p, float r) {
  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(-0.7, 1.0, p.y));
  // Deeper at the edges, a bright halo around the globe: a lit sky, not a flat one.
  sky = mix(sky, uSkyTop, smoothstep(0.45, 1.7, r) * 0.7);
  sky = mix(sky, vec3(1.0, 0.98, 0.92), exp(-max(r - uGlobeR, 0.0) / 0.35) * 0.4);
  float ang = atan(p.y, p.x);
  float rayN = vnoise(vec2(ang * 5.0 + uTime * 0.18, uTime * 0.07));
  float rays = pow(smoothstep(0.38, 1.0, rayN), 2.0);
  float falloff = smoothstep(uGlobeR * 0.8, uGlobeR * 1.15, r) * exp(-r * 0.75);
  vec3 warm = mix(vec3(1.0, 0.97, 0.88), uC0, 0.35);
  sky += warm * rays * falloff * 0.95 * (0.4 + 0.6 * uColor);
  sky += warm * 0.55 * exp(-max(r - uGlobeR, 0.0) / 0.5) * 0.35;

  vec3 col = sky;
  for (int l = 0; l < 3; l++) {
    float fl = float(l);
    float par = 0.45 + 0.4 * fl;
    vec2 q = (p * vec2(1.0, 1.7) * (0.9 + fl * 0.75)) + uDir * uFlow * par * vec2(1.0, 0.6);
    q.y += fl * 4.1;
    float c = fbm(q + vec2(uTime * 0.012 * (1.0 + fl), 0.0), uOctaves);
    c = smoothstep(0.52, 0.8, c);
    c = pow(c, 1.2);
    float lit = 0.0;
    if (l == 0) {
      float c2 = fbm(q + vec2(0.0, -0.1), uOctaves);
      lit = clamp((smoothstep(0.52, 0.8, c) - smoothstep(0.52, 0.8, c2)) * 5.0 + 0.5, 0.0, 1.0);
    } else {
      lit = 0.7 + 0.3 * fl * 0.5;
    }
    vec3 cloud = mix(mix(uSkyTop, vec3(0.74, 0.84, 1.0), 0.35), vec3(1.0, 0.99, 0.96), lit * lit);
    col = mix(col, cloud, c * (0.85 - fl * 0.12) * (0.5 + 0.5 * smoothstep(0.0, 0.6, r)));
  }
  return col;
}

// ---- frost: crystalline creep from the screen edges.
vec3 frostCreep(vec2 p, float px, out float cover) {
  vec2 halfExtent = vec2(uRes.x / uRes.y, 1.0);
  vec2 e = halfExtent - abs(p);
  float dEdge = min(e.x, e.y) / (2.0 * min(halfExtent.x, halfExtent.y));
  float reach = 0.22 * uColor;
  vec2 g = p * 6.5;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 pt = hash22(id + o);
      float d = length(o + pt - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  float edge = 1.0 - smoothstep(0.0, 0.1, d2 - d1);
  float jag = fbm(p * 5.0 + 3.0, 3);
  float front = reach * (0.7 + 0.6 * jag);
  cover = smoothstep(front, front * 0.25, dEdge);
  float cell = hash21(id + floor(f + 0.5));
  float glint = pow(max(0.0, sin(uTime * 2.2 + cell * 40.0)), 14.0) * edge;
  // On the pale light sky the frost has to be bluer than the sky to read.
  vec3 tint = uDark > 0.5 ? mix(uC1, uC0, 0.5 + 0.5 * edge) : mix(uC2, vec3(1.0), 0.2 + 0.75 * edge);
  return tint * (0.45 + 0.9 * edge) + uC0 * glint * 1.6;
}

// ---- jade: ink-in-water smoke hugging the silhouette.
vec3 jadeSmoke(vec2 p, float r, out float amount) {
  float band = smoothstep(uGlobeR * 0.9, uGlobeR * 1.06, r) *
    (1.0 - smoothstep(uGlobeR * 1.35, uGlobeR * 2.2, r));
  vec2 q = p * 2.1 - uDir * uFlow * 0.9;
  vec2 warp = vec2(fbm(q + vec2(0.0, uTime * 0.06), uOctaves), fbm(q + 5.2, uOctaves));
  q += 1.6 * warp;
  float s = smoothstep(0.34, 0.82, fbm(q * 1.15, uOctaves));
  amount = s * band * (0.35 + 0.75 * uColor);
  return mix(uDeep, mix(uC2, uC0, s * s), s);
}

// ---- gold: art-deco filigree drawn along its own arc length.
float filigreeAlpha(vec2 p, float r, float px) {
  float a = atan(p.y, p.x) / TAU + 0.5;
  float acc = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float R = uGlobeR * (1.13 + fi * 0.2) + fi * 0.015;
    float prog = clamp(uFiligree * 1.7 - fi * 0.3, 0.0, 1.0);
    float head = smoothstep(prog, prog - 0.015, a);
    float w = px * (1.3 + 0.6 * mod(fi, 2.0));
    float line = smoothstep(w + px, w, abs(r - R));
    float ticks = 0.0;
    if (i == 1 || i == 3) {
      float tk = abs(fract(a * (i == 1 ? 72.0 : 108.0)) - 0.5);
      float inRange = smoothstep(px * 9.0, px * 8.0, abs(r - R - px * 8.0));
      ticks = smoothstep(0.08, 0.04, tk) * inRange;
    }
    acc += (line * 0.9 + ticks * 0.8) * head * (1.0 - fi * 0.12);
  }
  float rayN = abs(fract(a * 28.0) - 0.5);
  float rays = smoothstep(0.12, 0.02, rayN) *
    smoothstep(uGlobeR * 1.1, uGlobeR * 1.4, r) * exp(-(r - uGlobeR) * 1.6);
  acc += rays * 0.5 * smoothstep(0.1, 0.9, uFiligree);

  vec2 halfExtent = vec2(uRes.x / uRes.y, 1.0);
  vec2 c = abs(p) - (halfExtent - 0.22);
  float cr = length(c);
  float corner = smoothstep(px * 1.8, px * 0.6, abs(cr - 0.16)) * step(0.0, c.x + 0.16) * step(0.0, c.y + 0.16);
  corner += smoothstep(px * 4.0, px * 1.5, length(c)) * 0.9;
  acc += corner * smoothstep(0.3, 0.9, uFiligree) * 0.9;
  return clamp(acc, 0.0, 1.0);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float px = 2.0 / uRes.y;
  float r = length(p);

  vec3 col = uDark > 0.5 ? galaxy(p, r, px) : heavenly(p, r);

  // The path's signature.
  if (uTier == 0 && uColor > 0.001) {
    float cover;
    vec3 f = frostCreep(p, px, cover);
    col = mix(col, f, cover * (uDark > 0.5 ? 0.7 : 0.85) * uColor);
  } else if (uTier == 2 && uColor > 0.001) {
    float amt;
    vec3 s = jadeSmoke(p, r, amt);
    col = mix(col, s, clamp(amt, 0.0, 1.0) * (uDark > 0.5 ? 0.85 : 0.6));
  } else if (uTier == 3 && uFiligree > 0.001) {
    float fa = filigreeAlpha(p, r, px);
    vec3 gold = mix(uAccent, uC0, 0.25);
    col = mix(col, gold, fa * 0.95);
    col += uC1 * fa * 0.25;
    // A warm sunburst behind the globe.
    col += mix(uC1, uC0, 0.4) * exp(-max(r - uGlobeR, 0.0) / 0.28) * 0.45 * uColor * (uDark > 0.5 ? 1.0 : 0.6);
  }

  // Rim light just outside the globe's silhouette.
  float d = r - uGlobeR;
  float core = exp(-pow(max(d, 0.0) / 0.05, 1.6)) * smoothstep(-0.12, 0.0, d);
  float halo = exp(-max(d, 0.0) / 0.32) * 0.3;
  vec3 rimCol = mix(uC1, uC0, core);
  col += rimCol * (core * 1.15 + halo) * uRim * (uDark > 0.5 ? 1.0 : 0.4);

  // Trigger ring and peak shockwave.
  if (uRing.z >= 0.0 && uRing.z < 0.6) {
    float t = uRing.z / 0.6;
    float rr = length(p - uRing.xy);
    float ring = exp(-pow((rr - t * 0.85) / 0.035, 2.0)) * (1.0 - t) * (1.0 - t);
    col += uC0 * ring * 1.4;
  }
  if (uShock >= 0.0 && uShock < 0.7) {
    float t = uShock / 0.7;
    float rr = r - uGlobeR;
    float ring = exp(-pow((rr - t * 2.1) / (0.05 + 0.1 * t), 2.0)) * (1.0 - t);
    float wake = exp(-max(rr, 0.0) / 0.5) * (1.0 - t) * 0.25;
    col += mix(uC1, uC0, 0.6) * (ring * 1.2 + wake);
  }

  float a = clamp(uSky, 0.0, 1.0);
  outColor = vec4(col * a, a);
}
`

const PARTICLE_VERTEX = `#version 300 es
precision highp float;
precision highp int;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform float uTime;
uniform float uOrbit;
uniform float uSphereR;
uniform float uParticles;
uniform float uSizeScale;
uniform float uAspect;
uniform float uReduced;
uniform int uMode;       // 0 orbiting particles, 1 foreground petals
uniform int uTier;
uniform float uCameraZ;
uniform float uCount;    // how many instances are live at this quality

in vec4 aSeed;
out vec2 vUv;
out vec4 vSeed;
out float vVisible;
out float vDepthFade;

mat2 rot(float a) { float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vUv = corner;
  vSeed = aSeed;
  float live = float(gl_InstanceID) < uCount ? 1.0 : 0.0;
  float stagger = fract(aSeed.x * 7.13);
  float visible = smoothstep(stagger * 0.7, stagger * 0.7 + 0.3, uParticles) * live;
  vVisible = visible;

  if (uMode == 0) {
    float rho = uSphereR * (1.16 + 0.95 * aSeed.x);
    // A tilted orbit plane per particle.
    float tilt = (aSeed.y - 0.5) * 3.0;
    float yaw = aSeed.z * 6.2831853;
    vec3 n = normalize(vec3(sin(tilt) * cos(yaw), cos(tilt), sin(tilt) * sin(yaw)));
    vec3 e1 = normalize(cross(n, vec3(0.0, 0.0, 1.0) + vec3(0.0, 0.31, 0.0)));
    vec3 e2 = cross(n, e1);
    float speed = (0.35 + 0.65 * aSeed.w) * (aSeed.z > 0.5 ? 1.0 : -1.0);
    float th = aSeed.w * 6.2831853 + uOrbit * speed;
    vec3 pos = rho * (cos(th) * e1 + sin(th) * e2);
    pos *= 1.0 + 0.04 * sin(uTime * 0.6 + aSeed.y * 30.0) * (1.0 - uReduced);
    vec4 vp = uViewMatrix * vec4(pos, 1.0);
    float size = (0.013 + 0.024 * fract(aSeed.y * 13.7)) * uSizeScale * visible;
    float spin = (uTime * (0.8 + aSeed.x * 2.4) + aSeed.z * 20.0) * (1.0 - uReduced);
    vp.xy += rot(spin) * corner * size;
    gl_Position = uProjectionMatrix * vp;
    vDepthFade = 1.0;
  } else {
    // Soft petals drifting down through the foreground.
    float fall = fract(aSeed.y - uTime * (0.018 + 0.02 * aSeed.z) * (1.0 - uReduced));
    float sway = sin(uTime * (0.5 + aSeed.w) + aSeed.x * 20.0) * 0.08 * (1.0 - uReduced);
    float viewZ = -uCameraZ * 0.55;
    float halfH = abs(viewZ) * 0.78;
    vec2 pos = vec2((aSeed.x * 2.0 - 1.0) * halfH * uAspect + sway * halfH, (0.5 - fall) * 2.3 * halfH);
    float size = (0.1 + 0.1 * aSeed.w) * uSizeScale * visible;
    float spin = (uTime * (0.4 + aSeed.z) + aSeed.x * 9.0) * (1.0 - uReduced);
    vec2 off = rot(spin) * (corner * vec2(0.7, 1.0)) * size;
    vec4 vp = vec4(pos + off, viewZ, 1.0);
    gl_Position = uProjectionMatrix * vp;
    vDepthFade = 1.0;
  }
}
`

const PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform int uTier;
uniform int uMode;
uniform float uTime;
uniform float uDark;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uAccent;
in vec2 vUv;
in vec4 vSeed;
in float vVisible;
in float vDepthFade;
out vec4 outColor;

void main() {
  if (vVisible < 0.01) discard;
  vec2 uv = vUv;
  float d = length(uv);
  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (uMode == 1) {
    // Petal: a soft leaf shape in lavender to pink.
    vec2 q = vec2(uv.x * 1.25, uv.y);
    float shape = 1.0 - smoothstep(0.55, 1.0, length(q * vec2(1.0, 0.72)) + 0.18 * q.y * q.y);
    float vein = smoothstep(0.1, 0.0, abs(uv.x)) * 0.25;
    col = mix(uC1, uAccent, 0.45 + 0.4 * sin(vSeed.x * 30.0)) + vein;
    alpha = shape * 0.55;
  } else if (uTier == 0) {
    // Ice shard: a faceted diamond that glints as it tumbles.
    float body = abs(uv.x) * 0.95 + abs(uv.y) * 0.6;
    float edge = 1.0 - smoothstep(0.82, 1.0, body);
    float facet = step(0.0, uv.x) + 2.0 * step(0.0, uv.y);
    float tumble = uTime * (1.1 + vSeed.x * 2.0) + vSeed.z * 20.0;
    float shade = 0.55 + 0.45 * sin(tumble + facet * 1.7);
    float glint = pow(max(0.0, sin(tumble * 1.7 + facet * 2.3 + vSeed.w * 9.0)), 10.0);
    float ridge = smoothstep(0.1, 0.0, abs(abs(uv.x) * 0.95 - abs(uv.y) * 0.6)) * 0.35;
    col = mix(uC2, uC0, shade) + uC0 * (glint * 1.5 + ridge);
    alpha = edge * (0.55 + 0.4 * shade + glint);
  } else if (uTier == 1) {
    // Four-point glitter: crossing streaks that twinkle and flash.
    float tw = 0.5 + 0.5 * sin(uTime * (2.0 + vSeed.x * 6.0) + vSeed.z * 40.0);
    float flash = pow(max(0.0, sin(uTime * (1.0 + vSeed.w * 3.0) + vSeed.y * 50.0)), 12.0);
    float cross = 1.0 / (1.0 + 26.0 * abs(uv.x * uv.y)) * (1.0 - smoothstep(0.35, 1.0, d));
    float core = exp(-d * d * 9.0);
    vec3 tint = mix(uC1, uAccent, step(0.6, fract(vSeed.y * 5.7)));
    col = mix(tint, uC0, 0.4 + 0.5 * flash);
    alpha = (cross * (0.35 + 0.65 * tw) + core * 0.5) * (0.6 + 1.1 * flash);
  } else if (uTier == 2) {
    // Jade: small glowing embers lifting off the smoke.
    float core = exp(-d * d * 5.5);
    float tw = 0.65 + 0.35 * sin(uTime * (1.5 + vSeed.x * 3.0) + vSeed.z * 30.0);
    col = mix(uC1, uC0, core);
    alpha = core * tw * 0.9;
  } else {
    // Gold dust: round motes with an occasional cross glint.
    float core = exp(-d * d * 7.0);
    float glint = pow(max(0.0, sin(uTime * (1.0 + vSeed.x * 2.5) + vSeed.z * 40.0)), 16.0);
    float cross = 1.0 / (1.0 + 30.0 * abs(uv.x * uv.y)) * (1.0 - smoothstep(0.4, 1.0, d));
    col = mix(uC2, uC0, core * 0.7 + glint * 0.5);
    alpha = core * 0.85 + cross * glint * 1.2;
  }

  float lightFade = uDark > 0.5 ? 1.0 : 0.82;
  outColor = vec4(col, clamp(alpha * vVisible * lightFade, 0.0, 1.0));
}
`

// ---------------------------------------------------------------- program

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  console.error(gl.getShaderInfoLog(shader))
  gl.deleteShader(shader)
  return null
}

const link = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  bindings: Record<string, number> = {},
) => {
  const program = gl.createProgram()
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!program || !vs || !fs) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  for (const [name, location] of Object.entries(bindings)) {
    gl.bindAttribLocation(program, location, name)
  }
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  console.error(gl.getProgramInfoLog(program))
  gl.deleteProgram(program)
  return null
}

type Uniforms = Record<string, WebGLUniformLocation | null>

const uniformsOf = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: string[],
): Uniforms =>
  Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]))

// Sprite size per path: shards and glitter need to read at a glance.
const PARTICLE_SIZE: Record<Tier, number> = {
  frost: 1.5,
  amethyst: 1.8,
  jade: 1.2,
  gold: 1.4,
}

const PARTICLE_COUNT = 640
const PETAL_COUNT = 8

export class SkyPass {
  // Counts frames in which the sky was drawn; stays frozen while idle.
  drawCount = 0

  private readonly gl: WebGL2RenderingContext
  private skyProgram: WebGLProgram | null = null
  private skyUniforms: Uniforms = {}
  private compositeProgram: WebGLProgram | null = null
  private compositeUniforms: Uniforms = {}
  private particleProgram: WebGLProgram | null = null
  private particleUniforms: Uniforms = {}
  private emptyVao: WebGLVertexArrayObject | null = null
  private particleVao: WebGLVertexArrayObject | null = null
  private particleBuffer: WebGLBuffer | null = null
  private framebuffer: WebGLFramebuffer | null = null
  private texture: WebGLTexture | null = null
  private bufferWidth = 0
  private bufferHeight = 0
  private failed = false

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
  }

  private ensurePrograms() {
    if (this.failed || this.skyProgram) return !this.failed
    const gl = this.gl
    const sky = link(gl, FULLSCREEN_VERTEX, SKY_FRAGMENT)
    const composite = link(gl, FULLSCREEN_VERTEX, COMPOSITE_FRAGMENT)
    const particles = link(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT, {
      aSeed: 0,
    })
    if (!sky || !composite || !particles) {
      this.failed = true
      return false
    }
    this.skyProgram = sky
    this.compositeProgram = composite
    this.particleProgram = particles
    this.skyUniforms = uniformsOf(gl, sky, [
      'uRes',
      'uTime',
      'uOmega',
      'uDir',
      'uFlow',
      'uSky',
      'uColor',
      'uRim',
      'uGlobeR',
      'uRing',
      'uShock',
      'uFiligree',
      'uDark',
      'uReduced',
      'uTier',
      'uOctaves',
      'uC0',
      'uC1',
      'uC2',
      'uDeep',
      'uAccent',
      'uSkyTop',
      'uSkyBottom',
    ])
    this.compositeUniforms = uniformsOf(gl, composite, ['uTex', 'uRes'])
    this.particleUniforms = uniformsOf(gl, particles, [
      'uViewMatrix',
      'uProjectionMatrix',
      'uTime',
      'uOrbit',
      'uSphereR',
      'uParticles',
      'uSizeScale',
      'uAspect',
      'uReduced',
      'uMode',
      'uTier',
      'uCameraZ',
      'uCount',
      'uDark',
      'uC0',
      'uC1',
      'uC2',
      'uAccent',
    ])
    this.emptyVao = gl.createVertexArray()

    // Per-particle random seeds, fixed so a run looks the same each time.
    const seeds = new Float32Array((PARTICLE_COUNT + PETAL_COUNT) * 4)
    let state = 1337
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 4294967296
    }
    for (let i = 0; i < seeds.length; i += 1) seeds[i] = rand()
    this.particleBuffer = gl.createBuffer()
    this.particleVao = gl.createVertexArray()
    gl.bindVertexArray(this.particleVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(0, 1)
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    return true
  }

  private ensureBuffer(width: number, height: number) {
    const gl = this.gl
    if (
      this.framebuffer &&
      this.bufferWidth === width &&
      this.bufferHeight === height
    ) {
      return
    }
    if (!this.texture) this.texture = gl.createTexture()
    if (!this.framebuffer) this.framebuffer = gl.createFramebuffer()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.texture,
      0,
    )
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.bufferWidth = width
    this.bufferHeight = height
  }

  // Draws the sky behind the globe: into the half-resolution buffer, then
  // upsampled onto the canvas. Call after the canvas clear, before the globe.
  drawSky(
    state: SkyState,
    quality: SkyQuality,
    view: SkyView,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    if (!this.ensurePrograms()) return
    const gl = this.gl
    const width = Math.max(2, Math.round(canvasWidth * quality.scale))
    const height = Math.max(2, Math.round(canvasHeight * quality.scale))
    this.ensureBuffer(width, height)

    const palette = PALETTES[state.tier]
    const u = this.skyUniforms

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(this.emptyVao)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.skyProgram)
    gl.uniform2f(u.uRes, width, height)
    gl.uniform1f(u.uTime, state.time)
    gl.uniform1f(u.uOmega, state.omega)
    gl.uniform2f(u.uDir, state.spinDir[0], state.spinDir[1])
    gl.uniform1f(u.uFlow, state.flow)
    gl.uniform1f(u.uSky, state.intensity)
    gl.uniform1f(u.uColor, state.color)
    gl.uniform1f(u.uRim, state.rim)
    gl.uniform1f(u.uGlobeR, view.globeRadius)
    const aspect = view.width / Math.max(1, view.height)
    gl.uniform3f(
      u.uRing,
      (state.ringPos[0] * 2 - 1) * aspect,
      state.ringPos[1] * 2 - 1,
      state.ringAge,
    )
    gl.uniform1f(u.uShock, state.shockAge)
    gl.uniform1f(u.uFiligree, state.filigree)
    gl.uniform1f(u.uDark, state.theme === 'dark' ? 1 : 0)
    gl.uniform1f(u.uReduced, state.reduced ? 1 : 0)
    gl.uniform1i(u.uTier, TIER_INDEX[state.tier])
    gl.uniform1i(u.uOctaves, quality.octaves)
    gl.uniform3fv(u.uC0, palette.c0)
    gl.uniform3fv(u.uC1, palette.c1)
    gl.uniform3fv(u.uC2, palette.c2)
    gl.uniform3fv(u.uDeep, palette.deep)
    gl.uniform3fv(u.uAccent, palette.accent)
    gl.uniform3fv(u.uSkyTop, palette.skyTop)
    gl.uniform3fv(u.uSkyBottom, palette.skyBottom)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.useProgram(this.compositeProgram)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(this.compositeUniforms.uTex, 0)
    gl.uniform2f(this.compositeUniforms.uRes, canvasWidth, canvasHeight)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindVertexArray(null)
    this.drawCount += 1
  }

  // Draws orbiting particles over the globe (depth tested against it) and,
  // for Amethyst, a few foreground petals. Call after the globe.
  drawParticles(state: SkyState, quality: SkyQuality, view: SkyView) {
    if (state.particles <= 0.001 || !this.particleProgram) return
    const gl = this.gl
    const palette = PALETTES[state.tier]
    const u = this.particleUniforms
    const reduced = state.reduced
    // Reduced motion keeps only a handful of static glints.
    const count = reduced
      ? Math.round(PARTICLE_COUNT * 0.08)
      : Math.round(PARTICLE_COUNT * quality.particleScale)

    gl.useProgram(this.particleProgram)
    gl.bindVertexArray(this.particleVao)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.CULL_FACE)
    gl.depthMask(false)

    gl.uniformMatrix4fv(u.uViewMatrix, false, view.viewMatrix)
    gl.uniformMatrix4fv(u.uProjectionMatrix, false, view.projectionMatrix)
    gl.uniform1f(u.uTime, state.time)
    gl.uniform1f(u.uOrbit, state.orbit)
    gl.uniform1f(u.uSphereR, view.sphereRadius * 0.86)
    gl.uniform1f(u.uParticles, state.particles)
    gl.uniform1f(u.uAspect, view.width / Math.max(1, view.height))
    gl.uniform1f(u.uReduced, reduced ? 1 : 0)
    gl.uniform1i(u.uTier, TIER_INDEX[state.tier])
    gl.uniform1f(u.uCameraZ, view.cameraZ)
    gl.uniform1f(u.uDark, state.theme === 'dark' ? 1 : 0)
    gl.uniform3fv(u.uC0, palette.c0)
    gl.uniform3fv(u.uC1, palette.c1)
    gl.uniform3fv(u.uC2, palette.c2)
    gl.uniform3fv(u.uAccent, palette.accent)

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.uniform1i(u.uMode, 0)
    gl.uniform1f(u.uCount, count)
    gl.uniform1f(u.uSizeScale, PARTICLE_SIZE[state.tier])
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, PARTICLE_COUNT)

    if (state.tier === 'amethyst') {
      gl.disable(gl.DEPTH_TEST)
      gl.uniform1i(u.uMode, 1)
      gl.uniform1f(u.uSizeScale, 1)
      // Petals read the seeds stored after the orbiting particles.
      gl.uniform1f(u.uCount, PETAL_COUNT)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer)
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, PARTICLE_COUNT * 16)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, PETAL_COUNT)
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)
    }

    gl.depthMask(true)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  dispose() {
    const gl = this.gl
    if (gl.isContextLost()) return
    if (this.skyProgram) gl.deleteProgram(this.skyProgram)
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram)
    if (this.particleProgram) gl.deleteProgram(this.particleProgram)
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao)
    if (this.particleVao) gl.deleteVertexArray(this.particleVao)
    if (this.particleBuffer) gl.deleteBuffer(this.particleBuffer)
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer)
    if (this.texture) gl.deleteTexture(this.texture)
    this.skyProgram = null
    this.compositeProgram = null
    this.particleProgram = null
    this.framebuffer = null
    this.texture = null
  }
}
