// Draws the saved-film constellations and the session path inside the globe's
// own WebGL pass, after the posters (see constellation-geometry.ts for the
// buffers). A link is a ribbon of quads whose corners the vertex shader lifts
// onto a great circle between two posters, read from a texture of their
// positions; a point is a sprite whose glow is a shader falloff. There is no
// blur and nothing is projected on the CPU, so a frame costs a few draw calls.

import {
  ARC_STEPS,
  type ConstellationGeometry,
  DRAW_IN_MS,
  LIFT,
  LINK_STRIDE,
  LINK_STYLE_COUNT,
  POINT_STRIDE,
  linkInks,
} from './constellation-geometry'

export type ConstellationView = {
  // projection * view, column-major (the globe's world matrix is identity).
  viewProjection: Float32Array
  // Size of the drawing buffer in pixels, and pixels per CSS pixel.
  width: number
  height: number
  pxScale: number
  // Date.now() at the clock's zero, and the draw-in clock in seconds.
  nowSeconds: number
  // Seconds for the twinkle, glint and ring (0 holds them still).
  twinkleSeconds: number
  light: boolean
}

const POSITION_UNIT = 2

const linkVertexSource = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location = 0) in vec4 aHead;
layout(location = 1) in float aStart;
layout(location = 2) in float aNextT;

uniform sampler2D uPos;
uniform mat4 uViewProjection;
uniform vec2 uResolution;
uniform float uPxScale;
uniform float uNow;
uniform vec3 uInk[${LINK_STYLE_COUNT}];

const float LIFT = ${LIFT.toFixed(3)};
const float STEPS = ${ARC_STEPS.toFixed(1)};
// saved, plain path, then the four Shuffle Pro paths.
const float WIDTH[${LINK_STYLE_COUNT}] = float[${LINK_STYLE_COUNT}](1.0, 1.5, 3.2, 3.2, 3.2, 3.2);
const float ALPHA[${LINK_STYLE_COUNT}] = float[${LINK_STYLE_COUNT}](0.34, 0.6, 0.95, 0.95, 0.95, 0.95);
const float BLUR[${LINK_STYLE_COUNT}] = float[${LINK_STYLE_COUNT}](0.0, 5.0, 14.0, 14.0, 14.0, 14.0);

out vec3 vInk;
out float vAlpha;
out float vOffset;
out float vWidth;
out float vSigma;
out float vGlow;

vec3 posterAt(float index) {
  return texelFetch(uPos, ivec2(int(index + 0.5) * 4 + 3, 0), 0).xyz;
}

// A point on the great circle between two posters, a little above the globe.
vec3 arc(vec3 a, vec3 b, float t) {
  float ra = length(a);
  float rb = length(b);
  vec3 da = a / max(ra, 1e-4);
  vec3 db = b / max(rb, 1e-4);
  float angle = acos(clamp(dot(da, db), -1.0, 1.0));
  float s = sin(angle);
  vec3 dir = s < 1e-3
    ? normalize(mix(da, db, t))
    : da * (sin((1.0 - t) * angle) / s) + db * (sin(t * angle) / s);
  return dir * mix(ra, rb, t) * LIFT;
}

// How much of a point on the globe faces the viewer.
float facing(vec3 p) {
  return clamp((p.z / max(length(p), 1e-4) - 0.02) / 0.22, 0.0, 1.0);
}

void main() {
  float end = float(gl_VertexID >> 1);
  float side = float(gl_VertexID & 1) * 2.0 - 1.0;
  float t0 = aHead.z;
  float t1 = aNextT;
  int style = int(aHead.w + 0.5);

  // A link draws itself in from its first end, over the draw-in time.
  float drawn = clamp((uNow - aStart) / ${(DRAW_IN_MS / 1000).toFixed(3)}, 0.04, 1.0);
  float shown = max(1.0, floor(STEPS * drawn + 0.5));
  bool valid = t1 > t0 + 1e-4 && floor(t0 * STEPS + 0.5) < shown;

  vec3 a = posterAt(aHead.x);
  vec3 b = posterAt(aHead.y);
  vec3 p0 = arc(a, b, t0);
  vec3 p1 = arc(a, b, t1);
  vec4 c0 = uViewProjection * vec4(p0, 1.0);
  vec4 c1 = uViewProjection * vec4(p1, 1.0);
  float seen = min(facing(p0), facing(p1));
  if (!valid || seen < 0.01 || c0.w <= 0.0001 || c1.w <= 0.0001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vInk = vec3(0.0);
    vAlpha = 0.0;
    vOffset = 0.0;
    vWidth = 0.0;
    vSigma = 1.0;
    vGlow = 0.0;
    return;
  }

  vec2 halfRes = 0.5 * uResolution;
  vec2 s0 = c0.xy / c0.w * halfRes;
  vec2 s1 = c1.xy / c1.w * halfRes;
  vec2 along = s1 - s0;
  float len = length(along);
  vec2 dir = len > 1e-4 ? along / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  float width = WIDTH[style] * uPxScale;
  float sigma = max(BLUR[style] * 0.5 * uPxScale, 0.001);
  float reach = width * 0.5 + (BLUR[style] > 0.0 ? 2.5 * sigma : 0.0) + uPxScale;
  vec4 c = end > 0.5 ? c1 : c0;
  c.xy += normal * side * reach / halfRes * c.w;
  gl_Position = c;

  vInk = uInk[style];
  vAlpha = ALPHA[style] * seen;
  vOffset = side * reach;
  vWidth = width;
  vSigma = sigma;
  // How strong the halo is at the line's edge: a blurred line of this width.
  vGlow = BLUR[style] > 0.0 ? 0.9 * clamp(width / (2.5 * sigma), 0.0, 1.0) : 0.0;
}
`

const linkFragmentSource = `#version 300 es
precision highp float;
uniform float uStraight;
in vec3 vInk;
in float vAlpha;
in float vOffset;
in float vWidth;
in float vSigma;
in float vGlow;
out vec4 outColor;

void main() {
  float d = abs(vOffset);
  float core = 1.0 - smoothstep(vWidth * 0.5 - 0.5, vWidth * 0.5 + 0.5, d);
  float glow = vGlow * exp(-d * d / (2.0 * vSigma * vSigma));
  float alpha = clamp(core + glow * (1.0 - core), 0.0, 1.0) * vAlpha;
  if (alpha < 0.002) discard;
  outColor = vec4(uStraight > 0.5 ? vInk : vInk * alpha, alpha);
}
`

const pointVertexSource = `#version 300 es
precision highp float;
precision highp sampler2D;
layout(location = 0) in vec3 aShape;
layout(location = 1) in vec3 aInk;
layout(location = 2) in vec2 aKind;

uniform sampler2D uPos;
uniform mat4 uViewProjection;
uniform vec2 uResolution;
uniform float uPxScale;
uniform float uTwinkle;

const float LIFT = ${LIFT.toFixed(3)};
const float STEPS = ${ARC_STEPS.toFixed(1)};

out vec2 vLocal;
flat out int vKind;
out float vSize;
out float vBright;
out float vSeen;
out vec3 vInk;
out float vPulse;

vec3 posterAt(float index) {
  return texelFetch(uPos, ivec2(int(index + 0.5) * 4 + 3, 0), 0).xyz;
}

vec3 arc(vec3 a, vec3 b, float t) {
  float ra = length(a);
  float rb = length(b);
  vec3 da = a / max(ra, 1e-4);
  vec3 db = b / max(rb, 1e-4);
  float angle = acos(clamp(dot(da, db), -1.0, 1.0));
  float s = sin(angle);
  vec3 dir = s < 1e-3
    ? normalize(mix(da, db, t))
    : da * (sin((1.0 - t) * angle) / s) + db * (sin(t * angle) / s);
  return dir * mix(ra, rb, t) * LIFT;
}

float facing(vec3 p) {
  return clamp((p.z / max(length(p), 1e-4) - 0.02) / 0.22, 0.0, 1.0);
}

void main() {
  int kind = int(aKind.x + 0.5);
  float seed = aKind.y;
  vec3 a = posterAt(aShape.x);
  vec3 position = a;
  float seen = facing(a);
  float size = aShape.z;
  float reach = 12.0;
  float glintFade = 1.0;

  float speed = 1.2 + seed * 1.8;
  float bright = 0.7 + 0.3 * sin(uTwinkle * speed + seed * 40.0);
  float cosView = a.z / max(length(a), 1e-4);

  if (kind == 0) {
    size = aShape.z + 3.0 * cosView;
    reach = size * 3.2;
  } else if (kind == 2) {
    reach = 48.0;
  } else if (kind == 3) {
    reach = 22.0;
  } else if (kind == 4) {
    // A glint rides the coloured link; it fades in and out along it.
    vec3 b = posterAt(aShape.y);
    float u = fract(uTwinkle * 0.35);
    position = arc(a, b, floor(u * STEPS + 0.5) / STEPS);
    seen = facing(position);
    glintFade = sin(u * 3.14159265);
  }

  vec4 c = uViewProjection * vec4(position, 1.0);
  if (seen <= 0.05 || c.w <= 0.0001 || glintFade <= 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vLocal = vec2(0.0);
    vKind = kind;
    vSize = 0.0;
    vBright = 0.0;
    vSeen = 0.0;
    vInk = vec3(0.0);
    vPulse = 0.0;
    return;
  }

  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 halfRes = 0.5 * uResolution;
  c.xy += corner * reach * uPxScale / halfRes * c.w;
  gl_Position = c;
  vLocal = vec2(corner.x, -corner.y) * reach;
  vKind = kind;
  vSize = size;
  vBright = bright;
  vSeen = seen * glintFade;
  vInk = aInk;
  vPulse = 0.5 + 0.5 * sin(uTwinkle * 2.0);
}
`

const pointFragmentSource = `#version 300 es
precision highp float;
uniform float uStraight;
uniform float uLight;
uniform float uPxScale;
in vec2 vLocal;
flat in int vKind;
in float vSize;
in float vBright;
in float vSeen;
in vec3 vInk;
in float vPulse;
out vec4 outColor;

// A four-point glint: two thin crossed streaks and a bright heart.
float streak(vec2 p, float size, float aa) {
  float x = abs(p.x) / size;
  float thin = max(0.0, 1.0 - x * x) * size * 0.05 + 0.12;
  return x < 1.0 ? 1.0 - smoothstep(thin - aa, thin + aa, abs(p.y)) : 0.0;
}

float sparkle(vec2 p, float size, float aa) {
  float arms = max(streak(p, size, aa), streak(p.yx, size, aa));
  float core = 1.0 - smoothstep(max(1.4, size * 0.16) - aa, max(1.4, size * 0.16) + aa, length(p));
  return max(arms, core);
}

void main() {
  float aa = 0.7 / uPxScale;
  vec2 p = vLocal;
  float r = length(p);
  vec3 ink = vInk;
  float alpha = 0.0;

  if (vKind == 0) {
    // A heart with a soft rose glow, brighter with its twinkle.
    float s = vSize;
    // The heart curve (x2 + y2 - 1)3 = x2 y3, sized to the old outline.
    vec2 q = vec2(p.x, -(p.y - 0.075 * s)) / (0.73 * s);
    q.y += 0.13;
    float t = dot(q, q) - 1.0;
    float f = t * t * t - q.x * q.x * q.y * q.y * q.y;
    float fw = max(fwidth(f), 1e-4);
    float cover = 1.0 - smoothstep(-fw, fw, f);
    float sigma = s * 0.65;
    float glow = 0.6 * exp(-r * r / (2.0 * sigma * sigma));
    vec3 fill = uLight > 0.5 ? vInk : vec3(1.0, 0.965, 0.976);
    ink = mix(vInk, fill, cover);
    alpha = (cover + (1.0 - cover) * glow) * (0.55 + 0.4 * vBright);
  } else if (vKind == 1) {
    alpha = sparkle(p, 5.0 + 3.0 * vBright, aa) * (0.45 + 0.4 * vBright);
  } else if (vKind == 2) {
    float halo = (0.4 + 0.2 * vBright) * clamp(1.0 - r / 46.0, 0.0, 1.0);
    float off = abs(r - 9.0);
    float ring = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, off);
    float ringGlow = 0.18 * exp(-off * off / (2.0 * 7.0 * 7.0));
    float star = sparkle(p, 12.0 + 5.0 * vBright, aa) * (0.7 + 0.3 * vBright);
    alpha = 1.0 - (1.0 - halo) * (1.0 - ring) * (1.0 - ringGlow) * (1.0 - star);
  } else if (vKind == 3) {
    // "You are here": a slow ring on the newest point.
    float radius = 13.0 + 4.0 * vPulse;
    float ring = 1.0 - smoothstep(0.6 - aa, 0.6 + aa, abs(r - radius));
    alpha = ring * (0.18 + 0.2 * vPulse);
  } else {
    alpha = sparkle(p, 8.0, aa);
  }

  alpha = clamp(alpha, 0.0, 1.0) * vSeen;
  if (alpha < 0.003) discard;
  outColor = vec4(uStraight > 0.5 ? ink : ink * alpha, alpha);
}
`

type Uniforms = Record<string, WebGLUniformLocation | null>

const compile = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  names: string[],
) => {
  const program = gl.createProgram()
  const shaders = [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ].map(([type, source]) => {
    const shader = gl.createShader(type as number)
    if (!shader) return null
    gl.shaderSource(shader, source as string)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader))
      gl.deleteShader(shader)
      return null
    }
    return shader
  })
  if (!program || shaders.some((shader) => !shader)) return null
  for (const shader of shaders) gl.attachShader(program, shader as WebGLShader)
  gl.linkProgram(program)
  for (const shader of shaders) gl.deleteShader(shader as WebGLShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  const uniforms: Uniforms = {}
  for (const name of names)
    uniforms[name] = gl.getUniformLocation(program, name)
  return { program, uniforms }
}

type Built = NonNullable<ReturnType<typeof compile>>

export class ConstellationPass {
  private readonly gl: WebGL2RenderingContext
  private links: Built | null = null
  private points: Built | null = null
  private failed = false
  private linkVao: WebGLVertexArrayObject | null = null
  private pointVao: WebGLVertexArrayObject | null = null
  private linkBuffer: WebGLBuffer | null = null
  private pointBuffer: WebGLBuffer | null = null
  private positionTexture: WebGLTexture | null = null
  private positionWidth = 0
  private linkCount = 0
  private pointCount = 0
  private inkLight: boolean | null = null
  private readonly ink = new Float32Array(LINK_STYLE_COUNT * 3)

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
  }

  private build() {
    if (this.links || this.failed) return
    const gl = this.gl
    const links = compile(gl, linkVertexSource, linkFragmentSource, [
      'uPos',
      'uViewProjection',
      'uResolution',
      'uPxScale',
      'uNow',
      'uInk',
      'uStraight',
    ])
    const points = compile(gl, pointVertexSource, pointFragmentSource, [
      'uPos',
      'uViewProjection',
      'uResolution',
      'uPxScale',
      'uTwinkle',
      'uStraight',
      'uLight',
    ])
    if (!links || !points) {
      this.failed = true
      return
    }
    this.links = links
    this.points = points

    this.linkBuffer = gl.createBuffer()
    this.linkVao = gl.createVertexArray()
    gl.bindVertexArray(this.linkVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuffer)
    const stride = LINK_STRIDE * 4
    // Instance i is the segment from vertex i to vertex i + 1.
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0)
    gl.vertexAttribDivisor(0, 1)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 16)
    gl.vertexAttribDivisor(1, 1)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, stride + 8)
    gl.vertexAttribDivisor(2, 1)

    this.pointBuffer = gl.createBuffer()
    this.pointVao = gl.createVertexArray()
    gl.bindVertexArray(this.pointVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer)
    const pointStride = POINT_STRIDE * 4
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, pointStride, 0)
    gl.vertexAttribDivisor(0, 1)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, pointStride, 12)
    gl.vertexAttribDivisor(1, 1)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, pointStride, 24)
    gl.vertexAttribDivisor(2, 1)
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)

    this.positionTexture = gl.createTexture()
  }

  // The geometry to draw; upload happens only when it changes.
  setGeometry(geometry: ConstellationGeometry) {
    this.build()
    const gl = this.gl
    if (this.failed) return
    this.linkCount = geometry.linkCount
    this.pointCount = geometry.pointCount
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linkBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, geometry.links, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, geometry.points, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
  }

  get hasContent() {
    return !this.failed && (this.linkCount > 1 || this.pointCount > 0)
  }

  // The poster matrices as the globe uploads them (16 floats per instance). A
  // poster's centre is the last column, so it is read straight from here: four
  // RGBA texels per instance, the fourth one being the position.
  setMatrices(data: Float32Array, instances: number) {
    const gl = this.gl
    if (this.failed || !this.positionTexture) return
    const width = instances * 4
    if (width > (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)) {
      this.failed = true
      return
    }
    gl.activeTexture(gl.TEXTURE0 + POSITION_UNIT)
    gl.bindTexture(gl.TEXTURE_2D, this.positionTexture)
    if (width !== this.positionWidth) {
      this.positionWidth = width
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        width,
        1,
        0,
        gl.RGBA,
        gl.FLOAT,
        data,
      )
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        width,
        1,
        gl.RGBA,
        gl.FLOAT,
        data,
      )
    }
    gl.activeTexture(gl.TEXTURE0)
  }

  draw(view: ConstellationView) {
    if (!this.hasContent || !this.links || !this.points) return
    const gl = this.gl
    if (this.inkLight !== view.light) {
      this.inkLight = view.light
      this.ink.set(linkInks(view.light))
    }
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.activeTexture(gl.TEXTURE0 + POSITION_UNIT)
    gl.bindTexture(gl.TEXTURE_2D, this.positionTexture)

    // The canvas keeps straight (not premultiplied) colour, so a mark has to be
    // blended two ways: over a drawn poster it mixes with the poster, over bare
    // canvas it is written as plain colour with its own alpha. Each pass only
    // takes effect where the canvas is opaque (DST_ALPHA) or empty
    // (ONE_MINUS_DST_ALPHA), so together they cover both.
    for (const straight of [0, 1]) {
      if (straight) {
        gl.blendFuncSeparate(
          gl.ONE_MINUS_DST_ALPHA,
          gl.ONE,
          gl.ONE_MINUS_DST_ALPHA,
          gl.ONE,
        )
      } else {
        gl.blendFuncSeparate(
          gl.DST_ALPHA,
          gl.ONE_MINUS_SRC_ALPHA,
          gl.ZERO,
          gl.ONE,
        )
      }

      if (this.linkCount > 1) {
        const { program, uniforms } = this.links
        gl.useProgram(program)
        gl.uniform1i(uniforms.uPos, POSITION_UNIT)
        gl.uniformMatrix4fv(
          uniforms.uViewProjection,
          false,
          view.viewProjection,
        )
        gl.uniform2f(uniforms.uResolution, view.width, view.height)
        gl.uniform1f(uniforms.uPxScale, view.pxScale)
        gl.uniform1f(uniforms.uNow, view.nowSeconds)
        gl.uniform3fv(uniforms.uInk, this.ink)
        gl.uniform1f(uniforms.uStraight, straight)
        gl.bindVertexArray(this.linkVao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.linkCount - 1)
      }

      if (this.pointCount > 0) {
        const { program, uniforms } = this.points
        gl.useProgram(program)
        gl.uniform1i(uniforms.uPos, POSITION_UNIT)
        gl.uniformMatrix4fv(
          uniforms.uViewProjection,
          false,
          view.viewProjection,
        )
        gl.uniform2f(uniforms.uResolution, view.width, view.height)
        gl.uniform1f(uniforms.uPxScale, view.pxScale)
        gl.uniform1f(uniforms.uTwinkle, view.twinkleSeconds)
        gl.uniform1f(uniforms.uStraight, straight)
        gl.uniform1f(uniforms.uLight, view.light ? 1 : 0)
        gl.bindVertexArray(this.pointVao)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.pointCount)
      }
    }

    gl.bindVertexArray(null)
    gl.activeTexture(gl.TEXTURE0)
  }

  dispose() {
    const gl = this.gl
    if (gl.isContextLost()) return
    for (const built of [this.links, this.points]) {
      if (built) gl.deleteProgram(built.program)
    }
    if (this.linkBuffer) gl.deleteBuffer(this.linkBuffer)
    if (this.pointBuffer) gl.deleteBuffer(this.pointBuffer)
    if (this.linkVao) gl.deleteVertexArray(this.linkVao)
    if (this.pointVao) gl.deleteVertexArray(this.pointVao)
    if (this.positionTexture) gl.deleteTexture(this.positionTexture)
    this.links = null
    this.points = null
  }
}
