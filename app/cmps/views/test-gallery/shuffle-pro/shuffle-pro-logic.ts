// Pure, framework-free Shuffle Pro rules. `random` and time are always passed
// in so every rule is deterministic under test.

export type Tier = 'frost' | 'amethyst' | 'jade' | 'gold'
export type BaseTier = Exclude<Tier, 'gold'>
export type Vec3 = [number, number, number]

export const TIER_LABELS: Record<Tier, string> = {
  frost: 'Frost',
  amethyst: 'Amethyst',
  jade: 'Jade',
  gold: 'Gold',
}

// ---------------------------------------------------------------- holding

export const HOLD_STILL_MOVE_PX = 8

export const HOLD_RULES = {
  normal: { stillMs: 5000, movingMs: 10000 },
  immersive: { stillMs: 3000, movingMs: 6000 },
} as const

export const shouldTriggerHold = ({
  elapsedMs,
  maxMovedPx,
  immersive,
}: {
  elapsedMs: number
  maxMovedPx: number
  immersive: boolean
}) => {
  const rules = immersive ? HOLD_RULES.immersive : HOLD_RULES.normal
  const still = maxMovedPx <= HOLD_STILL_MOVE_PX
  return elapsedMs >= (still ? rules.stillMs : rules.movingMs)
}

// ---------------------------------------------------------------- big spins

export const BIG_SPIN_RADIANS = Math.PI / 2

export const isBigSpin = (totalRotationRad: number) =>
  totalRotationRad >= BIG_SPIN_RADIANS

// ---------------------------------------------------------------- streaks

export type StreakState = { streak: number; bigSpinRun: number }

export type StreakEvent =
  // Dock Shuffle, Space, Re-shuffle, or releasing a Shuffle Pro hold.
  | { type: 'shuffle' }
  // A drag or swipe that turned the globe at least a quarter turn.
  | { type: 'bigSpin' }
  // Opening a poster, changing filters/sort/search, switching views, opening
  // Watch links / About / Saved, or aborting a run.
  | { type: 'break' }
  // Closing a card, nudges, small drags, saving, Skip: no effect.
  | { type: 'neutral' }
  // A Shuffle Pro run has ended.
  | { type: 'runEnd' }

export const EMPTY_STREAK: StreakState = { streak: 0, bigSpinRun: 0 }

export const STREAK_RULES = {
  normal: { bigSpinRun: 5, streakRoll: 10, rollChance: 0.05 },
  immersive: { bigSpinRun: 3, streak: 6 },
} as const

export const reduceStreak = (
  state: StreakState,
  event: StreakEvent,
  { immersive, random }: { immersive: boolean; random: () => number },
): { state: StreakState; trigger: BaseTier | null } => {
  if (event.type === 'neutral') return { state, trigger: null }
  if (event.type === 'break' || event.type === 'runEnd') {
    return { state: EMPTY_STREAK, trigger: null }
  }

  const next: StreakState = {
    streak: state.streak + 1,
    bigSpinRun: event.type === 'bigSpin' ? state.bigSpinRun + 1 : 0,
  }

  let trigger: BaseTier | null = null
  if (immersive) {
    const rules = STREAK_RULES.immersive
    if (next.bigSpinRun >= rules.bigSpinRun || next.streak >= rules.streak) {
      trigger = 'jade'
    }
  } else {
    const rules = STREAK_RULES.normal
    if (next.bigSpinRun >= rules.bigSpinRun) trigger = 'frost'
    else if (next.streak >= rules.streakRoll && random() < rules.rollChance) {
      trigger = 'amethyst'
    }
  }

  return { state: trigger ? EMPTY_STREAK : next, trigger }
}

// One action away from a run starting by itself. The page warms the sky up
// quietly at this point so the run starts without a hitch.
export const isNearTrigger = (state: StreakState, immersive: boolean) => {
  if (immersive) {
    const rules = STREAK_RULES.immersive
    return (
      state.bigSpinRun >= rules.bigSpinRun - 1 ||
      state.streak >= rules.streak - 1
    )
  }
  const rules = STREAK_RULES.normal
  return (
    state.bigSpinRun >= rules.bigSpinRun - 1 ||
    state.streak >= rules.streakRoll - 1
  )
}

// A held press this long is clearly a hold, not a tap or a drag: start
// warming the effect up.
export const HOLD_PREWARM_MS = 1500

// ---------------------------------------------------------------- gold

export type FoundPaths = Partial<Record<Tier, unknown>>

export const GOLD_AFTER_FOUND_CHANCE = 0.1

export const hasUnlockedGold = (found: FoundPaths) =>
  Boolean(found.frost && found.amethyst && found.jade)

// Gold rule: once Frost, Amethyst and Jade are all found, the next run of any
// kind becomes Gold; after Gold has been found, any run has a 10% chance.
export const resolveTier = (
  base: BaseTier,
  { found, random }: { found: FoundPaths; random: () => number },
): Tier => {
  if (found.gold) return random() < GOLD_AFTER_FOUND_CHANCE ? 'gold' : base
  return hasUnlockedGold(found) ? 'gold' : base
}

// ---------------------------------------------------------------- timeline

export type RunProfile = {
  // Everything is in ms from the trigger.
  windupMs: number
  peakMs: number
  omegaMin: number
  omegaMax: number
  exponent: number
  skyStartMs: number
  skyDurationMs: number
  colorStartMs: number
  colorDurationMs: number
  particlesStartMs: number
  particlesDurationMs: number
  // How long an automatic run holds the peak before landing on its own.
  autoPeakHoldMs: number
}

export const STANDARD_PROFILE: RunProfile = {
  windupMs: 4000,
  peakMs: 5000,
  omegaMin: 0.6,
  omegaMax: 7,
  exponent: 2.2,
  skyStartMs: 800,
  skyDurationMs: 2200,
  colorStartMs: 1500,
  colorDurationMs: 2000,
  particlesStartMs: 3000,
  particlesDurationMs: 1500,
  autoPeakHoldMs: 1600,
}

// Jade is shorter and more exciting: faster to its peak and a higher top
// speed, with every other step of the timeline halved.
export const JADE_PROFILE: RunProfile = {
  windupMs: 2000,
  peakMs: 2500,
  omegaMin: 0.6,
  omegaMax: 9,
  exponent: 2.2,
  skyStartMs: 400,
  skyDurationMs: 1100,
  colorStartMs: 750,
  colorDurationMs: 1000,
  particlesStartMs: 1500,
  particlesDurationMs: 750,
  autoPeakHoldMs: 800,
}

export const profileFor = (tier: Tier): RunProfile =>
  tier === 'jade' ? JADE_PROFILE : STANDARD_PROFILE

export const PEAK_DRIFT = 0.04
const PEAK_DRIFT_PERIOD_MS = 1700

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// ω(t): a wind-up that itself accelerates, then the top speed with a slight
// drift for as long as the hold lasts.
export const angularSpeedAt = (tMs: number, profile: RunProfile) => {
  const t = Math.max(0, tMs)
  if (t < profile.windupMs) {
    const x = (t / profile.windupMs) ** profile.exponent
    return profile.omegaMin + (profile.omegaMax - profile.omegaMin) * x
  }
  const drift =
    PEAK_DRIFT *
    Math.sin(((t - profile.windupMs) / PEAK_DRIFT_PERIOD_MS) * Math.PI * 2)
  return profile.omegaMax * (1 + drift)
}

export const PULLBACK_FACTOR = 1.4
export const PULLBACK_EXPONENT = 1.3

// Extra camera distance for a spin speed: a real 3D pull-back that is
// continuous through the peak.
export const cameraPullback = (
  speed: number,
  profile: RunProfile,
  cameraRatio: number,
) =>
  PULLBACK_FACTOR *
  cameraRatio *
  Math.min(1.2, Math.max(0, speed) / profile.omegaMax) ** PULLBACK_EXPONENT

export type Reveal = { sky: number; color: number; particles: number }

export const revealAt = (tMs: number, profile: RunProfile): Reveal => ({
  sky: smoothstep(
    profile.skyStartMs,
    profile.skyStartMs + profile.skyDurationMs,
    tMs,
  ),
  color: smoothstep(
    profile.colorStartMs,
    profile.colorStartMs + profile.colorDurationMs,
    tMs,
  ),
  particles: smoothstep(
    profile.particlesStartMs,
    profile.particlesStartMs + profile.particlesDurationMs,
    tMs,
  ),
})

// ---------------------------------------------------------------- spin axis

export const DEFAULT_DRAG_DIRECTION: [number, number] = [1, 0.35]
export const PRECESSION_MAX_RAD = (25 * Math.PI) / 180
export const PRECESSION_PERIOD_MS = 6000
const PRECESSION_RAMP_MS = 1500

const norm3 = ([x, y, z]: Vec3): Vec3 => {
  const length = Math.hypot(x, y, z)
  return length > 1e-9 ? [x / length, y / length, z / length] : [0, 1, 0]
}
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

// The globe's rotation axis (screen space, +x right, +y up, +z at the viewer)
// for a drag direction in screen pixels (y down). Dragging right spins about
// +y; dragging up spins about -x. A zero drag uses the default direction.
export const axisForDragDirection = (dx: number, dy: number): Vec3 => {
  const length = Math.hypot(dx, dy)
  const [mx, my] =
    length > 1e-6 ? [dx / length, dy / length] : DEFAULT_DRAG_DIRECTION
  return norm3([my, mx, 0])
}

// The base axis wobbles on a cone like a gyroscope, up to 25 degrees.
export const precessedAxis = (base: Vec3, tMs: number): Vec3 => {
  const n = norm3(base)
  const p1 = norm3(cross3(n, [0, 0, 1]))
  const p2 = cross3(n, p1)
  const alpha =
    PRECESSION_MAX_RAD * smoothstep(0, PRECESSION_RAMP_MS, Math.max(0, tMs))
  const phi = (tMs / PRECESSION_PERIOD_MS) * Math.PI * 2
  const c = Math.cos(alpha)
  const s = Math.sin(alpha)
  const cp = Math.cos(phi)
  const sp = Math.sin(phi)
  return norm3([
    n[0] * c + s * (p1[0] * cp + p2[0] * sp),
    n[1] * c + s * (p1[1] * cp + p2[1] * sp),
    n[2] * c + s * (p1[2] * cp + p2[2] * sp),
  ])
}

// Screen-space direction (right, up) the surface in front is moving.
export const screenSpinDirection = (axis: Vec3): [number, number] => {
  const x = axis[1]
  const y = -axis[0]
  const length = Math.hypot(x, y)
  return length > 1e-6 ? [x / length, y / length] : [1, 0]
}

// ---------------------------------------------------------------- landing

export const LANDING_TAU_MS = 450
export const LANDING_HANDOVER_OMEGA = 1.2

export const landingOmega = (omegaAtRelease: number, msSinceRelease: number) =>
  omegaAtRelease * Math.exp(-Math.max(0, msSinceRelease) / LANDING_TAU_MS)

export const readyForSnap = (omega: number) => omega < LANDING_HANDOVER_OMEGA

// Never lands on the movie the globe is already facing.
export const pickLandingTarget = (
  candidateIds: readonly string[],
  currentId: string | null,
  random: () => number,
): string | null => {
  const pool = candidateIds.filter((id) => id !== currentId)
  if (!pool.length) return candidateIds[0] ?? null
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}
