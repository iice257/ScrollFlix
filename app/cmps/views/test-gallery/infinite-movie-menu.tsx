import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { cn } from '../../../utils/tw'
import {
  type HoneycombVec3 as Vec3,
  createHoneycombSpherePositions,
} from './honeycomb-layout'

export type InfiniteMovieMenuItem<T> = {
  id: string
  image: string
  fallbackImage?: string
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
  onReady?: () => void
  onUserSpin?: () => void
}

type Vec2 = [number, number]
type Quat = [number, number, number, number]
type Mat4 = Float32Array

const SPHERE_RADIUS = 2.58
const TARGET_FRAME_DURATION = 1000 / 60
const ICON_TEXTURE_CELL_SIZE = 128
const ICON_TEXTURE_PADDING = 12
const ICON_INSTANCE_COUNT = 750
const ICON_REST_SCALE = 0.18
const ICON_DETAIL_SCALE = 0.34
const DETAIL_FAST_EASE_MS = 210
const DETAIL_SLOW_EASE_MS = 900
const DETAIL_CLOSE_EASE_MS = 460
const CLICK_MOVE_TOLERANCE_PX = 8
const NUDGE_RELEASE_MS = 140
const WHEEL_NUDGE_SCALE = 0.6
const WHEEL_NUDGE_MAX_PX = 90
const KEY_NUDGE_PX = 36
const ARROW_NUDGES: Record<string, Vec2> = {
  ArrowUp: [0, KEY_NUDGE_PX],
  ArrowDown: [0, -KEY_NUDGE_PX],
  ArrowLeft: [KEY_NUDGE_PX, 0],
  ArrowRight: [-KEY_NUDGE_PX, 0],
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
const FALLBACK_ITEM_COUNT = 128
const INITIAL_TEXTURE_LOAD_CONCURRENCY = 24
const PRIMARY_IMAGE_TIMEOUT_MS = 20000

type DetailMotion = 'fast' | 'slow' | 'close'

const vertexShaderSource = `#version 300 es
uniform mat4 uWorldMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec4 uRotationAxisVelocity;

in vec3 aModelPosition;
in vec2 aModelUvs;
in mat4 aInstanceMatrix;

out vec2 vUvs;
out float vAlpha;
flat out int vInstanceId;

void main() {
  vec4 worldPosition = uWorldMatrix * aInstanceMatrix * vec4(aModelPosition, 1.0);

  vec3 centerPos = (uWorldMatrix * aInstanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float radius = length(centerPos.xyz);

  vec3 rotationAxis = uRotationAxisVelocity.xyz;
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

out vec4 outColor;

in vec2 vUvs;
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

  vec2 st = vUvs;
  st = st * (cellSize - cellPadding * 2.0) + cellOffset + cellPadding;

  vec4 color = texture(uTex, st);
  float mask = roundedRectMask(vUvs);
  outColor = color;
  outColor.rgb *= mix(0.58, 1.12, vAlpha);
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

const createDiscGeometry = () => {
  const halfWidth = 0.34
  const halfHeight = 0.5
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

  private pointerPos: Vec2 = [0, 0]
  private previousPointerPos: Vec2 = [0, 0]
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
    if (this.isPointerDown) this.pointerPos = [clientX, clientY]
  }

  endDrag(pointerId?: number) {
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

  update(deltaTime: number) {
    const timeScale = deltaTime / TARGET_FRAME_DURATION + 0.00001
    let angleFactor = timeScale
    let snapRotation = identityQuat()

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
    } else {
      const intensity = 0.1 * timeScale
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
        angleFactor *= 0.2 * distanceFactor
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
    this.updateCallback(deltaTime)
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
  private nudgePos: Vec2 | null = null
  private nudgeTimer: number | null = null

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
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
    })
    const program = gl
      ? createProgram(gl, vertexShaderSource, fragmentShaderSource)
      : null
    if (!gl || !program) throw new Error('WebGL2 could not initialize')
    this.gl = gl
    this.program = program
    this.cameraPosition = [0, 0, 3.42 * scale]
    this.locations = {
      uWorldMatrix: gl.getUniformLocation(program, 'uWorldMatrix'),
      uViewMatrix: gl.getUniformLocation(program, 'uViewMatrix'),
      uProjectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
      uRotationAxisVelocity: gl.getUniformLocation(
        program,
        'uRotationAxisVelocity',
      ),
      uTex: gl.getUniformLocation(program, 'uTex'),
      uItemCount: gl.getUniformLocation(program, 'uItemCount'),
      uAtlasSize: gl.getUniformLocation(program, 'uAtlasSize'),
      uAtlasPadding: gl.getUniformLocation(program, 'uAtlasPadding'),
    }

    this.instancePositions = createHoneycombSpherePositions(
      Math.min(ICON_INSTANCE_COUNT, this.items.length),
      SPHERE_RADIUS,
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
    const deltaTime = Math.min(32, time - this.time || TARGET_FRAME_DURATION)
    this.time = time
    this.frames += deltaTime / TARGET_FRAME_DURATION
    this.animate(deltaTime)
    this.render()
    this.frameId = window.requestAnimationFrame((nextTime) =>
      this.run(nextTime),
    )
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

  resize() {
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
    this.control.dispose()
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    if (!this.gl.isContextLost()) {
      if (this.texture) this.gl.deleteTexture(this.texture)
      this.geometryBuffers.forEach((buffer) => this.gl.deleteBuffer(buffer))
      if (this.vao) this.gl.deleteVertexArray(this.vao)
      this.gl.deleteProgram(this.program)
    }
    this.texture = null
    this.vao = null
    this.canvas.dataset.webglState = 'disposed'
  }

  beginPointerDrag(clientX: number, clientY: number, pointerId?: number) {
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
    if (this.control.isPointerDown && !this.nudgePos) return
    const center: Vec2 = [
      this.canvas.clientWidth / 2,
      this.canvas.clientHeight / 2,
    ]
    const recenterDistance = Math.min(center[0], center[1]) * 0.4
    if (
      !this.nudgePos ||
      Math.hypot(this.nudgePos[0] - center[0], this.nudgePos[1] - center[1]) >
        recenterDistance
    ) {
      this.nudgePos = center
      this.control.beginDrag(center[0], center[1])
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
    this.control.endDrag()
  }

  setDetailFocus(
    itemId: string | null,
    open: boolean,
    motion: DetailMotion = open ? 'slow' : 'close',
  ) {
    this.detailEaseMs =
      motion === 'fast'
        ? DETAIL_FAST_EASE_MS
        : motion === 'close'
          ? DETAIL_CLOSE_EASE_MS
          : DETAIL_SLOW_EASE_MS

    if (open && itemId) {
      this.detailVertexIndex = this.findBestInstanceIndexForItem(itemId)
      const detailPosition = this.instancePositions[this.detailVertexIndex]
      if (detailPosition) {
        this.control.snapTargetDirection = normalize3(
          transformQuat3(detailPosition, this.control.orientation),
        )
      }
    }

    this.detailTargetProgress = open ? 1 : 0
    if (!open) this.detailVertexIndex = null
  }

  pickItemAt(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect()
    const pointerX = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1
    const pointerY = -(
      ((clientY - rect.top) / Math.max(rect.height, 1)) * 2 -
      1
    )
    let nearestIndex: number | null = null
    let nearestScore = Number.POSITIVE_INFINITY
    let nearestDepth = Number.NEGATIVE_INFINITY

    this.instancePositions.forEach((position, index) => {
      const transformed = transformQuat3(position, this.control.orientation)
      const frontBias = transformed[2] / SPHERE_RADIUS
      const depthScale =
        (Math.abs(transformed[2]) / SPHERE_RADIUS) * 0.52 + (1 - 0.52)
      const projectedX =
        transformed[0] /
        (SPHERE_RADIUS * (rect.width > rect.height ? 1.18 : 0.78))
      const projectedY = transformed[1] / (SPHERE_RADIUS * 1.05)
      if (frontBias > 0.88) return
      const centerDepth = -frontBias
      const center: Vec3 = [projectedX, projectedY, centerDepth]
      const projectedScale = Math.max(0.07, ICON_REST_SCALE * depthScale)
      const radiusX = projectedScale * 0.78
      const radiusY = projectedScale * 1.05
      if (radiusX <= 0.001 || radiusY <= 0.001) return

      const dx = center[0] - pointerX
      const dy = center[1] - pointerY
      const normalizedX = Math.abs(dx) / radiusX
      const normalizedY = Math.abs(dy) / radiusY
      if (normalizedX > 1 || normalizedY > 1) return
      const score = normalizedX * normalizedX + normalizedY * normalizedY

      if (
        score < nearestScore - 0.08 ||
        (Math.abs(score - nearestScore) < 0.08 &&
          center[2] > nearestDepth + 0.0001)
      ) {
        nearestScore = score
        nearestDepth = center[2]
        nearestIndex = index
      }
    })

    if (nearestIndex === null) return null
    return this.items[nearestIndex % Math.max(1, this.items.length)] ?? null
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
    const indices = this.items.map((_, index) => index)
    let completed = 0

    await this.loadPosterIndices(
      indices,
      INITIAL_TEXTURE_LOAD_CONCURRENCY,
      (index, image) => {
        this.uploadPosterCell(index, image, uploadCanvas, uploadContext)
        completed += 1
        this.reportProgress(8 + (completed / Math.max(1, indices.length)) * 91)
      },
    )

    if (this.disposed || this.contextLost) return
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    )
    if (this.disposed || this.contextLost) return
    this.canvas.dataset.webglState = 'ready'
    this.reportProgress(100)
  }

  private async loadPosterIndices(
    indices: number[],
    concurrency: number,
    onLoaded: (index: number, image: HTMLImageElement) => void,
  ) {
    let cursor = 0
    const worker = async () => {
      while (!this.disposed && !this.contextLost) {
        const index = indices[cursor]
        cursor += 1
        if (index === undefined) return
        const item = this.items[index]
        if (!item) continue
        const image = await this.loadImage(item.image, item.fallbackImage)
        if (this.disposed || this.contextLost || !this.texture) return
        onLoaded(index, image)
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, Math.max(1, indices.length)) },
        () => worker(),
      ),
    )
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
  }

  private reportProgress(percent: number) {
    const nextPercent = Math.max(0, Math.min(100, Math.round(percent)))
    if (nextPercent === this.lastReportedProgress) return
    this.lastReportedProgress = nextPercent
    this.canvas.dataset.textureProgress = String(nextPercent)
    this.onLoadProgress(nextPercent)
  }

  private loadImage(src: string, fallbackSrc?: string) {
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

  private animate(deltaTime: number) {
    const gl = this.gl
    this.control.update(deltaTime)
    const detailStep = 1 - Math.exp(-deltaTime / this.detailEaseMs)
    this.detailProgress +=
      (this.detailTargetProgress - this.detailProgress) * detailStep

    this.instancePositions.forEach((position, index) => {
      const transformed = transformQuat3(position, this.control.orientation)
      const depthScale =
        (Math.abs(transformed[2]) / SPHERE_RADIUS) * 0.52 + (1 - 0.52)
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
      const backTranslate = translationMat4([0, 0, -SPHERE_RADIUS])

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
  }

  private render() {
    const gl = this.gl
    gl.useProgram(this.program)
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

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
  }

  private onControlUpdate(deltaTime: number) {
    const timeScale = deltaTime / TARGET_FRAME_DURATION + 0.0001
    let damping = 5 / timeScale
    const restCameraZ = 3.42 * this.scale
    const detailCameraZ = Math.max(SPHERE_RADIUS + 0.18, 2.86 * this.scale)
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
          : this.findNearestVertexIndex()
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
    } else {
      cameraTargetZ += this.control.rotationVelocity * 58 + 0.72
      damping = 7 / timeScale
    }

    if (this.detailProgress > 0.02 || this.detailTargetProgress > 0) {
      damping = 13 / timeScale
    }

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
    const height = SPHERE_RADIUS * 0.7
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
  onReady,
  onUserSpin,
}: InfiniteMovieMenuProps<T>) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<InfiniteMovieEngine<T> | null>(null)
  const activeItemRef = useRef<InfiniteMovieMenuItem<T> | null>(null)
  // Kept in a ref so a new callback identity never rebuilds the WebGL engine.
  const onMovingChangeRef = useRef(onMovingChange)
  onMovingChangeRef.current = onMovingChange
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const pointerDownRef = useRef<{
    moved: boolean
    pointerId: number
    x: number
    y: number
  } | null>(null)
  const suppressNextClickRef = useRef(false)
  const [activeItem, setActiveItem] = useState<InfiniteMovieMenuItem<T> | null>(
    null,
  )
  const [isHoldPrimed, setIsHoldPrimed] = useState(false)
  const [webglError, setWebglError] = useState('')

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
    if (!canvas || !items.length) return

    let engine: InfiniteMovieEngine<T> | null = null
    const onResize = () => engine?.resize()

    try {
      onLoadProgress?.(0)
      engine = new InfiniteMovieEngine(
        canvas,
        items,
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
      )
      engineRef.current = engine
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
      engineRef.current = null
      engine?.dispose()
    }
  }, [items, scale, onActiveItemChange, onLoadProgress, onReady])

  useEffect(() => {
    engineRef.current?.setDetailFocus(
      activeItemRef.current?.id ?? activeId,
      isDetailsOpen,
      isDetailsOpen ? 'fast' : 'close',
    )
  }, [activeId, isDetailsOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const nudge = ARROW_NUDGES[event.key]
      if (!nudge || !isActive || isDetailsOpen) return
      if (isTypingTarget(event.target)) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      engineRef.current?.nudge(nudge[0], nudge[1])
      onUserSpin?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    onUserSpin?.()
    pointerDownRef.current = {
      moved: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
    engineRef.current?.beginPointerDrag(
      event.clientX,
      event.clientY,
      event.pointerId,
    )
    setIsHoldPrimed(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointerDown = pointerDownRef.current
    if (!pointerDown) return

    const dx = event.clientX - pointerDown.x
    const dy = event.clientY - pointerDown.y
    if (Math.hypot(dx, dy) > CLICK_MOVE_TOLERANCE_PX) {
      pointerDown.moved = true
      suppressNextClickRef.current = true
    }
    engineRef.current?.movePointerDrag(event.clientX, event.clientY)
  }

  const clearHoldState = useCallback(() => {
    setIsHoldPrimed(false)
  }, [])

  const finishPointerInteraction = () => {
    const pointerDown = pointerDownRef.current
    if (pointerDown) engineRef.current?.endPointerDrag(pointerDown.pointerId)
    if (pointerDown?.moved) suppressNextClickRef.current = true
    pointerDownRef.current = null
    clearHoldState()
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
          onPointerCancel={() => {
            const pointerDown = pointerDownRef.current
            if (pointerDown)
              engineRef.current?.cancelPointerDrag(pointerDown.pointerId)
            if (pointerDown?.moved) suppressNextClickRef.current = true
            clearHoldState()
            pointerDownRef.current = null
          }}
          onPointerUp={finishPointerInteraction}
          onClick={() => {
            pointerDownRef.current = null
            clearHoldState()
            if (suppressNextClickRef.current) {
              suppressNextClickRef.current = false
            }
          }}
        />
      )}

      <div className='warp-infinite-sheen' />

      <div className='warp-wall-loading' data-state={loadState}>
        Loading movies
      </div>
    </div>
  )
}
