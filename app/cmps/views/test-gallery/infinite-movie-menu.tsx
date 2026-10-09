import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../../utils/tw'
import {
  type HoneycombVec3 as Vec3,
  createHoneycombSpherePositions,
  hasHoneycombLayout,
  prewarmHoneycombLayout,
} from './honeycomb-layout'
import { unlockAudio } from './shuffle-pro/shuffle-pro-audio'
import type {
  PressSession,
  ShuffleProController,
  ShuffleProPort,
} from './shuffle-pro/shuffle-pro-controller'
import {
  PALETTES,
  QUALITY_FULL,
  QUALITY_LITE,
  SkyPass,
  type SkyQuality,
  type SkyState,
  type SkyView,
} from './shuffle-pro/sky-pass'

export type InfiniteMovieMenuItem<T> = {
  id: string
  image: string
  fallbackImage?: string
  // Shown until the poster loads when it has no cell in the poster sprite.
  placeholderColor?: string
  title: string
  description: string
  meta: string
  payload: T
}

type InfiniteMovieMenuProps<T> = {
  activeId: string | null
  isDetailsOpen: boolean
  items: InfiniteMovieMenuItem<T>[]
  loadState: 'loading' | 'ready' | 'error'
  scale?: number
  onActiveItemChange: (item: InfiniteMovieMenuItem<T>) => void
  onLoadProgress?: (percent: number) => void
  isActive?: boolean
  onMovingChange?: (moving: boolean) => void
  // `source` tells a user's tap apart from a shuffle landing on the poster.
  onOpenItem?: (
    item: InfiniteMovieMenuItem<T>,
    source: 'tap' | 'shuffle',
  ) => void
  // Spin to this item, then open it (Shuffle). The nonce re-triggers repeats.
  spinRequest?: { itemId: string; nonce: number } | null
  onReady?: () => void
  onUserSpin?: () => void
  // Camera zoom (>1 pulls the globe closer); applied in 3D, never via CSS.
  zoom?: number
  // The movie to face before the first frame (consumed once, on first build).
  initialFaceId?: string | null
  // Shuffle Pro: the controller that owns holds, runs and the sky.
  shufflePro?: ShuffleProController | null
  // True while a Shuffle spin is heading for a poster (drives Skip).
  onSpinActiveChange?: (active: boolean) => void
  // Total rotation of a drag gesture, reported once the globe rests.
  onGestureSettled?: (totalRad: number) => void
  // A pointer went down on the globe (the first one raises the full-screen hint).
  onGlobePress?: () => void
  // Imperative handle for the page (Skip).
  controlRef?: { current: InfiniteMovieMenuControl | null }
}

export type PosterRect = {
  left: number
  top: number
  width: number
  height: number
}

export type InfiniteMovieMenuControl = {
  // Finishes a Shuffle spin now, settling on its poster within 300ms.
  skipSpin: () => void
  // Where a film's poster is on screen right now, or null if it isn't shown.
  getPosterRect: (itemId: string) => PosterRect | null
  // Called with the speed (rad/s) and direction (-1 or 1) of a very fast flick.
  setOnFlick: (
    listener: ((speed: number, direction: number) => void) | null,
  ) => void
}

type Vec2 = [number, number]
type Quat = [number, number, number, number]
type Mat4 = Float32Array

const SPHERE_RADIUS = 2.58
const TARGET_FRAME_DURATION = 1000 / 60
const ICON_TEXTURE_CELL_SIZE = 128
const ICON_TEXTURE_PADDING = 12
// Globe density: up to ICON_INSTANCE_COUNT posters. Smaller sets shrink the
// sphere (radius scales with sqrt(count / ICON_INSTANCE_COUNT), clamped to
// MIN_RADIUS_RATIO) so poster spacing stays as tight as the full globe. The
// camera only follows part of the way (sqrt of the radius ratio), so small
// sets read as a smaller, denser globe rather than a magnified sparse one.
// Below MIN_INSTANCE_COUNT, items repeat to fill the smallest sphere.
const ICON_INSTANCE_COUNT = 900
const REFERENCE_INSTANCE_COUNT = ICON_INSTANCE_COUNT
const MIN_RADIUS_RATIO = 0.62
const MIN_INSTANCE_COUNT = Math.round(
  REFERENCE_INSTANCE_COUNT * MIN_RADIUS_RATIO ** 2,
)
const ICON_REST_SCALE = 0.18
const ICON_DETAIL_SCALE = 0.34
const DETAIL_FAST_EASE_MS = 210
const DETAIL_SLOW_EASE_MS = 900
const DETAIL_CLOSE_EASE_MS = 460
// Gesture tuning: a press released within HOLD_TO_DRAG_MS that moved less
// than CLICK_MOVE_TOLERANCE_PX is a click (opens the poster); holding longer or
// moving further turns into a drag. Clicks resolve inside a large central
// ellipse (HIT_REGION_*, as ratios of the canvas). Tune live with
// ?gesture-debug in the URL.
// Directional motion blur: angular speed (rad/s) where it starts and reaches
// full strength, and the longest smear as a fraction of a poster's height.
const MOTION_BLUR_THRESHOLD = 2.2
// Fast enough, from a drag, to kick up weather (see weather-logic.ts).
const FLICK_WEATHER_SPEED = 5.4
const FLICK_WEATHER_COOLDOWN_MS = 350
const MOTION_BLUR_CAP = 6.5
const MOTION_BLUR_MAX_SMEAR = 0.012
// Rotation velocity (turns per frame) below which a drag gesture has rested.
const GESTURE_REST_VELOCITY = 0.0002
// Shuffle Pro: how much the blur grows during a run, and how strongly the
// path's colour grades the posters at full wash.
const MOTION_BLUR_PRO_BOOST = 2
const KICK_FREQ = 10.5
const KICK_ZETA = 0.5
const GRADE_STRENGTH = 0.22
// Adaptive sky quality: measure the first frames of a run and step down if the
// average frame time is over budget.
const QUALITY_PROBE_FRAMES = 45
const QUALITY_STEP_DOWN_MS = 20
const HOLD_TO_DRAG_MS = 220
const CLICK_MOVE_TOLERANCE_PX = 8
// Shuffle: snap strength while spinning to a poster, and how close (cosine of
// the angle to the centre) counts as arrived before the card opens.
const SPIN_SNAP_STRENGTH = 0.085
const SPIN_ARRIVAL_DOT = 0.9994
// Hit region ellipse, as ratios of the canvas rect: centre y, radii x and y.
const HIT_REGION_CENTER_Y = 0.48
const HIT_REGION_RX = 0.34
const HIT_REGION_RY = 0.37
const GESTURE_DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('gesture-debug')

type GestureTuning = {
  regionCenterY: number
  regionRx: number
  regionRy: number
  holdMs: number
  moveTolerancePx: number
}

type GestureLogEntry = {
  id: number
  kind: 'click' | 'miss' | 'hold' | 'drag' | 'catch'
  ms: number
  movedPx: number
  title?: string
}

type PressState = {
  session: PressSession | null
  pointerType: string
  dragging: boolean
  holdTimer: number | null
  kind: 'hold' | 'drag' | 'catch' | null
  lastX: number
  lastY: number
  maxMovedPx: number
  pointerId: number
  snapshot: PickSnapshot | null
  startTime: number
  x: number
  y: number
}
// Release inertia. The time constant starts at the original per-frame decay
// (0.1 per 60fps frame) and stretches with fresh release speed: at most 1.5x
// for a pointer flick, 1.2x for wheel and arrow nudges.
export const BASE_RELEASE_TAU_MS = -TARGET_FRAME_DURATION / Math.log(0.9)
const RELEASE_REFERENCE_SPEED_PX_MS = 1.4
const RELEASE_STALE_MS = 80
const RELEASE_BOOST: Record<'pointer' | 'nudge', number> = {
  pointer: 0.5,
  nudge: 0.2,
}

export const releaseTimeConstant = ({
  speedPxMs,
  source,
  msSinceLastMove,
}: {
  speedPxMs: number
  source: 'pointer' | 'nudge'
  msSinceLastMove: number
}) => {
  const fresh = msSinceLastMove > RELEASE_STALE_MS ? 0 : speedPxMs
  const t = Math.max(0, Math.min(1, fresh / RELEASE_REFERENCE_SPEED_PX_MS))
  return BASE_RELEASE_TAU_MS * (1 + RELEASE_BOOST[source] * t)
}

// After a touch opens a poster, browsers still fire a compatibility click on
// whatever now sits under the finger (the details backdrop), which would close
// the card straight away. Swallow that one click; returns a disposer.
const guardTouchOpenClick = (pointerId: number) => {
  let expiryTimer = 0
  const cleanup = () => {
    window.clearTimeout(expiryTimer)
    window.removeEventListener('click', onClick, true)
  }
  function onClick(event: MouseEvent) {
    if (
      event.detail !== 0 &&
      (event as PointerEvent).pointerId === pointerId &&
      event.target instanceof Element &&
      event.target.closest('.warp-details-backdrop')
    ) {
      cleanup()
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  expiryTimer = window.setTimeout(cleanup, 800)
  window.addEventListener('click', onClick, true)
  return cleanup
}

const NUDGE_RELEASE_MS = 140
const WHEEL_NUDGE_SCALE = 0.6
const WHEEL_NUDGE_MAX_PX = 90
// Arrow keys: a press gives an initial nudge, then holding spins at a steady
// rate every frame until release (OS key-repeat timing is ignored).
const KEY_NUDGE_PX = 20
const KEY_HOLD_PX_PER_MS = 0.32
const ARROW_DIRECTIONS: Record<string, Vec2> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [1, 0],
  ArrowRight: [-1, 0],
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
const FALLBACK_ITEM_COUNT = 128
const INITIAL_TEXTURE_LOAD_CONCURRENCY = 24
// The globe is revealed once every poster has settled (loaded, or failed after
// its quick retries and fallen back to the placeholder), or after the safety
// net so a stalled request can never hold the page hostage.
const POSTER_SETTLE_RETRY_DELAYS_MS = [800, 2400]
const GLOBE_READY_SAFETY_NET_MS = 25000
// Longest stretch of texture uploads before handing the thread back.
const UPLOAD_SLICE_MS = 8

// A timer rather than scheduler.yield, so the browser can paint and handle
// input between slices instead of running every continuation first.
const yieldToMain = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 0))
// How many posters the globe lays out, and how large it is, for a film count.
const getGlobeShape = (itemCount: number) => {
  const instanceCount = Math.min(
    ICON_INSTANCE_COUNT,
    Math.max(MIN_INSTANCE_COUNT, itemCount),
  )
  const radiusRatio = Math.min(
    1,
    Math.max(
      MIN_RADIUS_RATIO,
      Math.sqrt(instanceCount / REFERENCE_INSTANCE_COUNT),
    ),
  )
  return {
    instanceCount,
    radiusRatio,
    sphereRadius: SPHERE_RADIUS * radiusRatio,
  }
}

const PRIMARY_IMAGE_TIMEOUT_MS = 20000

type DetailMotion = 'fast' | 'slow' | 'close'

// One tiny sprite of every poster: drawn pixelated into each atlas cell so the
// globe is populated almost instantly while full thumbnails stream in.
const POSTER_SPRITE_URL = '/media/poster-sprite.jpg'
const POSTER_SPRITE_MANIFEST_URL = '/media/poster-sprite.json'
const POSTER_RETRY_DELAYS_MS = [4000, 12000, 30000]
const PLACEHOLDER_CELLS_PER_FRAME = 48

type PosterSprite = {
  cellHeight: number
  cellWidth: number
  columns: number
  image: HTMLImageElement
  indexById: Map<string, number>
}

let posterSpritePromise: Promise<PosterSprite | null> | null = null
const posterImageCache = new Map<string, Promise<HTMLImageElement>>()
const POSTER_IMAGE_CACHE_LIMIT = 1800

const loadPosterSprite = () => {
  posterSpritePromise ??= (async () => {
    try {
      const response = await fetch(POSTER_SPRITE_MANIFEST_URL)
      if (!response.ok) throw new Error(`Sprite manifest ${response.status}`)
      const manifest = (await response.json()) as {
        cellHeight: number
        cellWidth: number
        columns: number
        ids: string[]
      }
      const image = new Image()
      image.decoding = 'async'
      image.src = POSTER_SPRITE_URL
      await image.decode()
      return {
        cellHeight: manifest.cellHeight,
        cellWidth: manifest.cellWidth,
        columns: manifest.columns,
        image,
        indexById: new Map(manifest.ids.map((id, index) => [id, index])),
      }
    } catch {
      posterSpritePromise = null
      return null
    }
  })()
  return posterSpritePromise
}

const posterIdFromUrl = (url: string) =>
  url.match(/\/posters\/([^/?#]+)\.jpg/)?.[1] ?? null

export type PosterHit<T> = {
  index: number
  item: InfiniteMovieMenuItem<T>
  // Screen-space outline of the hit area, for the gesture debug overlay.
  quad: Vec2[]
}

export type PickEllipse = { cx: number; cy: number; rx: number; ry: number }

// A poster's screen-space footprint: centre, half-axes u/v and the unpadded
// quad (corners at (-1,-1), (1,-1), (1,1), (-1,1) in u/v), plus world depth z.
export type PickCandidate = {
  center: Vec2
  index: number
  quad: Vec2[]
  u: Vec2
  v: Vec2
  z: number
}

export type PickSnapshot = {
  candidates: PickCandidate[]
  ellipse: PickEllipse
}

// Distances within this many px count as a tie when choosing the nearest poster.
const PICK_DISTANCE_TIE_PX = 0.5

export const createPickCandidate = (
  index: number,
  z: number,
  center: Vec2,
  u: Vec2,
  v: Vec2,
): PickCandidate => {
  const corner = (sa: number, sb: number): Vec2 => [
    center[0] + u[0] * sa + v[0] * sb,
    center[1] + u[1] * sa + v[1] * sb,
  ]
  return {
    center,
    index,
    quad: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
    u,
    v,
    z,
  }
}

const distanceToSegment = (point: Vec2, start: Vec2, end: Vec2) => {
  const ex = end[0] - start[0]
  const ey = end[1] - start[1]
  const lengthSq = ex * ex + ey * ey
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - start[0]) * ex + (point[1] - start[1]) * ey) /
              lengthSq,
          ),
        )
  return Math.hypot(
    point[0] - (start[0] + ex * t),
    point[1] - (start[1] + ey * t),
  )
}

// Distance from a point to a convex quad (any winding); 0 when inside or on it.
export const pointToQuadDistance = (point: Vec2, quad: Vec2[]) => {
  let hasPositive = false
  let hasNegative = false
  let edgeDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < quad.length; i += 1) {
    const start = quad[i]
    const end = quad[(i + 1) % quad.length]
    const cross =
      (end[0] - start[0]) * (point[1] - start[1]) -
      (end[1] - start[1]) * (point[0] - start[0])
    if (cross > 0) hasPositive = true
    if (cross < 0) hasNegative = true
    edgeDistance = Math.min(edgeDistance, distanceToSegment(point, start, end))
  }
  return hasPositive && hasNegative ? edgeDistance : 0
}

// True when the quad overlaps or touches the ellipse. In ellipse space the
// ellipse is the unit circle and the quad stays a parallelogram.
export const ellipseIntersectsQuad = (quad: Vec2[], ellipse: PickEllipse) => {
  const scaled = quad.map(
    ([x, y]): Vec2 => [
      (x - ellipse.cx) / ellipse.rx,
      (y - ellipse.cy) / ellipse.ry,
    ],
  )
  return pointToQuadDistance([0, 0], scaled) <= 1
}

const isInsideEllipse = (point: Vec2, ellipse: PickEllipse) =>
  ((point[0] - ellipse.cx) / ellipse.rx) ** 2 +
    ((point[1] - ellipse.cy) / ellipse.ry) ** 2 <=
  1

const isInsideCandidate = (candidate: PickCandidate, point: Vec2) => {
  const { center, u, v } = candidate
  const det = u[0] * v[1] - u[1] * v[0]
  if (det === 0) return false
  const dx = point[0] - center[0]
  const dy = point[1] - center[1]
  const a = (dx * v[1] - dy * v[0]) / det
  const b = (u[0] * dy - u[1] * dx) / det
  return Math.abs(a) <= 1 && Math.abs(b) <= 1
}

const frontMost = (left: PickCandidate, right: PickCandidate) =>
  right.z > left.z || (right.z === left.z && right.index < left.index)
    ? right
    : left

// Deterministic winner for a point: (a) front-most poster containing it, else
// (b) inside the ellipse, the nearest poster (ties: front-most), else (c) null.
// Candidates are expected to already be eligible (touching the ellipse).
export const pickWinner = (
  candidates: PickCandidate[],
  point: Vec2,
  ellipse: PickEllipse,
): PickCandidate | null => {
  let winner: PickCandidate | null = null
  for (const candidate of candidates) {
    if (!isInsideCandidate(candidate, point)) continue
    winner = winner ? frontMost(winner, candidate) : candidate
  }
  if (winner) return winner
  if (!isInsideEllipse(point, ellipse)) return null

  let nearest = Number.POSITIVE_INFINITY
  const distances = candidates.map((candidate) => {
    const distance = pointToQuadDistance(point, candidate.quad)
    nearest = Math.min(nearest, distance)
    return distance
  })
  candidates.forEach((candidate, i) => {
    if (distances[i] > nearest + PICK_DISTANCE_TIE_PX) return
    winner = winner ? frontMost(winner, candidate) : candidate
  })
  return winner
}

const vertexShaderSource = `#version 300 es
uniform mat4 uWorldMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec4 uRotationAxisVelocity;
uniform float uMotionBlur;
uniform float uMotionBlurMax;

in vec3 aModelPosition;
in vec2 aModelUvs;
in mat4 aInstanceMatrix;

out vec2 vUvs;
out vec2 vSmear;
out float vAlpha;
flat out int vInstanceId;

void main() {
  vec4 worldPosition = uWorldMatrix * aInstanceMatrix * vec4(aModelPosition, 1.0);

  vec3 centerPos = (uWorldMatrix * aInstanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float radius = length(centerPos.xyz);

  vec3 rotationAxis = uRotationAxisVelocity.xyz;

  // Directional motion blur: the poster centre's velocity (axis x position),
  // projected onto the poster plane and turned into a UV-space smear.
  vSmear = vec2(0.0);
  if (uMotionBlur > 0.0) {
    mat4 posterMatrix = uWorldMatrix * aInstanceMatrix;
    vec3 ex = posterMatrix[0].xyz;
    vec3 ey = posterMatrix[1].xyz;
    vec3 motion = cross(rotationAxis, centerPos);
    vec2 inPlane = vec2(dot(motion, ex), dot(motion, ey));
    float planeLength = length(inPlane);
    if (planeLength > 0.00001) {
      float speedFrac = clamp(length(motion) / max(radius, 0.0001), 0.0, 1.0);
      vec2 dir = inPlane / planeLength;
      vSmear = uMotionBlur * uMotionBlurMax * speedFrac * vec2(dir.x * ${(0.5 / 0.34).toFixed(4)}, -dir.y);
    }
  }

  float rotationVelocity = min(0.095, uRotationAxisVelocity.w * 9.0);
  vec3 stretchDir = normalize(cross(centerPos, rotationAxis));
  vec3 relativeVertexPos = normalize(worldPosition.xyz - centerPos);
  float strength = dot(stretchDir, relativeVertexPos);
  float invAbsStrength = min(0.0, abs(strength) - 1.0);
  strength = rotationVelocity * sign(strength) * abs(invAbsStrength * invAbsStrength * invAbsStrength + 1.0);
  worldPosition.xyz += stretchDir * strength;

  worldPosition.xyz = radius * normalize(worldPosition.xyz);
  gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;

  float face = normalize(worldPosition.xyz).z;
  vAlpha = smoothstep(-0.2, 0.95, face) * 0.84 + 0.16;
  vUvs = aModelUvs;
  vInstanceId = gl_InstanceID;
}
`

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform int uItemCount;
uniform int uAtlasSize;
uniform float uAtlasPadding;
uniform float uExposure;
uniform vec4 uTint;

out vec4 outColor;

in vec2 vUvs;
in vec2 vSmear;
in float vAlpha;
flat in int vInstanceId;

float roundedRectMask(vec2 uv) {
  vec2 q = abs(uv - vec2(0.5)) - vec2(0.34, 0.39);
  float dist = length(max(q, 0.0)) - 0.11;
  return 1.0 - smoothstep(0.0, 0.024, dist);
}

void main() {
  int itemIndex = vInstanceId % max(1, uItemCount);
  int cellX = itemIndex % uAtlasSize;
  int cellY = itemIndex / uAtlasSize;
  vec2 cellSize = vec2(1.0) / vec2(float(uAtlasSize));
  vec2 cellOffset = vec2(float(cellX), float(cellY)) * cellSize;
  vec2 cellPadding = cellSize * uAtlasPadding;

  vec2 tileSpan = cellSize - cellPadding * 2.0;
  vec2 tileOrigin = cellOffset + cellPadding;

  vec4 color;
  if (dot(vSmear, vSmear) > 0.0) {
    // Six taps along the smear, clamped to this poster's own tile so
    // neighbouring posters never bleed in.
    color = vec4(0.0);
    for (int i = 0; i < 6; i++) {
      float t = (float(i) + 0.5) / 6.0 - 0.5;
      vec2 tapUv = clamp(vUvs + vSmear * t, 0.0, 1.0);
      color += texture(uTex, tapUv * tileSpan + tileOrigin);
    }
    color /= 6.0;
  } else {
    color = texture(uTex, vUvs * tileSpan + tileOrigin);
  }
  float mask = roundedRectMask(vUvs);
  outColor = color;
  outColor.rgb *= mix(0.58, 1.12, vAlpha);
  // Shuffle Pro grade: a soft exposure lift and the path's colour washing in.
  outColor.rgb *= 1.0 + uExposure;
  outColor.rgb = mix(outColor.rgb, outColor.rgb * uTint.rgb * 1.18, uTint.a);
  outColor.a *= mask * vAlpha;
  if (outColor.a < 0.02) discard;
}
`

const identityMat4 = (): Mat4 => {
  const out = new Float32Array(16)
  out[0] = 1
  out[5] = 1
  out[10] = 1
  out[15] = 1
  return out
}

const copyMat4 = (out: Mat4, matrix: Mat4) => {
  out.set(matrix)
  return out
}

const multiplyMat4 = (out: Mat4, a: Mat4, b: Mat4) => {
  const a00 = a[0]
  const a01 = a[1]
  const a02 = a[2]
  const a03 = a[3]
  const a10 = a[4]
  const a11 = a[5]
  const a12 = a[6]
  const a13 = a[7]
  const a20 = a[8]
  const a21 = a[9]
  const a22 = a[10]
  const a23 = a[11]
  const a30 = a[12]
  const a31 = a[13]
  const a32 = a[14]
  const a33 = a[15]

  let b0 = b[0]
  let b1 = b[1]
  let b2 = b[2]
  let b3 = b[3]
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[4]
  b1 = b[5]
  b2 = b[6]
  b3 = b[7]
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[8]
  b1 = b[9]
  b2 = b[10]
  b3 = b[11]
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[12]
  b1 = b[13]
  b2 = b[14]
  b3 = b[15]
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33
  return out
}

const translationMat4 = ([x, y, z]: Vec3) => {
  const out = identityMat4()
  out[12] = x
  out[13] = y
  out[14] = z
  return out
}

const scalingMat4 = ([x, y, z]: Vec3) => {
  const out = identityMat4()
  out[0] = x
  out[5] = y
  out[10] = z
  return out
}

const perspectiveMat4 = (
  out: Mat4,
  fov: number,
  aspect: number,
  near: number,
  far: number,
) => {
  const f = 1 / Math.tan(fov / 2)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[11] = -1
  if (far !== Number.POSITIVE_INFINITY) {
    const nf = 1 / (near - far)
    out[10] = (far + near) * nf
    out[14] = 2 * far * near * nf
  } else {
    out[10] = -1
    out[14] = -2 * near
  }
  return out
}

const invertMat4 = (out: Mat4, a: Mat4) => {
  const a00 = a[0]
  const a01 = a[1]
  const a02 = a[2]
  const a03 = a[3]
  const a10 = a[4]
  const a11 = a[5]
  const a12 = a[6]
  const a13 = a[7]
  const a20 = a[8]
  const a21 = a[9]
  const a22 = a[10]
  const a23 = a[11]
  const a30 = a[12]
  const a31 = a[13]
  const a32 = a[14]
  const a33 = a[15]

  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32

  let det =
    b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!det) return null
  det = 1 / det

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det
  return out
}

const targetToMat4 = (out: Mat4, eye: Vec3, target: Vec3, up: Vec3) => {
  const z = normalize3(subtract3(eye, target))
  let x = normalize3(cross3(up, z))
  if (length3(x) < 0.0001) x = [1, 0, 0]
  const y = cross3(z, x)

  out[0] = x[0]
  out[1] = x[1]
  out[2] = x[2]
  out[3] = 0
  out[4] = y[0]
  out[5] = y[1]
  out[6] = y[2]
  out[7] = 0
  out[8] = z[0]
  out[9] = z[1]
  out[10] = z[2]
  out[11] = 0
  out[12] = eye[0]
  out[13] = eye[1]
  out[14] = eye[2]
  out[15] = 1
  return out
}

const length3 = ([x, y, z]: Vec3) => Math.hypot(x, y, z)
const normalize3 = ([x, y, z]: Vec3): Vec3 => {
  const len = Math.hypot(x, y, z)
  return len > 0.000001 ? [x / len, y / len, z / len] : [0, 0, 0]
}
const subtract3 = (a: Vec3, b: Vec3): Vec3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
]
const negate3 = ([x, y, z]: Vec3): Vec3 => [-x, -y, -z]
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const distanceSquared3 = (a: Vec3, b: Vec3) => {
  const x = a[0] - b[0]
  const y = a[1] - b[1]
  const z = a[2] - b[2]
  return x * x + y * y + z * z
}
const identityQuat = (): Quat => [0, 0, 0, 1]
const normalizeQuat = ([x, y, z, w]: Quat): Quat => {
  const len = Math.hypot(x, y, z, w)
  return len > 0.000001 ? [x / len, y / len, z / len, w / len] : identityQuat()
}
const multiplyQuat = (a: Quat, b: Quat): Quat => [
  a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
  a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
  a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const conjugateQuat = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w]
const axisAngleQuat = (axis: Vec3, angle: number): Quat => {
  const half = angle * 0.5
  const s = Math.sin(half)
  return normalizeQuat([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)])
}
const slerpQuat = (a: Quat, b: Quat, t: number): Quat => {
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw

  if (cos < 0) {
    cos = -cos
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }

  if (cos > 0.9995) {
    return normalizeQuat([
      a[0] + t * (bx - a[0]),
      a[1] + t * (by - a[1]),
      a[2] + t * (bz - a[2]),
      a[3] + t * (bw - a[3]),
    ])
  }

  const theta = Math.acos(Math.min(Math.max(cos, -1), 1))
  const sinTheta = Math.sin(theta)
  const scaleA = Math.sin((1 - t) * theta) / sinTheta
  const scaleB = Math.sin(t * theta) / sinTheta
  return [
    a[0] * scaleA + bx * scaleB,
    a[1] * scaleA + by * scaleB,
    a[2] * scaleA + bz * scaleB,
    a[3] * scaleA + bw * scaleB,
  ]
}

const transformQuat3 = ([x, y, z]: Vec3, q: Quat): Vec3 => {
  const qx = q[0]
  const qy = q[1]
  const qz = q[2]
  const qw = q[3]
  const uvx = qy * z - qz * y
  const uvy = qz * x - qx * z
  const uvz = qx * y - qy * x
  const uuvx = qy * uvz - qz * uvy
  const uuvy = qz * uvx - qx * uvz
  const uuvz = qx * uvy - qy * uvx
  return [
    x + 2 * (uvx * qw + uuvx),
    y + 2 * (uvy * qw + uuvy),
    z + 2 * (uvz * qw + uuvz),
  ]
}

const POSTER_HALF_WIDTH = 0.34
const POSTER_HALF_HEIGHT = 0.5

const createDiscGeometry = () => {
  const halfWidth = POSTER_HALF_WIDTH
  const halfHeight = POSTER_HALF_HEIGHT
  const vertices = [
    -halfWidth,
    -halfHeight,
    0,
    halfWidth,
    -halfHeight,
    0,
    halfWidth,
    halfHeight,
    0,
    -halfWidth,
    halfHeight,
    0,
  ]
  const uvs = [0, 1, 1, 1, 1, 0, 0, 0]
  const indices = [0, 1, 2, 0, 2, 3]

  return {
    vertices: new Float32Array(vertices),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  }
}

const createShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  console.error(gl.getShaderInfoLog(shader))
  gl.deleteShader(shader)
  return null
}

const createProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) => {
  const program = gl.createProgram()
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!program || !vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
    if (program) gl.deleteProgram(program)
    return null
  }
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.bindAttribLocation(program, 0, 'aModelPosition')
  gl.bindAttribLocation(program, 1, 'aModelUvs')
  gl.bindAttribLocation(program, 2, 'aInstanceMatrix')
  gl.linkProgram(program)
  const linked = Boolean(gl.getProgramParameter(program, gl.LINK_STATUS))
  if (!linked) console.error(gl.getProgramInfoLog(program))
  gl.detachShader(program, vertexShader)
  gl.detachShader(program, fragmentShader)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (linked) return program
  gl.deleteProgram(program)
  return null
}

// The canvas keeps its context when the engine is rebuilt for a new set of
// films, so the compiled program is kept with it: recompiling blocks the
// thread for tens of milliseconds, every time the filters change.
const programCache = new WeakMap<WebGL2RenderingContext, WebGLProgram>()

const getProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) => {
  const cached = programCache.get(gl)
  if (cached) return cached
  const program = createProgram(gl, vertexSource, fragmentSource)
  if (program) {
    programCache.set(gl, program)
    // A lost context takes its programs with it. (isProgram would check, but
    // it is a round trip to the GPU process and stalls behind texture uploads.)
    gl.canvas.addEventListener(
      'webglcontextlost',
      () => programCache.delete(gl),
      { once: true },
    )
  }
  return program
}

const createBuffer = (
  gl: WebGL2RenderingContext,
  dataOrSize: BufferSource | number,
  usage: number,
) => {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  if (typeof dataOrSize === 'number') {
    gl.bufferData(gl.ARRAY_BUFFER, dataOrSize, usage)
  } else {
    gl.bufferData(gl.ARRAY_BUFFER, dataOrSize, usage)
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  return buffer
}

const resizeCanvasToDisplaySize = (canvas: HTMLCanvasElement) => {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const displayWidth = Math.max(1, Math.round(canvas.clientWidth * dpr))
  const displayHeight = Math.max(1, Math.round(canvas.clientHeight * dpr))
  const needsResize =
    canvas.width !== displayWidth || canvas.height !== displayHeight
  if (needsResize) {
    canvas.width = displayWidth
    canvas.height = displayHeight
  }
  return needsResize
}

class ArcballControl {
  isPointerDown = false
  orientation: Quat = identityQuat()
  pointerRotation: Quat = identityQuat()
  rotationVelocity = 0
  rotationAxis: Vec3 = [1, 0, 0]
  snapDirection: Vec3 = [0, 0, -1]
  snapTargetDirection: Vec3 | null = null
  // Overrides the distance-based snap strength (used by spin-to-poster).
  snapStrength: number | null = null

  private pointerPos: Vec2 = [0, 0]
  private previousPointerPos: Vec2 = [0, 0]
  private lastMoveAt = 0
  private moveSpeedPxMs = 0
  // Time constant of the post-release decay; Shuffle Pro's landing sets its own.
  releaseTauMs = BASE_RELEASE_TAU_MS
  // Shuffle Pro: spin about a screen-space axis at a fixed angular speed.
  autoSpin: { axis: Vec3; omega: number } | null = null
  // Reports the total rotation of a drag gesture once the globe comes to rest.
  onGestureSettled: ((totalRad: number) => void) | null = null
  private trackedRotation: number | null = null
  private settle: {
    from: Quat
    to: Quat
    elapsed: number
    duration: number
    onDone: () => void
  } | null = null
  private combinedQuat: Quat = identityQuat()
  private smoothedRotationVelocity = 0
  private readonly cleanupHandlers: Array<() => void> = []

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly updateCallback: (deltaTime: number) => void,
  ) {
    canvas.style.touchAction = 'none'
  }

  dispose() {
    this.cleanupHandlers.forEach((cleanup) => cleanup())
  }

  beginDrag(clientX: number, clientY: number, pointerId?: number) {
    this.pointerPos = [clientX, clientY]
    this.previousPointerPos = [...this.pointerPos]
    this.lastMoveAt = performance.now()
    this.moveSpeedPxMs = 0
    this.isPointerDown = true
    if (pointerId !== undefined) {
      try {
        this.canvas.setPointerCapture?.(pointerId)
      } catch {
        // Pointer capture can fail if the pointer was released while hold armed.
      }
    }
  }

  moveDrag(clientX: number, clientY: number) {
    if (!this.isPointerDown) return
    const now = performance.now()
    const elapsed = now - this.lastMoveAt
    if (elapsed > 0) {
      const distance = Math.hypot(
        clientX - this.pointerPos[0],
        clientY - this.pointerPos[1],
      )
      const speed = Math.min(1.6, distance / Math.max(8, elapsed))
      this.moveSpeedPxMs = this.moveSpeedPxMs * 0.35 + speed * 0.65
    }
    this.pointerPos = [clientX, clientY]
    this.lastMoveAt = now
  }

  endDrag(pointerId?: number, source: 'pointer' | 'nudge' = 'pointer') {
    if (this.isPointerDown) {
      this.releaseTauMs = releaseTimeConstant({
        speedPxMs: this.moveSpeedPxMs,
        source,
        // A nudge's release is virtual (a debounce), not a stale pointer.
        msSinceLastMove:
          source === 'nudge' ? 0 : performance.now() - this.lastMoveAt,
      })
    }
    this.isPointerDown = false
    if (pointerId !== undefined) {
      try {
        this.canvas.releasePointerCapture?.(pointerId)
      } catch {
        // Browsers throw when capture was already released or never acquired.
      }
    }
  }

  cancelDrag(pointerId?: number) {
    this.pointerRotation = slerpQuat(this.pointerRotation, identityQuat(), 0.35)
    this.endDrag(pointerId)
  }

  // Moves both drag points together, keeping the pending (not yet applied)
  // movement intact; used to re-centre the virtual wheel/keyboard pointer.
  shiftDrag(dx: number, dy: number) {
    this.pointerPos = [this.pointerPos[0] + dx, this.pointerPos[1] + dy]
    this.previousPointerPos = [
      this.previousPointerPos[0] + dx,
      this.previousPointerPos[1] + dy,
    ]
  }

  // Starts adding up rotation for a drag gesture (reported at rest).
  beginTracking() {
    this.trackedRotation ??= 0
  }

  // Eases the orientation to bring a model-space direction to the viewer
  // within `duration` ms (ease-out), then calls onDone. Used by Skip.
  beginSettle(direction: Vec3, duration: number, onDone: () => void) {
    const current = transformQuat3(direction, this.orientation)
    const target = this.snapDirection
    const d = dot3(normalize3(current), target)
    const turn =
      d < -0.9999
        ? axisAngleQuat([0, 1, 0], Math.PI)
        : this.quatFromVectors(normalize3(current), target)
    this.autoSpin = null
    this.pointerRotation = identityQuat()
    this.settle = {
      from: [...this.orientation],
      to: normalizeQuat(multiplyQuat(turn, this.orientation)),
      elapsed: 0,
      duration: Math.max(1, duration),
      onDone,
    }
  }

  cancelSettle() {
    this.settle = null
  }

  get isSettling() {
    return this.settle !== null
  }

  update(deltaTime: number) {
    const timeScale = deltaTime / TARGET_FRAME_DURATION + 0.00001
    let angleFactor = timeScale
    let snapRotation = identityQuat()

    if (this.settle) {
      const settle = this.settle
      settle.elapsed += deltaTime
      const t = Math.min(1, settle.elapsed / settle.duration)
      const eased = 1 - (1 - t) ** 3
      const previous = this.orientation
      this.orientation = slerpQuat(settle.from, settle.to, eased)
      // Express the step as a rotation so velocity and blur stay meaningful.
      const step = normalizeQuat(
        multiplyQuat(this.orientation, conjugateQuat(previous)),
      )
      this.pointerRotation = identityQuat()
      this.combinedQuat = step
      const rad = Math.acos(Math.min(Math.max(step[3], -1), 1)) * 2
      const sin = Math.sin(rad / 2)
      if (sin > 0.000001) {
        this.rotationAxis = [step[0] / sin, step[1] / sin, step[2] / sin]
      }
      this.smoothedRotationVelocity = rad / (2 * Math.PI)
      this.rotationVelocity = this.smoothedRotationVelocity / timeScale
      if (t >= 1) {
        this.settle = null
        settle.onDone()
      }
      this.updateCallback(deltaTime)
      return
    }

    if (this.isPointerDown) {
      const intensity = 0.3 * timeScale
      const amplification = 5 / timeScale
      const delta: Vec2 = [
        (this.pointerPos[0] - this.previousPointerPos[0]) * intensity,
        (this.pointerPos[1] - this.previousPointerPos[1]) * intensity,
      ]

      if (delta[0] * delta[0] + delta[1] * delta[1] > 0.1) {
        const midpoint: Vec2 = [
          this.previousPointerPos[0] + delta[0],
          this.previousPointerPos[1] + delta[1],
        ]
        const a = normalize3(this.project(midpoint))
        const b = normalize3(this.project(this.previousPointerPos))
        this.previousPointerPos = midpoint
        angleFactor *= amplification
        this.pointerRotation = this.quatFromVectors(a, b, angleFactor)
      } else {
        this.pointerRotation = slerpQuat(
          this.pointerRotation,
          identityQuat(),
          intensity,
        )
      }
    } else if (this.autoSpin) {
      // Constant angular speed about a fixed axis; no snapping while it runs.
      this.pointerRotation = axisAngleQuat(
        this.autoSpin.axis,
        (this.autoSpin.omega * deltaTime) / 1000,
      )
    } else {
      const intensity = 1 - Math.exp(-deltaTime / this.releaseTauMs)
      this.pointerRotation = slerpQuat(
        this.pointerRotation,
        identityQuat(),
        intensity,
      )

      if (this.snapTargetDirection) {
        const sqrDist = distanceSquared3(
          this.snapTargetDirection,
          this.snapDirection,
        )
        const distanceFactor = Math.max(0.1, 1 - sqrDist * 10)
        angleFactor *= this.snapStrength ?? 0.2 * distanceFactor
        snapRotation = this.quatFromVectors(
          this.snapTargetDirection,
          this.snapDirection,
          angleFactor,
        )
      }
    }

    const combined = multiplyQuat(snapRotation, this.pointerRotation)
    this.orientation = normalizeQuat(multiplyQuat(combined, this.orientation))
    this.combinedQuat = normalizeQuat(
      slerpQuat(this.combinedQuat, combined, 0.8 * timeScale),
    )

    const rad = Math.acos(Math.min(Math.max(this.combinedQuat[3], -1), 1)) * 2
    const s = Math.sin(rad / 2)
    let rotationVelocity = 0
    if (s > 0.000001) {
      rotationVelocity = rad / (2 * Math.PI)
      this.rotationAxis = [
        this.combinedQuat[0] / s,
        this.combinedQuat[1] / s,
        this.combinedQuat[2] / s,
      ]
    }

    this.smoothedRotationVelocity +=
      (rotationVelocity - this.smoothedRotationVelocity) * 0.5 * timeScale
    this.rotationVelocity = this.smoothedRotationVelocity / timeScale

    if (this.trackedRotation !== null) {
      this.trackedRotation += rad
      if (
        !this.isPointerDown &&
        !this.autoSpin &&
        Math.abs(this.rotationVelocity) < GESTURE_REST_VELOCITY
      ) {
        const total = this.trackedRotation
        this.trackedRotation = null
        this.onGestureSettled?.(total)
      }
    }
    this.updateCallback(deltaTime)
  }

  // Orients the globe so `direction` (a model-space point) faces the viewer.
  faceDirection(direction: Vec3) {
    const target = this.snapDirection
    const d = dot3(direction, target)
    this.orientation =
      d < -0.9999
        ? axisAngleQuat([0, 1, 0], Math.PI)
        : this.quatFromVectors(direction, target)
    this.pointerRotation = identityQuat()
    this.combinedQuat = identityQuat()
    this.smoothedRotationVelocity = 0
    this.rotationVelocity = 0
  }

  private quatFromVectors(a: Vec3, b: Vec3, angleFactor = 1) {
    const axis = normalize3(cross3(a, b))
    if (length3(axis) < 0.000001) return identityQuat()
    const d = Math.max(-1, Math.min(1, dot3(a, b)))
    return axisAngleQuat(axis, Math.acos(d) * angleFactor)
  }

  private project(pos: Vec2): Vec3 {
    const radius = 2
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    const side = Math.max(width, height) - 1
    const x = (2 * pos[0] - width - 1) / side
    const y = (2 * pos[1] - height - 1) / side
    const xySq = x * x + y * y
    const rSq = radius * radius
    const z = xySq <= rSq / 2 ? Math.sqrt(rSq - xySq) : rSq / Math.sqrt(xySq)
    return [-x, y, z]
  }
}

class InfiniteMovieEngine<T> {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject | null = null
  private texture: WebGLTexture | null = null
  private control: ArcballControl
  private frameId = 0
  private time = 0
  private frames = 0
  private disposed = false
  private paused = false
  // Idle frames are skipped: when nothing has moved or been uploaded since the
  // last draw, the previous frame is still correct.
  private renderDirty = true
  private lastRenderedOrientation: Quat = [0, 0, 0, 0]
  private lastRenderedCameraZ = Number.NaN
  private contextLost = false
  private movementActive = false
  private smoothRotationVelocity = 0
  private nearestVertexIndex = 0
  private detailProgress = 0
  private detailTargetProgress = 0
  private detailVertexIndex: number | null = null
  private detailEaseMs = DETAIL_SLOW_EASE_MS
  private readonly iconBuffers = createDiscGeometry()
  private readonly worldMatrix = identityMat4()
  private readonly viewMatrix = identityMat4()
  private readonly cameraMatrix = identityMat4()
  private readonly projectionMatrix = identityMat4()
  private readonly cameraPosition: Vec3
  private readonly cameraUp: Vec3 = [0, 1, 0]
  private readonly instancePositions: Vec3[]
  private readonly instanceMatricesArray: Float32Array
  private readonly instanceMatrices: Float32Array[]
  private readonly instanceBuffer: WebGLBuffer | null
  private readonly geometryBuffers: WebGLBuffer[] = []
  private readonly locations: Record<string, WebGLUniformLocation | null>
  private atlasSize = 1
  private atlasCellSize = ICON_TEXTURE_CELL_SIZE
  private lastReportedProgress = -1
  private readonly sphereRadius: number
  private cameraRestZ: number
  private zoom: number
  private readonly cameraRatio: number
  private readonly cleanupCallbacks: Array<() => void> = []
  private nudgePos: Vec2 | null = null
  private spinTarget: {
    index: number
    onArrive: (index: number) => void
  } | null = null
  private nudgeTimer: number | null = null
  // Shuffle Pro: sky pass, camera springs, frame timing.
  private sky: SkyPass | null = null
  private skyState: SkyState | null = null
  private skyQuality: SkyQuality = QUALITY_FULL
  private skyQualityLevel: 'full' | 'lite' = 'full'
  private qualityProbe: { frames: number; sum: number } | null = null
  private pull = { x: 0, v: 0, target: 0, freq: 9, zeta: 1 }
  private kick = { x: 0, v: 0 }
  private readonly frameTimes = new Float32Array(180)
  private frameTimeCount = 0
  private statsEnabled = false
  onSpinActive: ((active: boolean) => void) | null = null
  // Told when the globe is turning very fast because it was flicked.
  onFlick: ((speed: number, direction: number) => void) | null = null
  private lastFlickAt = 0

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault()
    if (this.disposed || this.contextLost) return
    this.contextLost = true
    window.cancelAnimationFrame(this.frameId)
    this.canvas.dataset.webglState = 'lost'
    this.onFatalError('The poster renderer restarted after losing WebGL')
  }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly items: InfiniteMovieMenuItem<T>[],
    private readonly scale: number,
    private readonly onActiveItemChange: (
      item: InfiniteMovieMenuItem<T>,
    ) => void,
    private readonly onMovementChange: (moving: boolean) => void,
    private readonly onLoadProgress: (percent: number) => void,
    private readonly onFatalError: (message: string) => void,
    zoom = 1,
  ) {
    this.zoom = zoom
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
    })
    const program = gl
      ? getProgram(gl, vertexShaderSource, fragmentShaderSource)
      : null
    if (!gl || !program) throw new Error('WebGL2 could not initialize')
    this.gl = gl
    this.program = program
    const { instanceCount, radiusRatio, sphereRadius } = getGlobeShape(
      this.items.length,
    )
    this.sphereRadius = sphereRadius
    this.cameraRatio = Math.sqrt(radiusRatio)
    this.cameraRestZ = (3.42 * scale * this.cameraRatio) / this.zoom
    this.cameraPosition = [0, 0, this.cameraRestZ]
    this.locations = {
      uWorldMatrix: gl.getUniformLocation(program, 'uWorldMatrix'),
      uViewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
      uProjectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
      uRotationAxisVelocity: gl.getUniformLocation(
        program,
        'uRotationAxisVelocity',
      ),
      uMotionBlur: gl.getUniformLocation(program, 'uMotionBlur'),
      uMotionBlurMax: gl.getUniformLocation(program, 'uMotionBlurMax'),
      uExposure: gl.getUniformLocation(program, 'uExposure'),
      uTint: gl.getUniformLocation(program, 'uTint'),
      uTex: gl.getUniformLocation(program, 'uTex'),
      uItemCount: gl.getUniformLocation(program, 'uItemCount'),
      uAtlasSize: gl.getUniformLocation(program, 'uAtlasSize'),
      uAtlasPadding: gl.getUniformLocation(program, 'uAtlasPadding'),
    }

    this.instancePositions = createHoneycombSpherePositions(
      instanceCount,
      this.sphereRadius,
    )
    this.instanceMatricesArray = new Float32Array(
      this.instancePositions.length * 16,
    )
    this.instanceMatrices = this.instancePositions.map((_, index) => {
      const matrix = new Float32Array(
        this.instanceMatricesArray.buffer,
        index * 16 * 4,
        16,
      )
      matrix.set(identityMat4())
      return matrix
    })

    this.instanceBuffer = gl.createBuffer()
    if (this.instanceBuffer) this.geometryBuffers.push(this.instanceBuffer)
    this.initGeometry()
    this.initTexture()
    this.control = new ArcballControl(canvas, (deltaTime) =>
      this.onControlUpdate(deltaTime),
    )
    canvas.dataset.itemCount = String(this.items.length)
    canvas.dataset.webglState = 'loading'
    canvas.addEventListener('webglcontextlost', this.handleContextLost)
    this.resize()
  }

  run(time = 0) {
    if (this.disposed || this.contextLost || this.paused) return
    const rawDelta = time - this.time
    const deltaTime = Math.min(32, rawDelta || TARGET_FRAME_DURATION)
    if (this.statsEnabled && rawDelta > 0 && rawDelta < 1000) {
      this.frameTimes[this.frameTimeCount % this.frameTimes.length] = rawDelta
      this.frameTimeCount += 1
    }
    if (this.qualityProbe && rawDelta > 0 && rawDelta < 1000) {
      this.qualityProbe.frames += 1
      this.qualityProbe.sum += rawDelta
      if (this.qualityProbe.frames >= QUALITY_PROBE_FRAMES) {
        const average = this.qualityProbe.sum / this.qualityProbe.frames
        this.qualityProbe = null
        if (average > QUALITY_STEP_DOWN_MS) {
          this.skyQuality = QUALITY_LITE
          this.skyQualityLevel = 'lite'
        }
      }
    }
    this.time = time
    this.frames += deltaTime / TARGET_FRAME_DURATION
    if (this.animate(deltaTime)) this.render()
    this.checkFlick(time)
    this.frameId = window.requestAnimationFrame((nextTime) =>
      this.run(nextTime),
    )
  }

  // A drag let go of at speed keeps turning; past a high speed that is a flick.
  // Shuffle and Shuffle Pro spins turn the globe fast too, but are not flicks.
  private checkFlick(now: number) {
    if (!this.onFlick || this.spinTarget || this.control.autoSpin) return
    if (now - this.lastFlickAt < FLICK_WEATHER_COOLDOWN_MS) return
    const speed = this.angularSpeed()
    if (speed < FLICK_WEATHER_SPEED) return
    this.lastFlickAt = now
    this.onFlick(speed, this.control.rotationAxis[1] >= 0 ? 1 : -1)
  }

  // Stops the frame loop while the gallery is hidden (e.g. in list mode) so the
  // GPU idles but textures and orientation survive for an instant return.
  pause() {
    if (this.paused || this.disposed) return
    this.paused = true
    window.cancelAnimationFrame(this.frameId)
  }

  resume() {
    if (!this.paused || this.disposed || this.contextLost) return
    this.paused = false
    this.resize()
    this.frameId = window.requestAnimationFrame((time) => {
      this.time = time
      this.run(time)
    })
  }

  // Pulls the camera in or out (zoom > 1 is closer). Applied in 3D so posters
  // stay crisp and the hold-primed CSS scale keeps working on top of it.
  setZoom(zoom: number) {
    if (zoom === this.zoom) return
    this.zoom = zoom
    this.cameraRestZ = (3.42 * this.scale * this.cameraRatio) / zoom
    this.renderDirty = true
  }

  resize() {
    this.renderDirty = true
    if (resizeCanvasToDisplaySize(this.canvas)) {
      this.gl.viewport(
        0,
        0,
        this.gl.drawingBufferWidth,
        this.gl.drawingBufferHeight,
      )
    }
    this.updateProjectionMatrix()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    window.cancelAnimationFrame(this.frameId)
    if (this.nudgeTimer) window.clearTimeout(this.nudgeTimer)
    this.cleanupCallbacks.forEach((cleanup) => cleanup())
    this.control.dispose()
    this.sky?.dispose()
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    if (!this.gl.isContextLost()) {
      if (this.texture) this.gl.deleteTexture(this.texture)
      this.geometryBuffers.forEach((buffer) => this.gl.deleteBuffer(buffer))
      if (this.vao) this.gl.deleteVertexArray(this.vao)
      // The program stays cached with the context for the next engine.
    }
    this.texture = null
    this.vao = null
    this.canvas.dataset.webglState = 'disposed'
  }

  beginPointerDrag(clientX: number, clientY: number, pointerId?: number) {
    this.cancelSpin()
    this.control.beginTracking()
    if (this.nudgeTimer) window.clearTimeout(this.nudgeTimer)
    this.nudgeTimer = null
    this.nudgePos = null
    this.control.beginDrag(clientX, clientY, pointerId)
  }

  movePointerDrag(clientX: number, clientY: number) {
    this.control.moveDrag(clientX, clientY)
  }

  endPointerDrag(pointerId?: number) {
    this.control.endDrag(pointerId)
  }

  cancelPointerDrag(pointerId?: number) {
    this.control.cancelDrag(pointerId)
  }

  // Wheel and arrow keys drive a short virtual drag so they share the exact
  // feel (inertia and snapping) of a pointer drag.
  nudge(dx: number, dy: number) {
    this.cancelSpin()
    if (this.control.isPointerDown && !this.nudgePos) return
    const center: Vec2 = [
      this.canvas.clientWidth / 2,
      this.canvas.clientHeight / 2,
    ]
    const recenterDistance = Math.min(center[0], center[1]) * 0.4
    if (!this.nudgePos) {
      this.nudgePos = center
      this.control.beginDrag(center[0], center[1])
    } else if (
      Math.hypot(this.nudgePos[0] - center[0], this.nudgePos[1] - center[1]) >
      recenterDistance
    ) {
      const shiftX = center[0] - this.nudgePos[0]
      const shiftY = center[1] - this.nudgePos[1]
      this.control.shiftDrag(shiftX, shiftY)
      this.nudgePos = center
    }
    this.nudgePos = [this.nudgePos[0] + dx, this.nudgePos[1] + dy]
    this.control.moveDrag(this.nudgePos[0], this.nudgePos[1])
    if (this.nudgeTimer) window.clearTimeout(this.nudgeTimer)
    this.nudgeTimer = window.setTimeout(() => this.endNudge(), NUDGE_RELEASE_MS)
  }

  private endNudge() {
    if (this.nudgeTimer) window.clearTimeout(this.nudgeTimer)
    this.nudgeTimer = null
    if (!this.nudgePos) return
    this.nudgePos = null
    this.control.endDrag(undefined, 'nudge')
  }

  setDetailFocus(
    itemId: string | null,
    open: boolean,
    motion: DetailMotion = open ? 'slow' : 'close',
    instanceIndex?: number,
  ) {
    this.detailEaseMs =
      motion === 'fast'
        ? DETAIL_FAST_EASE_MS
        : motion === 'close'
          ? DETAIL_CLOSE_EASE_MS
          : DETAIL_SLOW_EASE_MS

    if (open && itemId) {
      const focusedItem =
        this.detailVertexIndex === null
          ? null
          : this.items[this.detailVertexIndex % Math.max(1, this.items.length)]
      // Keep an instance a click already focused; items repeat on small sets.
      this.detailVertexIndex =
        instanceIndex ??
        (focusedItem?.id === itemId && this.detailVertexIndex !== null
          ? this.detailVertexIndex
          : this.findBestInstanceIndexForItem(itemId))
      const detailPosition = this.instancePositions[this.detailVertexIndex]
      if (detailPosition) {
        this.control.snapTargetDirection = normalize3(
          transformQuat3(detailPosition, this.control.orientation),
        )
      }
    }

    this.detailTargetProgress = open ? 1 : 0
    if (!open) this.detailVertexIndex = null
    this.renderDirty = true
  }

  // Rotates the globe to bring the item's poster to the centre, then calls
  // onArrive. Manual input (drag, wheel, keys) cancels it.
  spinToItem(itemId: string, onArrive: (index: number) => void) {
    if (this.disposed) return
    this.spinTarget = {
      index: this.findBestInstanceIndexForItem(itemId),
      onArrive,
    }
    this.control.snapStrength = SPIN_SNAP_STRENGTH
    this.onSpinActive?.(true)
  }

  cancelSpin() {
    const wasSpinning = this.spinTarget !== null || this.control.isSettling
    this.spinTarget = null
    this.control.snapStrength = null
    this.control.cancelSettle()
    if (wasSpinning) this.onSpinActive?.(false)
  }

  // True while a Shuffle spin or Skip settle is heading for a poster.
  hasSpinTarget() {
    return this.spinTarget !== null || this.control.isSettling
  }

  setGestureSettledHandler(handler: ((totalRad: number) => void) | null) {
    this.control.onGestureSettled = handler
  }

  // Skip: ease the globe to its target within `duration` ms, then arrive.
  settleToItem(
    itemId: string,
    duration: number,
    onArrive: (index: number) => void,
  ) {
    if (this.disposed) return
    const index =
      this.spinTarget?.index ?? this.findBestInstanceIndexForItem(itemId)
    const position = this.instancePositions[index]
    if (!position) return
    this.spinTarget = null
    this.control.snapStrength = null
    this.control.beginSettle(normalize3(position), duration, () => {
      this.onSpinActive?.(false)
      onArrive(index)
    })
    this.onSpinActive?.(true)
  }

  // --- Shuffle Pro -------------------------------------------------------

  get cameraDistanceRatio() {
    return this.cameraRatio
  }

  get cameraRest() {
    return this.cameraRestZ
  }

  // Takes over from a held drag: spin about the axis at omega rad/s. The
  // pointer stays captured so its release still reaches the canvas.
  startAutoSpin(axis: Vec3, omega: number) {
    this.cancelSpin()
    if (this.nudgeTimer) window.clearTimeout(this.nudgeTimer)
    this.nudgeTimer = null
    this.nudgePos = null
    this.control.endDrag()
    this.control.autoSpin = { axis: normalize3(axis), omega }
    this.renderDirty = true
  }

  setAutoSpin(axis: Vec3, omega: number) {
    if (!this.control.autoSpin) return
    this.control.autoSpin = { axis: normalize3(axis), omega }
  }

  // Lets the spin decay on its own with the given time constant.
  stopAutoSpin(releaseTauMs: number) {
    this.control.autoSpin = null
    this.control.releaseTauMs = releaseTauMs
  }

  isAutoSpinning() {
    return this.control.autoSpin !== null
  }

  // The camera's extra distance eases toward the target as a spring: critical
  // damping while a run builds, slightly underdamped for the landing glide.
  setCameraPull(target: number, freq: number, zeta: number) {
    this.pull.target = target
    this.pull.freq = freq
    this.pull.zeta = zeta
  }

  // A quick push on the camera (negative = toward the globe) that springs back.
  kickCamera(velocity: number) {
    this.kick.v += velocity
  }

  // Gets the sky ready ahead of a run without blocking a frame (see
  // SkyPass.prewarm). Cancelling stops the pending steps; nothing else piles up.
  prewarmSky() {
    this.sky ??= new SkyPass(this.gl)
    this.sky.prewarm()
  }

  cancelSkyPrewarm() {
    this.sky?.cancelPrewarm()
  }

  setSkyState(state: SkyState | null) {
    if (!state && this.skyState) this.sky?.trim()
    if (state && !this.skyState) {
      this.qualityProbe = { frames: 0, sum: 0 }
      this.skyQuality = QUALITY_FULL
      this.skyQualityLevel = 'full'
    }
    this.skyState = state
    this.renderDirty = true
  }

  getSkyStats() {
    return {
      qualityLevel: this.skyQualityLevel,
      drawCount: this.sky?.drawCount ?? 0,
      cameraZ: this.cameraPosition[2],
      pull: this.pull.x,
      kick: this.kick.x,
    }
  }

  setStatsEnabled(enabled: boolean) {
    this.statsEnabled = enabled
    this.frameTimeCount = 0
  }

  getFrameStats() {
    const count = Math.min(this.frameTimeCount, this.frameTimes.length)
    if (!count) return { average: 0, p95: 0 }
    const samples = Array.from(this.frameTimes.slice(0, count)).sort(
      (a, b) => a - b,
    )
    const average = samples.reduce((sum, value) => sum + value, 0) / count
    return {
      average,
      p95: samples[Math.min(count - 1, Math.floor(count * 0.95))],
    }
  }

  getAngularSpeed() {
    return this.angularSpeed()
  }

  // Screen radius of the globe in sky units (vertical extent is -1..1).
  private globeScreenRadius() {
    const distance = this.cameraPosition[2]
    const radius = this.sphereRadius * 0.92
    const f = this.projectionMatrix[5]
    return (
      (radius /
        Math.sqrt(Math.max(1e-4, distance * distance - radius * radius))) *
      f
    )
  }

  private skyView(): SkyView {
    return {
      width: this.gl.drawingBufferWidth,
      height: this.gl.drawingBufferHeight,
      viewMatrix: this.viewMatrix,
      projectionMatrix: this.projectionMatrix,
      globeRadius: this.globeScreenRadius(),
      sphereRadius: this.sphereRadius,
      cameraZ: this.cameraPosition[2],
    }
  }

  isSpinning() {
    return Math.abs(this.smoothRotationVelocity) > 0.01
  }

  // Sets the orientation so the item's poster is centred, with no animation.
  // Used before the first frame so the globe opens already facing it.
  faceItem(itemId: string) {
    const index = this.findBestInstanceIndexForItem(itemId)
    const position = this.instancePositions[index]
    if (!position) return
    this.control.faceDirection(normalize3(position))
    this.nearestVertexIndex = index
    this.renderDirty = true
  }

  // Projects every front-facing poster with the same matrices the shader uses
  // and keeps those whose unpadded quad touches the hit ellipse. Taken at
  // press so the result doesn't depend on globe drift before release.
  capturePickSnapshot(
    region = {
      centerY: HIT_REGION_CENTER_Y,
      rx: HIT_REGION_RX,
      ry: HIT_REGION_RY,
    },
  ): PickSnapshot {
    const rect = this.canvas.getBoundingClientRect()
    const ellipse: PickEllipse = {
      cx: rect.left + 0.5 * rect.width,
      cy: rect.top + region.centerY * rect.height,
      rx: region.rx * rect.width,
      ry: region.ry * rect.height,
    }
    const candidates: PickCandidate[] = []
    if (ellipse.rx <= 0 || ellipse.ry <= 0) return { candidates, ellipse }

    const viewProjection = multiplyMat4(
      identityMat4(),
      this.projectionMatrix,
      this.viewMatrix,
    )
    const mvp = identityMat4()
    const toScreen = (x: number, y: number): Vec2 | null => {
      const clipX = mvp[0] * x + mvp[4] * y + mvp[12]
      const clipY = mvp[1] * x + mvp[5] * y + mvp[13]
      const clipW = mvp[3] * x + mvp[7] * y + mvp[15]
      if (clipW <= 0.0001) return null
      return [
        rect.left + ((clipX / clipW + 1) / 2) * rect.width,
        rect.top + ((1 - clipY / clipW) / 2) * rect.height,
      ]
    }

    this.instanceMatrices.forEach((matrix, index) => {
      // World is identity, so the instance translation is the poster centre;
      // posters facing away are culled by the renderer.
      const centerZ = matrix[14]
      if (centerZ < this.sphereRadius * 0.15) return

      multiplyMat4(mvp, viewProjection, matrix)
      const center = toScreen(0, 0)
      const right = toScreen(POSTER_HALF_WIDTH, 0)
      const up = toScreen(0, POSTER_HALF_HEIGHT)
      if (!center || !right || !up) return

      const u: Vec2 = [right[0] - center[0], right[1] - center[1]]
      const v: Vec2 = [up[0] - center[0], up[1] - center[1]]
      if (Math.abs(u[0] * v[1] - u[1] * v[0]) < 0.0001) return

      const candidate = createPickCandidate(index, centerZ, center, u, v)
      if (ellipseIntersectsQuad(candidate.quad, ellipse))
        candidates.push(candidate)
    })

    return { candidates, ellipse }
  }

  // Where an item's poster is on screen right now (viewport pixels), for the
  // poster that is closest to the viewer if the item appears more than once.
  getPosterRect(itemId: string): PosterRect | null {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const viewProjection = multiplyMat4(
      identityMat4(),
      this.projectionMatrix,
      this.viewMatrix,
    )
    const mvp = identityMat4()
    const toScreen = (x: number, y: number): Vec2 | null => {
      const clipX = mvp[0] * x + mvp[4] * y + mvp[12]
      const clipY = mvp[1] * x + mvp[5] * y + mvp[13]
      const clipW = mvp[3] * x + mvp[7] * y + mvp[15]
      if (clipW <= 0.0001) return null
      return [
        rect.left + ((clipX / clipW + 1) / 2) * rect.width,
        rect.top + ((1 - clipY / clipW) / 2) * rect.height,
      ]
    }
    let best: { z: number; rect: PosterRect } | null = null
    this.instanceMatrices.forEach((matrix, index) => {
      const item = this.items[index % Math.max(1, this.items.length)]
      if (!item || item.id !== itemId) return
      const centerZ = matrix[14]
      if (centerZ < this.sphereRadius * 0.15) return
      if (best && best.z >= centerZ) return
      multiplyMat4(mvp, viewProjection, matrix)
      const center = toScreen(0, 0)
      const right = toScreen(POSTER_HALF_WIDTH, 0)
      const up = toScreen(0, POSTER_HALF_HEIGHT)
      if (!center || !right || !up) return
      const halfWidth = Math.hypot(right[0] - center[0], right[1] - center[1])
      const halfHeight = Math.hypot(up[0] - center[0], up[1] - center[1])
      best = {
        z: centerZ,
        rect: {
          left: center[0] - halfWidth,
          top: center[1] - halfHeight,
          width: halfWidth * 2,
          height: halfHeight * 2,
        },
      }
    })
    return (best as { rect: PosterRect } | null)?.rect ?? null
  }

  // Resolves a click against a snapshot; same snapshot and point, same poster.
  pickFromSnapshot(
    snapshot: PickSnapshot,
    clientX: number,
    clientY: number,
  ): PosterHit<T> | null {
    const winner = pickWinner(
      snapshot.candidates,
      [clientX, clientY],
      snapshot.ellipse,
    )
    if (!winner) return null
    const item = this.items[winner.index % Math.max(1, this.items.length)]
    return item ? { index: winner.index, item, quad: winner.quad } : null
  }

  private initGeometry() {
    const gl = this.gl
    this.vao = gl.createVertexArray()
    gl.bindVertexArray(this.vao)

    const vertexBuffer = createBuffer(
      gl,
      this.iconBuffers.vertices,
      gl.STATIC_DRAW,
    )
    if (vertexBuffer) this.geometryBuffers.push(vertexBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)

    const uvBuffer = createBuffer(gl, this.iconBuffers.uvs, gl.STATIC_DRAW)
    if (uvBuffer) this.geometryBuffers.push(uvBuffer)
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0)

    const indexBuffer = gl.createBuffer()
    if (indexBuffer) this.geometryBuffers.push(indexBuffer)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.iconBuffers.indices,
      gl.STATIC_DRAW,
    )

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.instanceMatricesArray.byteLength,
      gl.DYNAMIC_DRAW,
    )
    for (let index = 0; index < 4; index += 1) {
      const loc = 2 + index
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 16 * 4, index * 4 * 4)
      gl.vertexAttribDivisor(loc, 1)
    }

    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
  }

  private initTexture() {
    const gl = this.gl
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([10, 10, 10, 255]),
    )

    const itemCount = Math.max(1, this.items.length)
    this.atlasSize = Math.ceil(Math.sqrt(itemCount))
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    this.atlasCellSize = Math.max(
      1,
      Math.min(
        ICON_TEXTURE_CELL_SIZE,
        Math.floor(maxTextureSize / Math.max(1, this.atlasSize)),
      ),
    )
    this.canvas.dataset.atlasSize = String(this.atlasSize)
    this.canvas.dataset.atlasCellSize = String(this.atlasCellSize)
    this.canvas.dataset.atlasTextureSize = String(
      this.atlasSize * this.atlasCellSize,
    )
    this.canvas.dataset.maxTextureSize = String(maxTextureSize)
    const atlas = document.createElement('canvas')
    const context = atlas.getContext('2d')
    if (!context) return
    atlas.width = this.atlasSize * this.atlasCellSize
    atlas.height = this.atlasSize * this.atlasCellSize
    context.fillStyle = '#050505'
    context.fillRect(0, 0, atlas.width, atlas.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'

    this.reportProgress(3)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
    this.reportProgress(8)

    const uploadCanvas = document.createElement('canvas')
    uploadCanvas.width = this.atlasCellSize
    uploadCanvas.height = this.atlasCellSize
    const uploadContext = uploadCanvas.getContext('2d')
    if (!uploadContext) {
      this.reportProgress(100)
      return
    }

    void this.loadTextureImages(uploadCanvas, uploadContext).catch((error) => {
      if (this.disposed || this.contextLost) return
      this.onFatalError(
        error instanceof Error ? error.message : 'Poster loading failed',
      )
    })
  }

  private async loadTextureImages(
    uploadCanvas: HTMLCanvasElement,
    uploadContext: CanvasRenderingContext2D,
  ) {
    // Load the posters that face the viewer first, so the initial batch below
    // is the visible one. Orientation is still identity at this point, and the
    // snap direction (0, 0, -1) marks the front, as in findNearestVertexIndex.
    const itemCount = Math.max(1, this.items.length)
    const facing = this.items.map(() => -2)
    this.instancePositions.forEach((position, instance) => {
      const item = instance % itemCount
      facing[item] = Math.max(facing[item], -position[2] / this.sphereRadius)
    })
    const indices = this.items
      .map((_, index) => index)
      .sort((a, b) => facing[b] - facing[a])
    const loaded = new Set<number>()

    // Pixelated placeholders for every cell that has no full poster yet,
    // painted in small batches per frame so input never stalls.
    void loadPosterSprite().then((sprite) => {
      let cursor = 0
      const paintBatch = () => {
        if (this.disposed || this.contextLost || !this.texture) return
        const end = Math.min(
          indices.length,
          cursor + PLACEHOLDER_CELLS_PER_FRAME,
        )
        for (; cursor < end; cursor += 1) {
          const index = indices[cursor]
          if (!loaded.has(index)) {
            this.uploadPlaceholderCell(
              index,
              sprite,
              uploadCanvas,
              uploadContext,
            )
          }
        }
        if (cursor < indices.length) window.requestAnimationFrame(paintBatch)
      }
      paintBatch()
    })

    // Show the wall once every poster has settled; progress is settled / total.
    const total = Math.max(1, indices.length)
    let settled = 0
    let ready = false
    const markReady = () => {
      if (ready || this.disposed || this.contextLost) return
      ready = true
      window.clearTimeout(safetyNet)
      this.canvas.dataset.webglState = 'ready'
      this.reportProgress(100)
    }
    const safetyNet = window.setTimeout(markReady, GLOBE_READY_SAFETY_NET_MS)
    this.cleanupCallbacks.push(() => window.clearTimeout(safetyNet))
    const countSettled = () => {
      settled += 1
      if (ready) return
      if (settled >= total) {
        window.requestAnimationFrame(markReady)
        return
      }
      this.reportProgress(8 + (settled / total) * 91)
    }
    const onLoaded = (index: number, image: HTMLImageElement) => {
      loaded.add(index)
      this.uploadPosterCell(index, image, uploadCanvas, uploadContext)
    }

    // A poster that fails is retried quickly (800ms, then 2.4s) before it
    // settles on its placeholder, so one bad request can never stall or kill
    // the globe; slower background retries continue below.
    const failed = await this.loadPosterIndices(
      indices,
      INITIAL_TEXTURE_LOAD_CONCURRENCY,
      (index, image) => {
        onLoaded(index, image)
        countSettled()
      },
      countSettled,
      POSTER_SETTLE_RETRY_DELAYS_MS,
    )

    if (this.disposed || this.contextLost) return
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    )
    markReady()
    this.retryFailedPosters(failed, onLoaded)
  }

  private retryFailedPosters(
    initialFailed: number[],
    onLoaded: (index: number, image: HTMLImageElement) => void,
  ) {
    let failed = initialFailed
    let attempt = 0
    let timer = 0
    const retry = async () => {
      window.clearTimeout(timer)
      if (!failed.length || this.disposed || this.contextLost) return
      const pending = failed
      failed = []
      failed = await this.loadPosterIndices(pending, 6, onLoaded)
      attempt += 1
      schedule()
    }
    const schedule = () => {
      if (!failed.length || this.disposed) {
        window.removeEventListener('online', retry)
        return
      }
      const delay = POSTER_RETRY_DELAYS_MS[attempt]
      if (delay !== undefined) timer = window.setTimeout(retry, delay)
    }
    // Coming back online retries straight away, whatever the attempt count.
    window.addEventListener('online', retry)
    this.cleanupCallbacks.push(() => {
      window.clearTimeout(timer)
      window.removeEventListener('online', retry)
    })
    schedule()
  }

  private async loadPosterIndices(
    indices: number[],
    concurrency: number,
    onLoaded: (index: number, image: HTMLImageElement) => void,
    onFailed?: (index: number) => void,
    retryDelaysMs: number[] = [],
  ) {
    const failed: number[] = []
    let cursor = 0
    let sliceStart = performance.now()
    const worker = async () => {
      while (!this.disposed && !this.contextLost) {
        const index = indices[cursor]
        cursor += 1
        if (index === undefined) return
        const item = this.items[index]
        if (!item) continue
        let image: HTMLImageElement | null = null
        for (let attempt = 0; ; attempt += 1) {
          try {
            image = await this.loadImage(item.image, item.fallbackImage)
            break
          } catch {
            const delay = retryDelaysMs[attempt]
            if (delay === undefined || this.disposed || this.contextLost) break
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, delay),
            )
          }
        }
        if (this.disposed || this.contextLost || !this.texture) return
        if (image) {
          onLoaded(index, image)
          // Posters already in the cache resolve in the same task, so a
          // filter change would upload hundreds of textures without a break.
          if (performance.now() - sliceStart > UPLOAD_SLICE_MS) {
            await yieldToMain()
            sliceStart = performance.now()
          }
        } else {
          failed.push(index)
          onFailed?.(index)
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, Math.max(1, indices.length)) },
        () => worker(),
      ),
    )
    return failed
  }

  private uploadPlaceholderCell(
    index: number,
    sprite: PosterSprite | null,
    uploadCanvas: HTMLCanvasElement,
    uploadContext: CanvasRenderingContext2D,
  ) {
    const item = this.items[index]
    if (!item || !this.texture) return
    const id = posterIdFromUrl(item.image)
    const spriteIndex = id ? sprite?.indexById.get(id) : undefined
    if (sprite && spriteIndex !== undefined) {
      uploadContext.imageSmoothingEnabled = false
      uploadContext.drawImage(
        sprite.image,
        (spriteIndex % sprite.columns) * sprite.cellWidth,
        Math.floor(spriteIndex / sprite.columns) * sprite.cellHeight,
        sprite.cellWidth,
        sprite.cellHeight,
        0,
        0,
        this.atlasCellSize,
        this.atlasCellSize,
      )
      uploadContext.imageSmoothingEnabled = true
    } else if (item.placeholderColor) {
      uploadContext.fillStyle = item.placeholderColor
      uploadContext.fillRect(0, 0, this.atlasCellSize, this.atlasCellSize)
    } else {
      return
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      (index % this.atlasSize) * this.atlasCellSize,
      Math.floor(index / this.atlasSize) * this.atlasCellSize,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      uploadCanvas,
    )
    this.renderDirty = true
  }

  private uploadPosterCell(
    index: number,
    image: HTMLImageElement,
    uploadCanvas: HTMLCanvasElement,
    uploadContext: CanvasRenderingContext2D,
  ) {
    const item = this.items[index]
    if (!item || !this.texture) return
    uploadContext.clearRect(0, 0, this.atlasCellSize, this.atlasCellSize)
    this.drawImageCover(
      uploadContext,
      image,
      0,
      0,
      this.atlasCellSize,
      this.atlasCellSize,
    )

    const x = (index % this.atlasSize) * this.atlasCellSize
    const y = Math.floor(index / this.atlasSize) * this.atlasCellSize
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D,
      0,
      x,
      y,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      uploadCanvas,
    )
    this.renderDirty = true
  }

  private reportProgress(percent: number) {
    const nextPercent = Math.max(0, Math.min(100, Math.round(percent)))
    if (nextPercent === this.lastReportedProgress) return
    this.lastReportedProgress = nextPercent
    this.canvas.dataset.textureProgress = String(nextPercent)
    this.onLoadProgress(nextPercent)
  }

  private loadImage(src: string, fallbackSrc?: string) {
    const cached = posterImageCache.get(src)
    if (cached) {
      // Re-insert so the cache evicts least recently used posters first.
      posterImageCache.delete(src)
      posterImageCache.set(src, cached)
      return cached
    }
    const pending = this.fetchImage(src, fallbackSrc)
    posterImageCache.set(src, pending)
    pending.catch(() => posterImageCache.delete(src))
    // Filters can walk through thousands of catalogue posters; cap what stays
    // referenced so decoded images can be freed, mostly on phones.
    while (posterImageCache.size > POSTER_IMAGE_CACHE_LIMIT) {
      const oldest = posterImageCache.keys().next().value
      if (oldest === undefined) break
      posterImageCache.delete(oldest)
    }
    return pending
  }

  private fetchImage(src: string, fallbackSrc?: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      let triedFallback = false
      let timeoutId = 0
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeoutId)
        resolve(image)
      }
      const tryFallbackOrFail = () => {
        if (fallbackSrc && fallbackSrc !== image.src && !triedFallback) {
          triedFallback = true
          window.clearTimeout(timeoutId)
          image.src = fallbackSrc
          timeoutId = window.setTimeout(
            () => reject(new Error(`Poster timed out: ${src}`)),
            PRIMARY_IMAGE_TIMEOUT_MS,
          )
          return
        }
        window.clearTimeout(timeoutId)
        reject(new Error(`Poster could not load: ${src}`))
      }
      image.crossOrigin = 'anonymous'
      image.onload = finish
      image.onerror = tryFallbackOrFail
      timeoutId = window.setTimeout(tryFallbackOrFail, PRIMARY_IMAGE_TIMEOUT_MS)
      image.src = src
    })
  }

  private drawImageCover(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    if (!image.naturalWidth || !image.naturalHeight) {
      context.fillStyle = '#111'
      context.fillRect(x, y, width, height)
      return
    }

    context.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      x,
      y,
      width,
      height,
    )
  }

  // Returns whether the frame needs drawing.
  private animate(deltaTime: number) {
    const gl = this.gl
    this.control.update(deltaTime)
    const detailStep = 1 - Math.exp(-deltaTime / this.detailEaseMs)
    this.detailProgress +=
      (this.detailTargetProgress - this.detailProgress) * detailStep

    const orientation = this.control.orientation
    const last = this.lastRenderedOrientation
    const orientationDot = Math.abs(
      orientation[0] * last[0] +
        orientation[1] * last[1] +
        orientation[2] * last[2] +
        orientation[3] * last[3],
    )
    const skyUp = this.skyState !== null && this.skyState.intensity > 0.002
    const isStill =
      !skyUp &&
      !this.renderDirty &&
      !this.control.isPointerDown &&
      orientationDot > 1 - 1e-10 &&
      Math.abs(this.control.rotationVelocity) < 1e-6 &&
      Math.abs(this.detailTargetProgress - this.detailProgress) < 1e-5 &&
      Math.abs(this.cameraPosition[2] - this.lastRenderedCameraZ) < 1e-6
    if (isStill) return false
    this.renderDirty = false
    this.lastRenderedOrientation = [...orientation]
    this.lastRenderedCameraZ = this.cameraPosition[2]

    this.instancePositions.forEach((position, index) => {
      const transformed = transformQuat3(position, this.control.orientation)
      const depthScale =
        (Math.abs(transformed[2]) / this.sphereRadius) * 0.52 + (1 - 0.52)
      const isDetailTarget = this.detailVertexIndex === index
      const detailLift = isDetailTarget
        ? this.detailProgress * (ICON_DETAIL_SCALE - ICON_REST_SCALE)
        : -this.detailProgress * 0.035
      const finalScale =
        depthScale * Math.max(0.21, ICON_REST_SCALE + detailLift)
      const matrix = identityMat4()
      const translateToSphere = translationMat4(negate3(transformed))
      const faceCenter = targetToMat4(
        identityMat4(),
        [0, 0, 0],
        transformed,
        [0, 1, 0],
      )
      const scaleMatrix = scalingMat4([finalScale, finalScale, finalScale])
      const backTranslate = translationMat4([0, 0, -this.sphereRadius])

      multiplyMat4(matrix, matrix, translateToSphere)
      multiplyMat4(matrix, matrix, faceCenter)
      multiplyMat4(matrix, matrix, scaleMatrix)
      multiplyMat4(matrix, matrix, backTranslate)
      copyMat4(this.instanceMatrices[index], matrix)
    })

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceMatricesArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    this.smoothRotationVelocity = this.control.rotationVelocity
    return true
  }

  // Angular speed of the globe in rad/s (control velocity is turns per frame).
  angularSpeed() {
    return (
      Math.abs(this.smoothRotationVelocity) *
      2 *
      Math.PI *
      (1000 / TARGET_FRAME_DURATION)
    )
  }

  // 0 below the threshold (so ordinary drags never smear), ramping to 1 on a
  // hard flick. Zero costs nothing: the shader branches on the uniform.
  private motionBlurAmount() {
    const speed = this.angularSpeed()
    if (speed <= MOTION_BLUR_THRESHOLD) return 0
    const t = Math.min(
      1,
      (speed - MOTION_BLUR_THRESHOLD) /
        (MOTION_BLUR_CAP - MOTION_BLUR_THRESHOLD),
    )
    return t * t * (3 - 2 * t)
  }

  private render() {
    const gl = this.gl
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // Shuffle Pro's sky sits behind the globe; at intensity 0 it is skipped
    // entirely (and never even created until the first run).
    const sky = this.skyState
    if (sky && sky.intensity > 0.002) {
      this.sky ??= new SkyPass(gl)
      this.sky.drawSky(
        sky,
        this.skyQuality,
        this.skyView(),
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      )
    }

    gl.useProgram(this.program)
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.uniformMatrix4fv(this.locations.uWorldMatrix, false, this.worldMatrix)
    gl.uniformMatrix4fv(this.locations.uViewMatrix, false, this.viewMatrix)
    gl.uniformMatrix4fv(
      this.locations.uProjectionMatrix,
      false,
      this.projectionMatrix,
    )
    gl.uniform4f(
      this.locations.uRotationAxisVelocity,
      this.control.rotationAxis[0],
      this.control.rotationAxis[1],
      this.control.rotationAxis[2],
      this.smoothRotationVelocity * 1.1,
    )
    gl.uniform1f(this.locations.uMotionBlur, this.motionBlurAmount())
    gl.uniform1f(
      this.locations.uMotionBlurMax,
      MOTION_BLUR_MAX_SMEAR * (1 + MOTION_BLUR_PRO_BOOST * (sky?.blur ?? 0)),
    )
    const tint = sky ? PALETTES[sky.tier].c1 : [1, 1, 1]
    gl.uniform1f(this.locations.uExposure, sky?.exposure ?? 0)
    gl.uniform4f(
      this.locations.uTint,
      tint[0],
      tint[1],
      tint[2],
      sky ? sky.color * sky.intensity * GRADE_STRENGTH : 0,
    )
    gl.uniform1i(this.locations.uItemCount, Math.max(1, this.items.length))
    gl.uniform1i(this.locations.uAtlasSize, this.atlasSize)
    gl.uniform1f(
      this.locations.uAtlasPadding,
      Math.min(0.12, ICON_TEXTURE_PADDING / this.atlasCellSize),
    )
    gl.uniform1i(this.locations.uTex, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.bindVertexArray(this.vao)
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      this.iconBuffers.indices.length,
      gl.UNSIGNED_SHORT,
      0,
      this.instancePositions.length,
    )

    if (sky && this.sky && sky.particles > 0.001 && sky.intensity > 0.002) {
      this.sky.drawParticles(sky, this.skyQuality, this.skyView())
    }
  }

  private onControlUpdate(deltaTime: number) {
    const timeScale = deltaTime / TARGET_FRAME_DURATION + 0.0001
    let damping = 5 / timeScale
    const restCameraZ = this.cameraRestZ
    const detailCameraZ = Math.max(
      this.sphereRadius + 0.18,
      (2.86 * this.scale * this.cameraRatio) / this.zoom,
    )
    let cameraTargetZ =
      restCameraZ + (detailCameraZ - restCameraZ) * this.detailProgress
    const isMoving =
      this.control.isPointerDown || Math.abs(this.smoothRotationVelocity) > 0.01

    if (isMoving !== this.movementActive) {
      this.movementActive = isMoving
      this.onMovementChange(isMoving)
    }

    if (!this.control.isPointerDown) {
      const targetVertexIndex =
        this.detailVertexIndex !== null && this.detailTargetProgress > 0
          ? this.detailVertexIndex
          : (this.spinTarget?.index ?? this.findNearestVertexIndex())
      this.nearestVertexIndex = targetVertexIndex
      const item =
        this.items[this.nearestVertexIndex % Math.max(1, this.items.length)]
      if (item) this.onActiveItemChange(item)
      this.control.snapTargetDirection = normalize3(
        transformQuat3(
          this.instancePositions[this.nearestVertexIndex],
          this.control.orientation,
        ),
      )
      const spin = this.spinTarget
      if (
        spin &&
        dot3(this.control.snapTargetDirection, this.control.snapDirection) >
          SPIN_ARRIVAL_DOT
      ) {
        this.cancelSpin()
        spin.onArrive(spin.index)
      }
    } else if (!this.nudgePos) {
      cameraTargetZ +=
        (this.control.rotationVelocity * 58 + 0.72) * this.cameraRatio
      damping = 7 / timeScale
    }

    if (this.detailProgress > 0.02 || this.detailTargetProgress > 0) {
      damping = 13 / timeScale
    }

    // Shuffle Pro's camera: a pull-back spring plus a quick "catch" kick.
    const seconds = Math.min(0.05, deltaTime / 1000)
    const pull = this.pull
    const pullAccel =
      pull.freq * pull.freq * (pull.target - pull.x) -
      2 * pull.zeta * pull.freq * pull.v
    pull.v += pullAccel * seconds
    pull.x += pull.v * seconds
    const kick = this.kick
    const kickAccel =
      -KICK_FREQ * KICK_FREQ * kick.x - 2 * KICK_ZETA * KICK_FREQ * kick.v
    kick.v += kickAccel * seconds
    kick.x += kick.v * seconds
    if (
      Math.abs(pull.x) < 1e-5 &&
      Math.abs(pull.v) < 1e-5 &&
      pull.target === 0
    ) {
      pull.x = 0
      pull.v = 0
    }
    if (Math.abs(kick.x) < 1e-5 && Math.abs(kick.v) < 1e-5) {
      kick.x = 0
      kick.v = 0
    }
    cameraTargetZ += pull.x + kick.x

    this.cameraPosition[2] += (cameraTargetZ - this.cameraPosition[2]) / damping
    this.updateCameraMatrix()
  }

  private findNearestVertexIndex() {
    const inversOrientation = conjugateQuat(this.control.orientation)
    const target = transformQuat3(this.control.snapDirection, inversOrientation)
    let maxDot = Number.NEGATIVE_INFINITY
    let nearestVertexIndex = 0
    this.instancePositions.forEach((position, index) => {
      const d = dot3(target, position)
      if (d > maxDot) {
        maxDot = d
        nearestVertexIndex = index
      }
    })
    return nearestVertexIndex
  }

  private findBestInstanceIndexForItem(itemId: string) {
    const inversOrientation = conjugateQuat(this.control.orientation)
    const target = transformQuat3(this.control.snapDirection, inversOrientation)
    let maxDot = Number.NEGATIVE_INFINITY
    let nearestVertexIndex = this.nearestVertexIndex

    this.instancePositions.forEach((position, index) => {
      const item = this.items[index % Math.max(1, this.items.length)]
      if (item?.id !== itemId) return

      const d = dot3(target, position)
      if (d > maxDot) {
        maxDot = d
        nearestVertexIndex = index
      }
    })

    return nearestVertexIndex
  }

  private updateCameraMatrix() {
    targetToMat4(
      this.cameraMatrix,
      this.cameraPosition,
      [0, 0, 0],
      this.cameraUp,
    )
    invertMat4(this.viewMatrix, this.cameraMatrix)
  }

  private updateProjectionMatrix() {
    const gl = this.gl
    const canvas = gl.canvas as HTMLCanvasElement
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
    const height = SPHERE_RADIUS * 0.7 * this.cameraRatio
    const distance = this.cameraPosition[2]
    const fov =
      aspect > 1
        ? 2 * Math.atan(height / distance)
        : 2 * Math.atan(height / aspect / distance)
    perspectiveMat4(this.projectionMatrix, fov, aspect, 0.1, 40)
    this.updateCameraMatrix()
  }
}

type FallbackMovieMenuProps<T> = {
  activeId: string | null
  items: InfiniteMovieMenuItem<T>[]
  onActiveItemChange: (item: InfiniteMovieMenuItem<T>) => void
}

const FallbackMovieMenu = <T,>({
  activeId,
  items,
  onActiveItemChange,
}: FallbackMovieMenuProps<T>) => {
  const fallbackItems = items.slice(0, FALLBACK_ITEM_COUNT)

  return (
    <div
      className='warp-fallback-menu'
      aria-label='Movie poster gallery fallback'
    >
      <div className='warp-fallback-menu-orbit'>
        {fallbackItems.map((item, index) => {
          const row = Math.floor(index / 8)
          const column = index % 8
          const x = (column - 3.5) * 13.5 + ((row % 2) * 5.5 - 2.75)
          const y = (row - 7.5) * 8.8
          const depth = 1 - Math.abs(column - 3.5) / 5.5
          const scaleValue = 0.76 + depth * 0.32
          const rotateValue = (column - 3.5) * -6
          return (
            <button
              type='button'
              key={`${item.id}-${index}`}
              className={cn(
                'warp-fallback-tile',
                item.id === activeId && 'is-active',
              )}
              style={
                {
                  '--fallback-x': `${x}vw`,
                  '--fallback-y': `${y}vh`,
                  '--fallback-scale': scaleValue,
                  '--fallback-rotate': `${rotateValue}deg`,
                  '--fallback-delay': `${(index % 18) * -0.32}s`,
                } as CSSProperties
              }
              onClick={() => onActiveItemChange(item)}
            >
              <img src={item.image} alt='' loading='lazy' />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const InfiniteMovieMenu = <T,>({
  activeId,
  isDetailsOpen,
  items,
  loadState,
  scale = 1,
  onActiveItemChange,
  onLoadProgress,
  isActive = true,
  onMovingChange,
  onOpenItem,
  onReady,
  onUserSpin,
  zoom = 1,
  initialFaceId = null,
  shufflePro = null,
  onSpinActiveChange,
  onGestureSettled,
  onGlobePress,
  controlRef,
  spinRequest = null,
}: InfiniteMovieMenuProps<T>) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<InfiniteMovieEngine<T> | null>(null)
  const flickListenerRef = useRef<
    ((speed: number, direction: number) => void) | null
  >(null)
  const activeItemRef = useRef<InfiniteMovieMenuItem<T> | null>(null)
  // Kept in a ref so a new callback identity never rebuilds the WebGL engine.
  const onMovingChangeRef = useRef(onMovingChange)
  onMovingChangeRef.current = onMovingChange
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const pressRef = useRef<PressState | null>(null)
  const touchOpenGuardRef = useRef<(() => void) | null>(null)
  const portRef = useRef<ShuffleProPort | null>(null)
  // Callbacks and items live in refs so the engine and its Shuffle Pro port
  // never rebuild when their identities change.
  const onOpenItemRef = useRef(onOpenItem)
  onOpenItemRef.current = onOpenItem
  const onSpinActiveChangeRef = useRef(onSpinActiveChange)
  onSpinActiveChangeRef.current = onSpinActiveChange
  const onGestureSettledRef = useRef(onGestureSettled)
  onGestureSettledRef.current = onGestureSettled
  const onGlobePressRef = useRef(onGlobePress)
  onGlobePressRef.current = onGlobePress
  const itemsRef = useRef(items)
  itemsRef.current = items
  const shuffleProRef = useRef(shufflePro)
  shuffleProRef.current = shufflePro
  const onActiveItemChangeRef = useRef(onActiveItemChange)
  onActiveItemChangeRef.current = onActiveItemChange
  // The Shuffle spin in flight, so Skip can finish it.
  const spinInFlightRef = useRef<{
    item: InfiniteMovieMenuItem<T>
    arrive: (index: number) => void
  } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  // Consumed once, by the first engine build that has items to face.
  const initialFaceRef = useRef<string | null>(null)
  const initialFaceUsedRef = useRef(false)
  if (initialFaceId && !initialFaceUsedRef.current) {
    initialFaceRef.current = initialFaceId
  }
  const tuningRef = useRef<GestureTuning>({
    regionCenterY: HIT_REGION_CENTER_Y,
    regionRx: HIT_REGION_RX,
    regionRy: HIT_REGION_RY,
    holdMs: HOLD_TO_DRAG_MS,
    moveTolerancePx: CLICK_MOVE_TOLERANCE_PX,
  })
  const [gestureLog, setGestureLog] = useState<GestureLogEntry[]>([])
  const [debugPick, setDebugPick] = useState<DebugPick | null>(null)
  const [activeItem, setActiveItem] = useState<InfiniteMovieMenuItem<T> | null>(
    null,
  )
  const [isHoldPrimed, setIsHoldPrimed] = useState(false)
  const [webglError, setWebglError] = useState('')

  // A new set of films needs a new globe layout. Solving it takes tens of
  // milliseconds (hundreds on a phone), so it is done in slices first while
  // the current globe keeps running, and the engine only switches once the
  // layout is ready.
  const [engineItems, setEngineItems] = useState(items)
  useEffect(() => {
    if (items === engineItems) return
    const { instanceCount, sphereRadius } = getGlobeShape(items.length)
    if (hasHoneycombLayout(instanceCount, sphereRadius)) {
      setEngineItems(items)
      return
    }
    let cancelled = false
    prewarmHoneycombLayout(instanceCount, sphereRadius).then(() => {
      if (!cancelled) setEngineItems(items)
    })
    return () => {
      cancelled = true
    }
  }, [items, engineItems])

  useEffect(() => {
    const nextActive =
      items.find((item) => item.id === activeId) ??
      activeItemRef.current ??
      items[0] ??
      null
    activeItemRef.current = nextActive
    setActiveItem(nextActive)
  }, [activeId, items])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !engineItems.length) return

    let engine: InfiniteMovieEngine<T> | null = null
    // Holds a premium card back for a beat after its poster lands.
    let beatTimer = 0
    const onResize = () => engine?.resize()

    try {
      onLoadProgress?.(0)
      engine = new InfiniteMovieEngine(
        canvas,
        engineItems,
        scale,
        (item) => {
          activeItemRef.current = item
          setActiveItem(item)
          onActiveItemChange(item)
        },
        (moving) => onMovingChangeRef.current?.(moving),
        (percent) => {
          onLoadProgress?.(percent)
          if (percent >= 100) onReady?.()
        },
        (message) => {
          setWebglError(message)
          onLoadProgress?.(100)
          onReady?.()
        },
        zoomRef.current,
      )
      engineRef.current = engine
      engine.onSpinActive = (active) => onSpinActiveChangeRef.current?.(active)
      engine.onFlick = (speed, direction) =>
        flickListenerRef.current?.(speed, direction)
      engine.setGestureSettledHandler((total) =>
        onGestureSettledRef.current?.(total),
      )
      const openShuffled = (item: InfiniteMovieMenuItem<T>, index: number) => {
        activeItemRef.current = item
        setActiveItem(item)
        onActiveItemChangeRef.current(item)
        engine?.setDetailFocus(item.id, true, 'fast', index)
        onOpenItemRef.current?.(item, 'shuffle')
      }
      const findItem = (id: string) =>
        itemsRef.current.find((candidate) => candidate.id === id)
      const shuffleProPort: ShuffleProPort = {
        getCameraRatio: () => engine?.cameraDistanceRatio ?? 1,
        getCameraRest: () => engine?.cameraRest ?? 3,
        startAutoSpin: (axis, omega) => engine?.startAutoSpin(axis, omega),
        setAutoSpin: (axis, omega) => engine?.setAutoSpin(axis, omega),
        stopAutoSpin: (tau) => engine?.stopAutoSpin(tau),
        getAngularSpeed: () => engine?.getAngularSpeed() ?? 0,
        setCameraPull: (target, freq, zeta) =>
          engine?.setCameraPull(target, freq, zeta),
        kickCamera: (velocity) => engine?.kickCamera(velocity),
        setSkyState: (state) => engine?.setSkyState(state),
        prewarm: () => engine?.prewarmSky(),
        cancelPrewarm: () => engine?.cancelSkyPrewarm(),
        landOn: (itemId, onArrive, beatMs = 0) => {
          const item = findItem(itemId)
          if (!item) {
            onArrive()
            return
          }
          engine?.spinToItem(itemId, (index) => {
            if (beatMs <= 0) {
              openShuffled(item, index)
              onArrive()
              return
            }
            // The poster has landed: let it hold for a beat, with a small push
            // toward it, before the card opens.
            onArrive()
            engine?.kickCamera(-0.9)
            window.clearTimeout(beatTimer)
            beatTimer = window.setTimeout(
              () => openShuffled(item, index),
              beatMs,
            )
          })
        },
        settleTo: (itemId, ms, onArrive) => {
          const item = findItem(itemId)
          if (!item) {
            onArrive()
            return
          }
          engine?.settleToItem(itemId, ms, (index) => {
            openShuffled(item, index)
            onArrive()
          })
        },
        cancelLanding: () => {
          window.clearTimeout(beatTimer)
          engine?.cancelSpin()
        },
        setStatsEnabled: (enabled) => engine?.setStatsEnabled(enabled),
        getFrameStats: () => engine?.getFrameStats() ?? { average: 0, p95: 0 },
        getSkyStats: () =>
          engine?.getSkyStats() ?? {
            qualityLevel: 'full',
            drawCount: 0,
            cameraZ: 0,
            pull: 0,
            kick: 0,
          },
      }
      portRef.current = shuffleProPort
      shuffleProRef.current?.attachPort(shuffleProPort)
      if (initialFaceRef.current) {
        engine.faceItem(initialFaceRef.current)
        initialFaceRef.current = null
        initialFaceUsedRef.current = true
      }
      engine.run()
      if (!isActiveRef.current) engine.pause()
      window.addEventListener('resize', onResize)
      setWebglError('')
    } catch (error) {
      setWebglError(
        error instanceof Error ? error.message : 'WebGL could not initialize',
      )
      onLoadProgress?.(100)
      onReady?.()
    }

    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(beatTimer)
      if (portRef.current) shuffleProRef.current?.detachPort(portRef.current)
      portRef.current = null
      engineRef.current = null
      engine?.dispose()
    }
  }, [engineItems, scale, onActiveItemChange, onLoadProgress, onReady])

  useEffect(() => {
    engineRef.current?.setZoom(zoom)
  }, [zoom])

  useEffect(() => {
    engineRef.current?.setDetailFocus(
      activeItemRef.current?.id ?? activeId,
      isDetailsOpen,
      isDetailsOpen ? 'fast' : 'close',
    )
  }, [activeId, isDetailsOpen])

  useEffect(() => {
    const heldKeys = new Set<string>()
    let frameId = 0
    let lastTime = 0

    const heldDirection = (): Vec2 => {
      let x = 0
      let y = 0
      heldKeys.forEach((key) => {
        x += ARROW_DIRECTIONS[key][0]
        y += ARROW_DIRECTIONS[key][1]
      })
      return [x, y]
    }

    const spin = (time: number) => {
      const elapsed = Math.min(48, time - lastTime)
      lastTime = time
      const [x, y] = heldDirection()
      if (x || y) {
        engineRef.current?.nudge(
          x * KEY_HOLD_PX_PER_MS * elapsed,
          y * KEY_HOLD_PX_PER_MS * elapsed,
        )
      }
      frameId = heldKeys.size ? window.requestAnimationFrame(spin) : 0
    }

    const releaseAll = () => {
      heldKeys.clear()
      if (frameId) window.cancelAnimationFrame(frameId)
      frameId = 0
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = ARROW_DIRECTIONS[event.key]
      if (!direction || !isActive || isDetailsOpen) return
      if (isTypingTarget(event.target)) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      if (heldKeys.has(event.key)) return
      heldKeys.add(event.key)
      engineRef.current?.nudge(
        direction[0] * KEY_NUDGE_PX,
        direction[1] * KEY_NUDGE_PX,
      )
      onUserSpin?.()
      if (!frameId) {
        lastTime = performance.now()
        frameId = window.requestAnimationFrame(spin)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      heldKeys.delete(event.key)
    }

    if (!isActive || isDetailsOpen) releaseAll()
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      releaseAll()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseAll)
    }
  }, [isActive, isDetailsOpen, onUserSpin])

  useEffect(() => {
    if (isActive) engineRef.current?.resume()
    else engineRef.current?.pause()
  }, [isActive])

  const handleFallbackActiveItemChange = useCallback(
    (item: InfiniteMovieMenuItem<T>) => {
      activeItemRef.current = item
      setActiveItem(item)
      onActiveItemChange(item)
    },
    [onActiveItemChange],
  )

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (isDetailsOpen) return
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? window.innerHeight
          : 1
    const clamp = (value: number) =>
      Math.max(-WHEEL_NUDGE_MAX_PX, Math.min(WHEEL_NUDGE_MAX_PX, value))
    // Shift turns a vertical mouse wheel into horizontal spin.
    const [deltaX, deltaY] = event.shiftKey
      ? [event.deltaY, event.deltaX]
      : [event.deltaX, event.deltaY]
    const dx = clamp(-deltaX * unit * WHEEL_NUDGE_SCALE)
    const dy = clamp(-deltaY * unit * WHEEL_NUDGE_SCALE)
    if (!dx && !dy) return
    engineRef.current?.nudge(dx, dy)
    onUserSpin?.()
  }

  const logGesture = useCallback((entry: Omit<GestureLogEntry, 'id'>) => {
    if (!GESTURE_DEBUG) return
    setGestureLog((log) =>
      [{ ...entry, id: performance.now() }, ...log].slice(0, 8),
    )
  }, [])

  const startDrag = useCallback(
    (press: PressState, kind: 'hold' | 'drag' | 'catch') => {
      if (press.dragging) return
      press.dragging = true
      press.kind = kind
      press.snapshot = null
      if (press.holdTimer) window.clearTimeout(press.holdTimer)
      press.holdTimer = null
      // Start from the press point so movement before the drag isn't lost.
      engineRef.current?.beginPointerDrag(press.x, press.y, press.pointerId)
      if (press.lastX !== press.x || press.lastY !== press.y) {
        engineRef.current?.movePointerDrag(press.lastX, press.lastY)
      }
      setIsHoldPrimed(true)
      onUserSpin?.()
    },
    [onUserSpin],
  )

  const openHit = useCallback(
    (hit: PosterHit<T>) => {
      activeItemRef.current = hit.item
      setActiveItem(hit.item)
      onActiveItemChange(hit.item)
      engineRef.current?.setDetailFocus(hit.item.id, true, 'fast', hit.index)
      onOpenItem?.(hit.item, 'tap')
    },
    [onActiveItemChange, onOpenItem],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new request (nonce) starts a spin
  useEffect(() => {
    if (!spinRequest) return
    const item = items.find((candidate) => candidate.id === spinRequest.itemId)
    if (!item) return
    const engine = engineRef.current
    if (!engine) {
      // Fallback (no WebGL): nothing to spin, open straight away.
      onOpenItem?.(item, 'shuffle')
      return
    }
    const arrive = (index: number) => {
      spinInFlightRef.current = null
      activeItemRef.current = item
      setActiveItem(item)
      onActiveItemChange(item)
      engine.setDetailFocus(item.id, true, 'fast', index)
      onOpenItem?.(item, 'shuffle')
    }
    spinInFlightRef.current = { item, arrive }
    engine.spinToItem(item.id, arrive)
    return () => {
      spinInFlightRef.current = null
      engine.cancelSpin()
    }
  }, [spinRequest])

  useEffect(() => {
    if (!controlRef) return
    controlRef.current = {
      skipSpin: () => {
        const spin = spinInFlightRef.current
        const engine = engineRef.current
        if (!spin || !engine) return
        engine.settleToItem(spin.item.id, 300, (index) => spin.arrive(index))
      },
      getPosterRect: (itemId) =>
        engineRef.current?.getPosterRect(itemId) ?? null,
      setOnFlick: (listener) => {
        flickListenerRef.current = listener
      },
    }
    return () => {
      controlRef.current = null
    }
  }, [controlRef])

  const releasePress = () => {
    const press = pressRef.current
    if (press?.holdTimer) window.clearTimeout(press.holdTimer)
    pressRef.current = null
    setIsHoldPrimed(false)
    return press
  }

  useEffect(
    () => () => {
      const timer = pressRef.current?.holdTimer
      if (timer) window.clearTimeout(timer)
      touchOpenGuardRef.current?.()
    },
    [],
  )

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    releasePress()
    const press: PressState = {
      session: null,
      pointerType: event.pointerType,
      dragging: false,
      holdTimer: null,
      kind: null,
      lastX: event.clientX,
      lastY: event.clientY,
      maxMovedPx: 0,
      pointerId: event.pointerId,
      snapshot: null,
      startTime: performance.now(),
      x: event.clientX,
      y: event.clientY,
    }
    pressRef.current = press
    // A real user gesture: the one place the whoosh's audio can be unlocked.
    unlockAudio()
    onGlobePressRef.current?.()
    // During a Shuffle Pro run a press is Skip (or ignored), never a drag.
    const proSession = shuffleProRef.current?.pressStart({
      nx:
        (event.clientX - event.currentTarget.getBoundingClientRect().left) /
        Math.max(1, event.currentTarget.clientWidth),
      ny:
        (event.clientY - event.currentTarget.getBoundingClientRect().top) /
        Math.max(1, event.currentTarget.clientHeight),
    })
    if (proSession === 'consumed') {
      pressRef.current = null
      return
    }
    press.session = proSession ?? null
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture can fail if the pointer is already gone.
    }

    // Pressing a still-spinning globe catches it instead of opening a poster.
    if (engineRef.current?.isSpinning()) {
      startDrag(press, 'catch')
      return
    }
    const { regionCenterY, regionRx, regionRy } = tuningRef.current
    press.snapshot =
      engineRef.current?.capturePickSnapshot({
        centerY: regionCenterY,
        rx: regionRx,
        ry: regionRy,
      }) ?? null
    if (GESTURE_DEBUG) {
      setDebugPick(
        press.snapshot
          ? {
              ellipse: press.snapshot.ellipse,
              quads: press.snapshot.candidates.map((c) => c.quad),
              winner: null,
            }
          : null,
      )
    }
    press.holdTimer = window.setTimeout(
      () => startDrag(press, 'hold'),
      tuningRef.current.holdMs,
    )
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return
    const stepX = event.clientX - press.lastX
    const stepY = event.clientY - press.lastY
    press.lastX = event.clientX
    press.lastY = event.clientY
    const movedPx = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    press.maxMovedPx = Math.max(press.maxMovedPx, movedPx)
    shuffleProRef.current?.pressMove(press.maxMovedPx, stepX, stepY)
    // Once Shuffle Pro owns the globe the pointer only keeps the hold alive.
    if (press.session?.triggered) return

    if (press.dragging) {
      engineRef.current?.movePointerDrag(event.clientX, event.clientY)
      return
    }
    if (movedPx > tuningRef.current.moveTolerancePx) startDrag(press, 'drag')
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pressRef.current?.pointerId !== event.pointerId) return
    const press = releasePress()
    if (!press) return
    const ms = Math.round(performance.now() - press.startTime)
    const movedPx = Math.round(press.maxMovedPx)

    // A press that started a Shuffle Pro run never opens a poster on release.
    const ownedByShufflePro = press.session?.triggered ?? false
    if (press.session) shuffleProRef.current?.pressRelease()
    if (ownedByShufflePro) {
      engineRef.current?.endPointerDrag(press.pointerId)
      logGesture({ kind: 'hold', ms, movedPx })
      return
    }

    if (press.dragging) {
      engineRef.current?.endPointerDrag(press.pointerId)
      logGesture({ kind: press.kind ?? 'drag', ms, movedPx })
      return
    }

    const engine = engineRef.current
    const { regionCenterY, regionRx, regionRy } = tuningRef.current
    const snapshot =
      press.snapshot ??
      engine?.capturePickSnapshot({
        centerY: regionCenterY,
        rx: regionRx,
        ry: regionRy,
      }) ??
      null
    const hit = snapshot
      ? (engine?.pickFromSnapshot(snapshot, event.clientX, event.clientY) ??
        null)
      : null
    if (GESTURE_DEBUG) {
      setDebugPick(
        snapshot
          ? {
              ellipse: snapshot.ellipse,
              quads: snapshot.candidates.map((c) => c.quad),
              winner: hit?.quad ?? null,
            }
          : null,
      )
    }
    logGesture({
      kind: hit ? 'click' : 'miss',
      ms,
      movedPx,
      title: hit?.item.title,
    })
    if (hit && !isDetailsOpen) {
      if (event.pointerType === 'touch') {
        touchOpenGuardRef.current?.()
        touchOpenGuardRef.current = guardTouchOpenClick(event.pointerId)
      }
      openHit(hit)
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pressRef.current?.pointerId !== event.pointerId) return
    const press = releasePress()
    if (press?.session) shuffleProRef.current?.pressRelease()
    if (press?.session?.triggered) {
      engineRef.current?.endPointerDrag(press.pointerId)
    } else if (press?.dragging) {
      engineRef.current?.cancelPointerDrag(press.pointerId)
    }
    if (GESTURE_DEBUG) setDebugPick(null)
  }

  // Touch and pen long-presses raise a context menu that would end a hold;
  // swallow it only while such a press is active so desktop right-click still
  // reaches the native menu.
  const handleContextMenu = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const press = pressRef.current
    if (press && press.pointerType !== 'mouse') event.preventDefault()
  }

  return (
    <div
      className={cn('warp-infinite-menu', isHoldPrimed && 'is-hold-primed')}
      onWheel={handleWheel}
    >
      {webglError ? (
        <FallbackMovieMenu
          activeId={activeItem?.id ?? activeId}
          items={items}
          onActiveItemChange={handleFallbackActiveItemChange}
        />
      ) : (
        <canvas
          ref={canvasRef}
          className='warp-infinite-menu-canvas'
          aria-label='Infinite movie poster menu'
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerCancel={handlePointerCancel}
          onPointerUp={handlePointerUp}
          onContextMenu={handleContextMenu}
        />
      )}

      <div className='warp-infinite-sheen' />

      <div className='warp-wall-loading' data-state={loadState}>
        Loading movies
      </div>

      {GESTURE_DEBUG && isActive
        ? createPortal(
            <GestureDebugPanel
              log={gestureLog}
              pick={debugPick}
              tuningRef={tuningRef}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

type DebugPick = {
  ellipse: PickEllipse
  quads: Vec2[][]
  winner: Vec2[] | null
}

const toPoints = (quad: Vec2[]) => quad.map(([x, y]) => `${x},${y}`).join(' ')

type GestureDebugPanelProps = {
  log: GestureLogEntry[]
  pick: DebugPick | null
  tuningRef: { current: GestureTuning }
}

// Dev-only (?gesture-debug): shows real press timings and lets the click/hold
// thresholds be tuned live. Values are not persisted.
const GestureDebugPanel = ({
  log,
  pick,
  tuningRef,
}: GestureDebugPanelProps) => {
  const [tuning, setTuning] = useState(tuningRef.current)
  const update = (patch: Partial<GestureTuning>) => {
    const next = { ...tuningRef.current, ...patch }
    tuningRef.current = next
    setTuning(next)
  }
  const clicks = log.filter(
    (entry) => entry.kind === 'click' || entry.kind === 'miss',
  )
  const averageClickMs = clicks.length
    ? Math.round(
        clicks.reduce((sum, entry) => sum + entry.ms, 0) / clicks.length,
      )
    : null

  return (
    <>
      {pick ? (
        <svg
          aria-hidden='true'
          style={{
            height: '100%',
            inset: 0,
            pointerEvents: 'none',
            position: 'fixed',
            width: '100%',
            zIndex: 9998,
          }}
        >
          <ellipse
            cx={pick.ellipse.cx}
            cy={pick.ellipse.cy}
            rx={pick.ellipse.rx}
            ry={pick.ellipse.ry}
            fill='none'
            stroke='#38bdf8'
            strokeDasharray='6 4'
            strokeWidth={1.5}
          />
          {pick.quads.map((quad) => (
            <polygon
              key={toPoints(quad)}
              points={toPoints(quad)}
              fill='none'
              stroke='rgba(250, 204, 21, 0.7)'
              strokeWidth={1}
            />
          ))}
          {pick.winner ? (
            <polygon
              points={toPoints(pick.winner)}
              fill='rgba(52, 211, 153, 0.18)'
              stroke='#34d399'
              strokeWidth={3}
            />
          ) : null}
        </svg>
      ) : null}
      <aside className='warp-gesture-debug' aria-label='Gesture tuning'>
        <strong>Gesture tuning</strong>
        <label>
          Hold to drag: {tuning.holdMs} ms
          <input
            type='range'
            min={80}
            max={500}
            step={10}
            value={tuning.holdMs}
            onChange={(event) => update({ holdMs: Number(event.target.value) })}
          />
        </label>
        <label>
          Move tolerance: {tuning.moveTolerancePx} px
          <input
            type='range'
            min={2}
            max={24}
            step={1}
            value={tuning.moveTolerancePx}
            onChange={(event) =>
              update({ moveTolerancePx: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Region centre Y: {tuning.regionCenterY.toFixed(2)}
          <input
            type='range'
            min={0.1}
            max={0.6}
            step={0.01}
            value={tuning.regionCenterY}
            onChange={(event) =>
              update({ regionCenterY: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Region radius X: {tuning.regionRx.toFixed(2)}
          <input
            type='range'
            min={0.1}
            max={0.6}
            step={0.01}
            value={tuning.regionRx}
            onChange={(event) =>
              update({ regionRx: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Region radius Y: {tuning.regionRy.toFixed(2)}
          <input
            type='range'
            min={0.1}
            max={0.6}
            step={0.01}
            value={tuning.regionRy}
            onChange={(event) =>
              update({ regionRy: Number(event.target.value) })
            }
          />
        </label>
        <p>
          Avg click: {averageClickMs === null ? '-' : `${averageClickMs} ms`}
        </p>
        <ol>
          {log.map((entry) => (
            <li key={entry.id}>
              <b>{entry.kind}</b> {entry.ms} ms, {entry.movedPx} px
              {entry.title ? ` - ${entry.title}` : ''}
            </li>
          ))}
        </ol>
      </aside>
    </>
  )
}
