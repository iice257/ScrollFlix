// The Shuffle Pro state machine. It is the single owner of the animation loop
// and every timer; the engine only exposes narrow capabilities (the port) and
// React only subscribes to a small snapshot.
//
//   idle -> armed (hold timer running) -> windup -> peak -> landing
//        -> presented -> idle        (plus aborting, on Esc)

import type { Whoosh } from './shuffle-pro-audio'
import {
  type BaseTier,
  EMPTY_STREAK,
  HOLD_PREWARM_MS,
  LANDING_TAU_MS,
  type RunProfile,
  type StreakEvent,
  type StreakState,
  type Tier,
  type Vec3,
  angularSpeedAt,
  axisForDragDirection,
  cameraPullback,
  isNearTrigger,
  precessedAxis,
  profileFor,
  readyForSnap,
  reduceStreak,
  resolveTier,
  revealAt,
  screenSpinDirection,
  shouldTriggerHold,
  smoothstep,
} from './shuffle-pro-logic'
import type { FoundPaths } from './shuffle-pro-logic'
import { type SkyState, createSkyState } from './sky-pass'

export type ControllerPhase =
  | 'idle'
  | 'armed'
  | 'windup'
  | 'peak'
  | 'landing'
  | 'presented'
  | 'aborting'

export type ShuffleProPort = {
  getCameraRatio(): number
  getCameraRest(): number
  startAutoSpin(axis: Vec3, omega: number): void
  setAutoSpin(axis: Vec3, omega: number): void
  stopAutoSpin(releaseTauMs: number): void
  getAngularSpeed(): number
  setCameraPull(target: number, freq: number, zeta: number): void
  kickCamera(velocity: number): void
  setSkyState(state: SkyState | null): void
  // Warm the sky up ahead of a run, away from the frame loop; cancellable.
  prewarm(): void
  cancelPrewarm(): void
  // Spin to the movie with the existing snap, then open its card.
  // beatMs holds the card back for a moment once the poster has landed.
  landOn(itemId: string, onArrive: () => void, beatMs?: number): void
  // Skip: ease to the movie within `ms`, then open its card.
  settleTo(itemId: string, ms: number, onArrive: () => void): void
  cancelLanding(): void
  setStatsEnabled(enabled: boolean): void
  getFrameStats(): { average: number; p95: number }
  getSkyStats(): {
    qualityLevel: 'full' | 'lite'
    drawCount: number
    cameraZ: number
    pull: number
    kick: number
  }
}

export type ControllerDeps = {
  now: () => number
  random: () => number
  raf: (callback: (time: number) => void) => number
  caf: (id: number) => void
  getTheme: () => 'dark' | 'light'
  isImmersive: () => boolean
  isReducedMotion: () => boolean
  getFound: () => FoundPaths
  recordRun: (tier: Tier) => void
  createWhoosh: (tier: Tier) => Whoosh | null
  // A random visible movie that is not the one the globe is already on.
  pickTarget: () => string | null
  // Closes overlays before a run takes over the screen.
  prepare: () => void
  vibrate: (pattern: number | number[]) => void
  // The tier a hold or streak is heading for (or null to let go of it), so
  // tier-specific assets can load in the background.
  prewarmTier?: (tier: Tier | null) => void
  // Sound cues: the peak is reached, the landing is done.
  onCue?: (cue: 'peak' | 'land' | 'end', tier: Tier) => void
}

export type ControllerSnapshot = {
  phase: ControllerPhase
  tier: Tier | null
  theme: 'dark' | 'light'
  // A spin is under way that Skip can finish (any run before the card opens).
  canSkip: boolean
  // Any run is active, including the held press that arms one.
  isRunning: boolean
  // Whether the held press owns the globe right now.
  presented: { movieId: string; tier: Tier } | null
  // Live-region text for assistive tech.
  announcement: string
}

export type PressSession = {
  readonly triggered: boolean
}

type PressInfo = {
  // Press point as a fraction of the canvas, for the trigger ring.
  nx: number
  ny: number
}

type Run = {
  tier: Tier
  profile: RunProfile
  automatic: boolean
  startedAt: number
  baseAxis: Vec3
  peaked: boolean
  targetId: string | null
  reduced: boolean
  whoosh: Whoosh | null
  sky: SkyState
  shocked: boolean
  // Landing / skip bookkeeping.
  releasedAt: number | null
  omegaAtRelease: number
  premium: boolean
  snapStarted: boolean
  skipped: boolean
  arrivedAt: number | null
  fade: { from: number; to: number; start: number; duration: number } | null
  // A run ends once its sky has faded out and its landing is over.
  skyDone: boolean
  landingDone: boolean
}

type Press = {
  startedAt: number
  maxMovedPx: number
  lastDx: number
  lastDy: number
  nx: number
  ny: number
  triggered: boolean
  // Decided when the press starts, so the effect can be prepared early.
  tier: Tier
  prewarmed: boolean
}

const SKY_HOLD_LEVEL = 0.6
const SKIP_SETTLE_MS = 300
const LANDING_WATCHDOG_MS = 2600
// A premium landing holds for a beat on its poster before the card opens.
export const LANDING_BEAT_MS = 380
const CARD_CLOSE_FADE_MS = 600
const NORMAL_FADE_MS = 400
const PEAK_FLASH_MS = 250
const PEAK_FLASH_LIFT = 0.15
const REDUCED_BREATH_AMPLITUDE = 0.02
const REDUCED_BREATH_PERIOD_MS = 3000
const RIM_BREATH_PERIOD_MS = 1200
const RUN_PULL_FREQ = 9
const LANDING_PULL_FREQ = 5.2
const LANDING_PULL_ZETA = 0.62

export class ShuffleProController {
  private phase: ControllerPhase = 'idle'
  private run: Run | null = null
  private press: Press | null = null
  private port: ShuffleProPort | null = null
  private frameId = 0
  private lastFrameAt = 0
  private streak: StreakState = EMPTY_STREAK
  private presented: { movieId: string; tier: Tier } | null = null
  private snapshot: ControllerSnapshot
  private readonly listeners = new Set<() => void>()
  private lastOmega = 0
  private statsEnabled = false
  // Whether the sky was warmed up for a streak that is one action from a run.
  private streakPrewarmed = false

  constructor(private readonly deps: ControllerDeps) {
    this.snapshot = this.buildSnapshot()
  }

  // ----------------------------------------------------------- subscription

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  private emit() {
    const next = this.buildSnapshot()
    const prev = this.snapshot
    if (
      next.phase === prev.phase &&
      next.tier === prev.tier &&
      next.theme === prev.theme &&
      next.canSkip === prev.canSkip &&
      next.isRunning === prev.isRunning &&
      next.announcement === prev.announcement &&
      next.presented?.movieId === prev.presented?.movieId &&
      next.presented?.tier === prev.presented?.tier
    ) {
      return
    }
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  private buildSnapshot(): ControllerSnapshot {
    const run = this.run
    const phase = this.phase
    const running =
      phase === 'windup' || phase === 'peak' || phase === 'landing'
    return {
      phase,
      tier: run?.tier ?? this.presented?.tier ?? null,
      theme: run?.sky.theme ?? this.deps.getTheme(),
      canSkip: running && !run?.arrivedAt,
      isRunning: running || phase === 'armed',
      presented: this.presented,
      announcement:
        run && phase === 'peak' && !run.automatic && !run.releasedAt
          ? 'Release to reveal your pick'
          : '',
    }
  }

  // ------------------------------------------------------------------- port

  attachPort(port: ShuffleProPort) {
    this.port = port
    if (this.statsEnabled) port.setStatsEnabled(true)
  }

  detachPort(port: ShuffleProPort) {
    if (this.port !== port) return
    this.teardown(true)
    this.port = null
  }

  // --------------------------------------------------------------- streaks

  // Counts one user action. Returns the base tier an automatic run should
  // start with, if this action tipped the streak over.
  noteAction(event: StreakEvent): BaseTier | null {
    if (this.isBusy()) return null
    const result = reduceStreak(this.streak, event, {
      immersive: this.deps.isImmersive(),
      random: this.deps.random,
    })
    this.streak = result.state
    this.syncStreakPrewarm(result.state, event.type)
    return result.trigger
  }

  // One action short of a run: warm the effect up. Anything that breaks the
  // streak lets go of it again.
  private syncStreakPrewarm(
    state: StreakState,
    eventType: StreakEvent['type'],
  ) {
    if (!this.port) return
    if (isNearTrigger(state, this.deps.isImmersive())) {
      if (!this.streakPrewarmed) {
        this.streakPrewarmed = true
        this.port.prewarm()
      }
    } else if (this.streakPrewarmed && eventType !== 'neutral') {
      this.streakPrewarmed = false
      this.port.cancelPrewarm()
    }
  }

  getStreak() {
    return this.streak
  }

  // A run is spinning up or landing; new actions can't start another.
  private isBusy() {
    return (
      this.phase === 'windup' ||
      this.phase === 'peak' ||
      this.phase === 'landing'
    )
  }

  // ----------------------------------------------------------- press / hold

  // A pointer went down on the globe. Returns null when the controller
  // consumed the press (Skip during a run) so the globe should ignore it.
  pressStart(info: PressInfo): PressSession | null | 'consumed' {
    if (this.phase === 'windup' || this.phase === 'peak') {
      if (this.run?.automatic) this.skip()
      return 'consumed'
    }
    if (this.phase === 'landing') {
      this.skip()
      return 'consumed'
    }
    if (this.phase !== 'idle' && this.phase !== 'presented') return null
    const press: Press = {
      startedAt: this.deps.now(),
      maxMovedPx: 0,
      lastDx: 0,
      lastDy: 0,
      nx: info.nx,
      ny: info.ny,
      triggered: false,
      tier: resolveTier(this.deps.isImmersive() ? 'jade' : 'frost', {
        found: this.deps.getFound(),
        random: this.deps.random,
      }),
      prewarmed: false,
    }
    this.press = press
    if (this.phase === 'idle') {
      this.phase = 'armed'
      this.emit()
    }
    this.startLoop()
    return {
      get triggered() {
        return press.triggered
      },
    }
  }

  pressMove(maxMovedPx: number, dx: number, dy: number) {
    const press = this.press
    if (!press) return
    press.maxMovedPx = maxMovedPx
    if (Math.hypot(dx, dy) > 0.5) {
      press.lastDx = dx
      press.lastDy = dy
    }
  }

  // The pointer lifted. Returns true if the press belonged to Shuffle Pro, so
  // the globe must not treat it as a click.
  pressRelease(): boolean {
    const press = this.press
    if (!press) return false
    this.press = null
    if (!press.triggered) {
      this.cancelPressPrewarm(press)
      if (this.phase === 'armed') {
        this.phase = 'idle'
        this.emit()
        this.stopLoopIfIdle()
      }
      return false
    }
    if (this.phase === 'windup' || this.phase === 'peak') this.release()
    return true
  }

  private cancelPressPrewarm(press: Press) {
    if (!press.prewarmed) return
    press.prewarmed = false
    this.port?.cancelPrewarm()
    this.deps.prewarmTier?.(null)
  }

  // True while a held press has started a run and still owns the globe.
  ownsPress() {
    return Boolean(this.press?.triggered)
  }

  // ------------------------------------------------------------------ runs

  // An automatic run (streak or debug): spins up on its own, holds the peak
  // briefly, lands on the target.
  startAutomatic(base: BaseTier | Tier, targetId: string | null) {
    if (this.isBusy() || this.phase === 'armed') return
    const tier =
      base === 'gold'
        ? 'gold'
        : resolveTier(base, {
            found: this.deps.getFound(),
            random: this.deps.random,
          })
    this.beginRun(tier, {
      automatic: true,
      targetId,
      dx: 0,
      dy: 0,
      nx: 0.5,
      ny: 0.5,
    })
  }

  // Debug: start a run of an exact tier, as if held.
  startExact(tier: Tier) {
    if (this.isBusy()) return
    this.beginRun(tier, {
      automatic: false,
      targetId: null,
      dx: 0,
      dy: 0,
      nx: 0.5,
      ny: 0.5,
    })
  }

  private beginRun(
    tier: Tier,
    options: {
      automatic: boolean
      targetId: string | null
      dx: number
      dy: number
      nx: number
      ny: number
    },
  ) {
    const port = this.port
    if (!port) return
    // A card from a previous premium pick is replaced, not faded to idle.
    if (this.phase === 'presented' || this.phase === 'aborting') {
      this.teardown(false)
    }
    this.deps.prepare()
    this.streakPrewarmed = false

    const now = this.deps.now()
    const reduced = this.deps.isReducedMotion()
    const profile = profileFor(tier)
    const sky = createSkyState()
    sky.tier = tier
    sky.theme = this.deps.getTheme()
    sky.reduced = reduced
    sky.ringPos = [options.nx, 1 - options.ny]
    sky.ringAge = 0
    sky.intensity = 0

    const baseAxis = axisForDragDirection(options.dx, -options.dy)
    this.run = {
      tier,
      profile,
      automatic: options.automatic,
      startedAt: now,
      baseAxis,
      peaked: false,
      targetId: options.targetId,
      reduced,
      whoosh: reduced ? null : this.deps.createWhoosh(tier),
      sky,
      shocked: false,
      releasedAt: null,
      omegaAtRelease: 0,
      premium: true,
      snapStarted: false,
      skipped: false,
      arrivedAt: null,
      fade: null,
      skyDone: false,
      landingDone: false,
    }
    if (this.press) this.press.triggered = true
    this.phase = 'windup'
    this.presented = null

    port.setSkyState(sky)
    if (!reduced) {
      port.startAutoSpin(precessedAxis(baseAxis, 0), profile.omegaMin)
      // The catch: the camera springs in a few percent, then back.
      port.kickCamera(-2.1)
    }
    this.deps.vibrate(12)
    this.startLoop()
    this.emit()
  }

  // The user let go (or an automatic run finished holding the peak).
  private release() {
    const run = this.run
    const port = this.port
    if (!run || !port || run.releasedAt !== null) return
    const now = this.deps.now()
    run.releasedAt = now
    run.premium = run.peaked
    run.omegaAtRelease = port.getAngularSpeed()
    run.targetId ??= this.deps.pickTarget()
    this.phase = 'landing'
    port.stopAutoSpin(LANDING_TAU_MS)
    port.setCameraPull(0, LANDING_PULL_FREQ, LANDING_PULL_ZETA)
    run.whoosh?.fadeOut(1400)
    run.whoosh = null
    this.deps.vibrate(15)
    if (!run.premium) {
      // Released early: an ordinary shuffle, so the show fades quickly.
      this.beginFade(run, 0, NORMAL_FADE_MS)
      this.streak = this.noteSilently({ type: 'shuffle' })
    }
    this.emit()
  }

  // Applies a streak event without ever starting a run (used on release).
  private noteSilently(event: StreakEvent): StreakState {
    return reduceStreak(this.streak, event, {
      immersive: this.deps.isImmersive(),
      random: () => 1,
    }).state
  }

  private beginFade(run: Run, to: number, duration: number) {
    run.fade = {
      from: run.sky.intensity,
      to,
      start: this.deps.now(),
      duration,
    }
  }

  // Skip: finish the spin now, settling on the target within 300ms. Premium
  // if the tier was already decided (automatic run, or past the peak).
  skip() {
    const run = this.run
    const port = this.port
    if (!run || !port) return
    if (
      this.phase !== 'windup' &&
      this.phase !== 'peak' &&
      this.phase !== 'landing'
    ) {
      return
    }
    if (run.skipped || run.arrivedAt) return
    run.skipped = true
    run.premium = run.automatic || run.peaked
    run.releasedAt ??= this.deps.now()
    run.targetId ??= this.deps.pickTarget()
    this.phase = 'landing'
    run.snapStarted = true
    port.cancelLanding()
    port.stopAutoSpin(LANDING_TAU_MS)
    port.setCameraPull(0, LANDING_PULL_FREQ, LANDING_PULL_ZETA)
    run.whoosh?.fadeOut(500)
    run.whoosh = null
    if (!run.premium) this.beginFade(run, 0, NORMAL_FADE_MS)
    const targetId = run.targetId
    if (targetId) {
      port.settleTo(targetId, SKIP_SETTLE_MS, () => this.arrived(run))
    } else {
      this.arrived(run)
    }
    this.emit()
  }

  // Esc during a run: slow to rest, fade the sky, open no card.
  abort() {
    const run = this.run
    const port = this.port
    if (!run || !port) return
    if (
      this.phase !== 'windup' &&
      this.phase !== 'peak' &&
      this.phase !== 'landing'
    ) {
      return
    }
    this.phase = 'aborting'
    run.premium = false
    run.releasedAt ??= this.deps.now()
    run.snapStarted = true
    port.cancelLanding()
    port.stopAutoSpin(LANDING_TAU_MS)
    port.setCameraPull(0, LANDING_PULL_FREQ, LANDING_PULL_ZETA)
    run.whoosh?.fadeOut(500)
    run.whoosh = null
    this.deps.onCue?.('end', run.tier)
    this.beginFade(run, 0, NORMAL_FADE_MS)
    run.landingDone = true
    this.streak = EMPTY_STREAK
    if (this.press) this.press.triggered = true
    this.emit()
  }

  canAbort() {
    return (
      this.phase === 'windup' ||
      this.phase === 'peak' ||
      this.phase === 'landing'
    )
  }

  // The landing finished: the card is opening.
  private arrived(run: Run) {
    if (this.run !== run || run.arrivedAt) return
    run.arrivedAt = this.deps.now()
    run.landingDone = true
    if (run.premium && run.targetId) {
      this.presented = { movieId: run.targetId, tier: run.tier }
      this.phase = 'presented'
      this.deps.recordRun(run.tier)
      this.deps.onCue?.('land', run.tier)
      // Everything that built up now settles behind the card.
      this.beginFade(run, SKY_HOLD_LEVEL, 900)
      run.sky.rim = 0.5
      this.streak = this.noteSilently({ type: 'runEnd' })
    } else {
      this.phase = 'aborting'
      if (!run.fade && !run.skyDone) this.beginFade(run, 0, NORMAL_FADE_MS)
    }
    this.emit()
    this.checkFinish(run)
  }

  // The premium card closed (or the user re-shuffled from it): fade out.
  cardClosed() {
    const run = this.run
    if (this.phase !== 'presented' || !run) return
    this.presented = null
    this.phase = 'aborting'
    this.deps.onCue?.('end', run.tier)
    this.beginFade(run, 0, CARD_CLOSE_FADE_MS)
    this.emit()
  }

  // ------------------------------------------------------------- debug hooks

  setStatsEnabled(enabled: boolean) {
    this.statsEnabled = enabled
    this.port?.setStatsEnabled(enabled)
  }

  debugForcePeak() {
    const run = this.run
    if (!run || this.phase !== 'windup') return
    run.startedAt = this.deps.now() - run.profile.peakMs
  }

  debugForceRelease() {
    if (this.phase === 'windup' || this.phase === 'peak') this.release()
  }

  debugState() {
    const port = this.port
    return {
      phase: this.phase,
      // Idle readings show the globe's own spin, handy for tuning the blur.
      omega:
        this.phase === 'idle' ? (port?.getAngularSpeed() ?? 0) : this.lastOmega,
      frame: port?.getFrameStats() ?? { average: 0, p95: 0 },
      sky: port?.getSkyStats() ?? {
        qualityLevel: 'full' as const,
        drawCount: 0,
        cameraZ: 0,
        pull: 0,
        kick: 0,
      },
      tier: this.run?.tier ?? null,
      streak: this.streak,
    }
  }

  // --------------------------------------------------------------- the loop

  private startLoop() {
    if (this.frameId) return
    this.lastFrameAt = this.deps.now()
    this.frameId = this.deps.raf(this.tick)
  }

  private stopLoopIfIdle() {
    if (this.phase === 'idle' && this.frameId) {
      this.deps.caf(this.frameId)
      this.frameId = 0
    }
  }

  private readonly tick = () => {
    this.frameId = 0
    const now = this.deps.now()
    const dt = Math.min(64, Math.max(0, now - this.lastFrameAt))
    this.lastFrameAt = now

    if (this.phase === 'armed') this.tickArmed(now)
    else if (this.run) this.tickRun(this.run, now, dt)

    if (this.phase !== 'idle') this.frameId = this.deps.raf(this.tick)
  }

  private tickArmed(now: number) {
    const press = this.press
    if (!press) {
      this.phase = 'idle'
      this.emit()
      return
    }
    if (!press.prewarmed && now - press.startedAt >= HOLD_PREWARM_MS) {
      press.prewarmed = true
      this.port?.prewarm()
      this.deps.prewarmTier?.(press.tier)
    }
    if (
      shouldTriggerHold({
        elapsedMs: now - press.startedAt,
        maxMovedPx: press.maxMovedPx,
        immersive: this.deps.isImmersive(),
      })
    ) {
      this.beginRun(press.tier, {
        automatic: false,
        targetId: null,
        dx: press.lastDx,
        dy: press.lastDy,
        nx: press.nx,
        ny: press.ny,
      })
    }
  }

  private tickRun(run: Run, now: number, dt: number) {
    const port = this.port
    if (!port) return
    const sky = run.sky
    const seconds = dt / 1000
    const elapsed = now - run.startedAt

    if (this.phase === 'windup' || this.phase === 'peak') {
      const omega = run.reduced ? 0 : angularSpeedAt(elapsed, run.profile)
      const axis = precessedAxis(run.baseAxis, elapsed)
      const reveal = revealAt(elapsed, run.profile)

      if (!run.reduced) {
        port.setAutoSpin(axis, omega)
        port.setCameraPull(
          cameraPullback(omega, run.profile, port.getCameraRatio()),
          RUN_PULL_FREQ,
          1,
        )
      } else {
        const breath =
          port.getCameraRest() *
          REDUCED_BREATH_AMPLITUDE *
          Math.sin((elapsed / REDUCED_BREATH_PERIOD_MS) * Math.PI * 2)
        port.setCameraPull(breath, 6, 1)
      }

      sky.intensity = reveal.sky
      sky.color = reveal.color
      sky.particles = reveal.particles
      sky.omega = omega
      sky.spinDir = screenSpinDirection(axis)
      sky.blur = run.reduced ? 0 : Math.min(1, omega / run.profile.omegaMax)
      sky.filigree =
        run.tier === 'gold' ? smoothstep(0, run.profile.windupMs, elapsed) : 0
      this.advanceSkyClock(sky, seconds, omega, run.reduced)
      sky.ringAge = elapsed / 1000 < 0.6 ? elapsed / 1000 : -1

      if (this.phase === 'windup' && elapsed >= run.profile.peakMs) {
        this.enterPeak(run)
      }
      if (this.phase === 'peak') {
        this.tickPeak(run, now, elapsed)
      } else {
        sky.rim = 0.35 * reveal.color
      }
      run.whoosh?.update(omega, run.profile.omegaMax, reveal.sky)
      this.lastOmega = omega
      return
    }

    // Landing, presented, aborting: the spin is the engine's now.
    const omega = port.getAngularSpeed()
    this.lastOmega = omega
    sky.omega = omega
    sky.blur = run.reduced ? 0 : Math.min(1, omega / run.profile.omegaMax)
    this.advanceSkyClock(sky, seconds, omega, run.reduced)
    if (sky.ringAge >= 0) sky.ringAge = -1
    if (run.shocked && sky.shockAge >= 0) {
      sky.shockAge += seconds
      if (sky.shockAge > 0.7) sky.shockAge = -1
    }
    sky.exposure = this.exposureAt(run, now)

    if (this.phase === 'landing' && run.releasedAt !== null) {
      this.tickLanding(run, now)
    }
    if (this.phase === 'presented') {
      // A gentle, slow breathing rim keeps the sky alive behind the card.
      sky.rim = run.reduced
        ? 0.5
        : 0.5 + 0.12 * Math.sin((now / RIM_BREATH_PERIOD_MS) * Math.PI)
    }

    if (this.applyFade(run, now) === 'done-out') {
      run.skyDone = true
      this.port?.setSkyState(null)
      this.checkFinish(run)
    }
  }

  private checkFinish(run: Run) {
    if (run.skyDone && run.landingDone) this.finishRun(run)
  }

  private tickLanding(run: Run, now: number) {
    const port = this.port
    if (!port || run.snapStarted || run.releasedAt === null) return
    const sinceRelease = now - run.releasedAt
    if (
      readyForSnap(port.getAngularSpeed()) ||
      sinceRelease > LANDING_WATCHDOG_MS
    ) {
      run.snapStarted = true
      const targetId = run.targetId
      if (targetId) {
        port.landOn(
          targetId,
          () => this.arrived(run),
          run.premium ? LANDING_BEAT_MS : 0,
        )
      } else this.arrived(run)
    }
  }

  private enterPeak(run: Run) {
    this.phase = 'peak'
    run.peaked = true
    run.shocked = true
    run.sky.shockAge = 0
    run.sky.exposure = 0
    this.deps.vibrate([20, 40, 20])
    this.deps.onCue?.('peak', run.tier)
    this.emit()
  }

  private tickPeak(run: Run, now: number, elapsed: number) {
    const sky = run.sky
    const sincePeak = elapsed - run.profile.peakMs
    if (sky.shockAge >= 0) {
      sky.shockAge = sincePeak / 1000
      if (sky.shockAge > 0.7) sky.shockAge = -1
    }
    sky.exposure = this.exposureAt(run, now)
    sky.rim = run.reduced
      ? 0.85
      : 0.62 + 0.38 * Math.sin((sincePeak / RIM_BREATH_PERIOD_MS) * Math.PI * 2)
    // Automatic runs hold the peak briefly, then land on their own.
    if (run.automatic && sincePeak >= run.profile.autoPeakHoldMs) {
      this.release()
    }
  }

  // One soft exposure lift at the peak: +15% over 250ms, then back. Never more
  // than a single pulse per run.
  private exposureAt(run: Run, now: number) {
    if (run.reduced || !run.peaked) return 0
    const sincePeak = now - (run.startedAt + run.profile.peakMs)
    if (sincePeak < 0 || sincePeak > PEAK_FLASH_MS) return 0
    return PEAK_FLASH_LIFT * Math.sin((sincePeak / PEAK_FLASH_MS) * Math.PI)
  }

  private advanceSkyClock(
    sky: SkyState,
    seconds: number,
    omega: number,
    reduced: boolean,
  ) {
    if (reduced) return
    sky.time += seconds
    sky.flow += seconds * (0.015 + omega * 0.045)
    sky.orbit += seconds * (0.22 + omega * 0.11)
  }

  private applyFade(run: Run, now: number): 'none' | 'running' | 'done-out' {
    const fade = run.fade
    if (!fade) return 'none'
    const t = Math.min(1, (now - fade.start) / fade.duration)
    const eased = t * t * (3 - 2 * t)
    run.sky.intensity = fade.from + (fade.to - fade.from) * eased
    if (fade.to === 0) {
      // Colour and particles leave with the sky.
      run.sky.color = Math.min(run.sky.color, 1 - eased)
      run.sky.particles = Math.min(run.sky.particles, 1 - eased)
      run.sky.rim *= 1 - eased
    }
    if (t >= 1) {
      run.fade = null
      return fade.to === 0 ? 'done-out' : 'none'
    }
    return 'running'
  }

  private finishRun(run: Run) {
    if (this.run !== run) return
    this.teardown(false)
    this.phase = 'idle'
    this.emit()
    this.stopLoopIfIdle()
  }

  private teardown(resetStreak: boolean) {
    const port = this.port
    const run = this.run
    if (run) {
      run.whoosh?.stop()
      run.whoosh = null
      this.deps.onCue?.('end', run.tier)
      port?.cancelLanding()
      port?.stopAutoSpin(LANDING_TAU_MS)
      port?.setCameraPull(0, LANDING_PULL_FREQ, LANDING_PULL_ZETA)
      port?.setSkyState(null)
    }
    this.run = null
    this.presented = null
    if (resetStreak) this.streak = EMPTY_STREAK
    if (this.phase !== 'armed') this.phase = 'idle'
    if (this.frameId && this.phase === 'idle') {
      this.deps.caf(this.frameId)
      this.frameId = 0
    }
  }

  dispose() {
    this.teardown(true)
    this.press = null
    this.phase = 'idle'
    if (this.frameId) this.deps.caf(this.frameId)
    this.frameId = 0
    this.emit()
  }
}
