import { describe, expect, it, vi } from 'vitest'
import { type MoodRunStart, paletteFromAccents } from './mood-run'
import {
  type ControllerDeps,
  ShuffleProController,
  type ShuffleProPort,
} from './shuffle-pro-controller'
import { KEY_ROLL_OMEGA, STANDARD_PROFILE } from './shuffle-pro-logic'
import type { SkyState } from './sky-pass'

const setup = (
  overrides: Partial<ControllerDeps> = {},
  options: { found?: Record<string, number> } = {},
) => {
  let time = 1000
  let nextFrame = 1
  const frames = new Map<number, () => void>()
  const calls: string[] = []
  const recorded: string[] = []
  const recordedMood: string[] = []
  let omega = 0
  let sky: SkyState | null = null
  let landOnArrive: (() => void) | null = null
  let settleArrive: (() => void) | null = null

  const port: ShuffleProPort = {
    getCameraRatio: () => 1,
    getCameraRest: () => 3,
    startAutoSpin: (_axis, w) => {
      calls.push('startAutoSpin')
      omega = w
    },
    setAutoSpin: (_axis, w) => {
      omega = w
    },
    stopAutoSpin: () => {
      calls.push('stopAutoSpin')
    },
    getAngularSpeed: () => omega,
    setCameraPull: () => {},
    kickCamera: () => {
      calls.push('kick')
    },
    setSkyState: (state) => {
      sky = state
      calls.push(state ? 'sky:on' : 'sky:off')
    },
    prewarm: () => {
      calls.push('prewarm')
    },
    cancelPrewarm: () => {
      calls.push('cancelPrewarm')
    },
    landOn: (id, onArrive) => {
      calls.push(`landOn:${id}`)
      landOnArrive = onArrive
    },
    settleTo: (id, ms, onArrive) => {
      calls.push(`settleTo:${id}:${ms}`)
      settleArrive = onArrive
    },
    cancelLanding: () => {
      calls.push('cancelLanding')
    },
    setStatsEnabled: () => {},
    getFrameStats: () => ({ average: 16.7, p95: 18 }),
    getSkyStats: () => ({
      qualityLevel: 'full',
      drawCount: 0,
      cameraZ: 0,
      pull: 0,
      kick: 0,
    }),
  }

  const whoosh = {
    update: vi.fn(),
    fadeOut: vi.fn(),
    stop: vi.fn(),
  }

  const deps: ControllerDeps = {
    now: () => time,
    random: () => 0.5,
    raf: (callback) => {
      const id = nextFrame++
      frames.set(id, () => callback(time))
      return id
    },
    caf: (id) => {
      frames.delete(id)
    },
    getTheme: () => 'dark',
    isImmersive: () => false,
    isReducedMotion: () => false,
    getFound: () => options.found ?? {},
    recordRun: (tier) => recorded.push(tier),
    recordMoodRun: (path) => recordedMood.push(path),
    createWhoosh: () => whoosh,
    pickTarget: () => 'target-1',
    prepare: () => {
      calls.push('prepare')
    },
    vibrate: (pattern) => {
      calls.push(`vibrate:${JSON.stringify(pattern)}`)
    },
    ...overrides,
  }

  const controller = new ShuffleProController(deps)
  controller.attachPort(port)

  // Advances the clock in 16ms steps, running every queued frame.
  const advance = (ms: number) => {
    const end = time + ms
    while (time < end) {
      time += Math.min(16, end - time)
      const queued = [...frames.entries()]
      frames.clear()
      for (const [, run] of queued) run()
    }
  }

  return {
    controller,
    advance,
    calls,
    recorded,
    recordedMood,
    whoosh,
    setOmega: (value: number) => {
      omega = value
    },
    arriveLandOn: () => landOnArrive?.(),
    arriveSettle: () => settleArrive?.(),
    getSky: () => sky,
    getOmega: () => omega,
  }
}

const hold = (h: ReturnType<typeof setup>, ms: number, moved = 0) => {
  const session = h.controller.pressStart({ nx: 0.5, ny: 0.5 })
  if (session === 'consumed' || session === null) throw new Error('no press')
  h.controller.pressMove(moved, 0, 0)
  h.advance(ms)
  return session
}

describe('ShuffleProController: holding', () => {
  it('does nothing for a press that ends before 3s', () => {
    const h = setup()
    hold(h, 2900)
    expect(h.controller.getSnapshot().phase).toBe('armed')
    expect(h.controller.pressRelease()).toBe(false)
    expect(h.controller.getSnapshot().phase).toBe('idle')
    expect(h.calls).not.toContain('startAutoSpin')
  })

  it('starts a Frost run after 3s held still', () => {
    const h = setup()
    const session = hold(h, 3100)
    expect(session.triggered).toBe(true)
    const snapshot = h.controller.getSnapshot()
    expect(snapshot.phase).toBe('windup')
    expect(snapshot.tier).toBe('frost')
    expect(h.calls).toContain('startAutoSpin')
    expect(h.calls).toContain('kick')
    expect(h.calls).toContain('prepare')
    expect(h.calls).toContain('vibrate:12')
    expect(h.getSky()?.tier).toBe('frost')
  })

  it('needs 6s when the pointer moved', () => {
    const h = setup()
    hold(h, 4000, 80)
    expect(h.controller.getSnapshot().phase).toBe('armed')
    h.advance(2100)
    expect(h.controller.getSnapshot().phase).toBe('windup')
  })

  it('counts a finger that drifted 20px as held still, but not a mouse', () => {
    const touch = setup()
    const session = touch.controller.pressStart({
      nx: 0.5,
      ny: 0.5,
      pointerType: 'touch',
    })
    if (session === 'consumed' || session === null) throw new Error('no press')
    touch.controller.pressMove(20, 0, 0)
    touch.advance(3100)
    expect(touch.controller.getSnapshot().phase).toBe('windup')

    const mouse = setup()
    mouse.controller.pressStart({ nx: 0.5, ny: 0.5, pointerType: 'mouse' })
    mouse.controller.pressMove(20, 0, 0)
    mouse.advance(3100)
    expect(mouse.controller.getSnapshot().phase).toBe('armed')
  })

  it('uses the immersive thresholds and starts Jade', () => {
    const h = setup({ isImmersive: () => true })
    hold(h, 3100)
    const snapshot = h.controller.getSnapshot()
    expect(snapshot.phase).toBe('windup')
    expect(snapshot.tier).toBe('jade')
  })

  it('upgrades the run to Gold once all three paths were found', () => {
    const h = setup({}, { found: { frost: 1, amethyst: 1, jade: 1 } })
    hold(h, 3100)
    expect(h.controller.getSnapshot().tier).toBe('gold')
  })

  it('reaches the peak 5s after the trigger', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(4800)
    expect(h.controller.getSnapshot().phase).toBe('windup')
    h.advance(400)
    const snapshot = h.controller.getSnapshot()
    expect(snapshot.phase).toBe('peak')
    expect(snapshot.announcement).toBe('Release to reveal your pick')
    expect(h.calls).toContain('vibrate:[20,40,20]')
  })

  it('accelerates the spin and reveals the sky as the run builds', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(1000)
    const early = h.getOmega()
    h.advance(2500)
    expect(h.getOmega()).toBeGreaterThan(early)
    expect(h.getSky()?.intensity).toBeGreaterThan(0.9)
    h.advance(2000)
    expect(h.getOmega()).toBeGreaterThan(6.6)
  })
})

const holdKey = (h: ReturnType<typeof setup>, ms: number) => {
  const session = h.controller.pressStart({ nx: 0.5, ny: 0.5, source: 'key' })
  if (session === 'consumed' || session === null) throw new Error('no press')
  h.advance(ms)
  return session
}

describe('ShuffleProController: holding Space', () => {
  it('leaves a tap alone: no roll, and the release is a plain shuffle', () => {
    const h = setup()
    holdKey(h, 200)
    expect(h.calls).not.toContain('startAutoSpin')
    expect(h.controller.pressRelease()).toBe(false)
    expect(h.controller.getSnapshot().phase).toBe('idle')
  })

  it('rolls the globe at the regular shuffle speed once held past 250ms', () => {
    const h = setup()
    holdKey(h, 240)
    expect(h.calls).not.toContain('startAutoSpin')
    h.advance(40)
    expect(h.calls.filter((c) => c === 'startAutoSpin')).toHaveLength(1)
    expect(h.getOmega()).toBe(KEY_ROLL_OMEGA)
    expect(h.controller.getSnapshot().phase).toBe('armed')
  })

  it('keeps rolling at the same speed and never starts Shuffle Pro early', () => {
    const h = setup()
    holdKey(h, 9900)
    expect(h.getOmega()).toBe(KEY_ROLL_OMEGA)
    expect(h.controller.getSnapshot().phase).toBe('armed')
    expect(h.calls).not.toContain('sky:on')
    expect(h.calls.filter((c) => c === 'startAutoSpin')).toHaveLength(1)
  })

  it('lets the roll go on release and hands the landing to a shuffle', () => {
    const h = setup()
    holdKey(h, 3000)
    expect(h.controller.pressRelease()).toBe(false)
    expect(h.calls).toContain('stopAutoSpin')
    expect(h.controller.getSnapshot().phase).toBe('idle')
    expect(h.calls).not.toContain('sky:on')
  })

  it('starts Shuffle Pro after 10s without the globe slowing down', () => {
    const h = setup()
    const session = holdKey(h, 10100)
    expect(session.triggered).toBe(true)
    expect(h.controller.getSnapshot().phase).toBe('windup')
    expect(h.controller.getSnapshot().tier).toBe('frost')
    expect(h.getOmega()).toBeGreaterThanOrEqual(KEY_ROLL_OMEGA)
    h.advance(1000)
    expect(h.getOmega()).toBeGreaterThanOrEqual(KEY_ROLL_OMEGA)
    h.advance(4000)
    expect(h.getOmega()).toBeGreaterThan(KEY_ROLL_OMEGA * 1.5)
  })

  it('starts Shuffle Pro after 6s when immersive', () => {
    const h = setup({ isImmersive: () => true })
    holdKey(h, 6100)
    expect(h.controller.getSnapshot().phase).toBe('windup')
    expect(h.controller.getSnapshot().tier).toBe('jade')
  })

  it('does not roll for reduced motion', () => {
    const h = setup({ isReducedMotion: () => true })
    holdKey(h, 3000)
    expect(h.calls).not.toContain('startAutoSpin')
    expect(h.controller.pressRelease()).toBe(false)
    expect(h.calls).not.toContain('stopAutoSpin')
  })
})

const ALL_FOUND = { frost: 1, amethyst: 1, jade: 1, gold: 1 }

describe('ShuffleProController: found paths', () => {
  it('still starts a held Frost run once Frost is found', () => {
    const h = setup({}, { found: { frost: 1 } })
    hold(h, 3100)
    expect(h.controller.getSnapshot().phase).toBe('windup')
    expect(h.controller.getSnapshot().tier).toBe('frost')
    expect(h.calls).toContain('prewarm')
  })

  it('starts a held run with every path found and repeats off', () => {
    for (const immersive of [false, true]) {
      // The 10% gold-after-found roll misses, so the base tier plays.
      const h = setup(
        { isImmersive: () => immersive, random: () => 0.99 },
        { found: ALL_FOUND },
      )
      hold(h, 3100)
      expect(h.controller.getSnapshot().phase).toBe('windup')
      expect(h.controller.getSnapshot().tier).toBe(immersive ? 'jade' : 'frost')
    }
    // And when the roll wins it is Gold, which is found too, and still plays.
    const gold = setup({ random: () => 0 }, { found: ALL_FOUND })
    hold(gold, 3100)
    expect(gold.controller.getSnapshot().tier).toBe('gold')
  })

  it('records a repeat hold against the path that was already found', () => {
    const h = setup({}, { found: { frost: 1 } })
    hold(h, 3100)
    h.advance(5300)
    h.controller.pressRelease()
    h.setOmega(1)
    h.advance(50)
    h.arriveLandOn()
    expect(h.recorded).toEqual(['frost'])
  })

  it('starts it for a found path when repeats are on, too', () => {
    const h = setup({ getRepeatFound: () => true }, { found: { frost: 1 } })
    hold(h, 3100)
    expect(h.controller.getSnapshot().phase).toBe('windup')
  })

  it('starts a Space hold for a found path after 10s', () => {
    const h = setup({}, { found: { frost: 1 } })
    holdKey(h, 9900)
    expect(h.controller.getSnapshot().phase).toBe('armed')
    expect(h.getOmega()).toBe(KEY_ROLL_OMEGA)
    h.advance(300)
    expect(h.controller.getSnapshot().phase).toBe('windup')
  })

  it('still stops every streak trigger when all four paths are found', () => {
    const h = setup({ random: () => 0.99 }, { found: ALL_FOUND })
    const triggers: (string | null)[] = []
    for (let i = 0; i < 5; i += 1) {
      triggers.push(h.controller.noteAction({ type: 'bigSpin' }))
    }
    expect(triggers.every((trigger) => trigger === null)).toBe(true)
    // The streak started over rather than waiting to fire.
    expect(h.controller.getStreak().streak).toBe(0)
    const amethyst = setup({ random: () => 0 }, { found: ALL_FOUND })
    let last: string | null = null
    for (let i = 0; i < 10; i += 1) {
      last = amethyst.controller.noteAction({ type: 'shuffle' })
    }
    expect(last).toBeNull()
  })

  it('swallows a streak trigger for a found path and starts the streak over', () => {
    const h = setup({ random: () => 0 }, { found: { amethyst: 1 } })
    let trigger: string | null = null
    for (let i = 0; i < 10; i += 1) {
      trigger = h.controller.noteAction({ type: 'shuffle' })
    }
    expect(trigger).toBeNull()
    expect(h.controller.getStreak().streak).toBe(0)
  })

  it('still hands a streak trigger over for a path not found yet', () => {
    const h = setup({ random: () => 0 }, { found: { frost: 1 } })
    let trigger: string | null = null
    for (let i = 0; i < 10; i += 1) {
      trigger = h.controller.noteAction({ type: 'shuffle' })
    }
    expect(trigger).toBe('amethyst')
  })
})

describe('ShuffleProController: demo mode', () => {
  const demo = { getDemoMode: () => true }

  it('lets a streak trigger through for a path that was found', () => {
    const h = setup({ ...demo, random: () => 0.99 }, { found: ALL_FOUND })
    let trigger: string | null = null
    for (let i = 0; i < 5; i += 1) {
      trigger = h.controller.noteAction({ type: 'bigSpin' })
    }
    expect(trigger).toBe('frost')
  })

  it('makes the tenth shuffle Amethyst, whatever the dice say', () => {
    const h = setup({ ...demo, random: () => 0.99 })
    const triggers: (string | null)[] = []
    for (let i = 0; i < 10; i += 1) {
      triggers.push(h.controller.noteAction({ type: 'shuffle' }))
    }
    expect(triggers.slice(0, 9).every((trigger) => trigger === null)).toBe(true)
    expect(triggers[9]).toBe('amethyst')
  })

  it('plays the base tier: no Gold unlock, no golden hour', () => {
    const h = setup(
      { ...demo, random: () => 0, isGoldenHour: () => true },
      { found: { frost: 1, amethyst: 1, jade: 1 } },
    )
    hold(h, 3100)
    expect(h.controller.getSnapshot().tier).toBe('frost')
    const auto = setup(
      { ...demo, random: () => 0, isGoldenHour: () => true },
      { found: ALL_FOUND },
    )
    auto.controller.startAutomatic('amethyst', 'target-1')
    expect(auto.controller.getSnapshot().tier).toBe('amethyst')
  })

  it('does not change a release into a silent run', () => {
    const h = setup({ ...demo, random: () => 0.99 })
    for (let i = 0; i < 9; i += 1) h.controller.noteAction({ type: 'shuffle' })
    expect(h.controller.getStreak().streak).toBe(9)
    hold(h, 3100)
    h.controller.pressRelease()
    // Released before the peak: one ordinary shuffle, which never starts a run.
    expect(h.controller.getStreak().streak).toBe(10)
  })

  it('leaves normal mode alone when it is off', () => {
    const h = setup({ getDemoMode: () => false, random: () => 0.99 })
    const triggers: (string | null)[] = []
    for (let i = 0; i < 10; i += 1) {
      triggers.push(h.controller.noteAction({ type: 'shuffle' }))
    }
    expect(triggers.every((trigger) => trigger === null)).toBe(true)
  })
})

describe('ShuffleProController: streak updates', () => {
  it('tells subscribers whenever the counters change, not on neutral events', () => {
    const h = setup()
    const listener = vi.fn()
    const unsubscribe = h.controller.subscribeStreak(listener)
    h.controller.noteAction({ type: 'shuffle' })
    h.controller.noteAction({ type: 'bigSpin' })
    expect(listener).toHaveBeenCalledTimes(2)
    h.controller.noteAction({ type: 'neutral' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(h.controller.getStreak()).toEqual({ streak: 2, bigSpinRun: 1 })
    h.controller.noteAction({ type: 'break' })
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
    h.controller.noteAction({ type: 'shuffle' })
    expect(listener).toHaveBeenCalledTimes(3)
  })
})

describe('ShuffleProController: hold ring', () => {
  const press = (
    h: ReturnType<typeof setup>,
    info: { pointerType?: string; nx?: number; ny?: number } = {},
  ) => {
    const session = h.controller.pressStart({
      nx: info.nx ?? 0.3,
      ny: info.ny ?? 0.6,
      pointerType: info.pointerType,
    })
    if (session === 'consumed' || session === null) throw new Error('no press')
    return session
  }

  it('has no progress before 1.5s, then climbs to 1 at the trigger', () => {
    const h = setup()
    press(h)
    h.advance(1400)
    expect(h.controller.getHoldProgress()).toBeNull()
    h.advance(100)
    expect(h.controller.getHoldProgress()).toBeCloseTo(0, 1)
    h.advance(750)
    expect(h.controller.getHoldProgress()).toBeCloseTo(0.5, 1)
    h.advance(700)
    expect(h.controller.getHoldProgress()).toBeGreaterThan(0.95)
    h.advance(100)
    // The run has started: nothing left to fill.
    expect(h.controller.getHoldProgress()).toBeNull()
  })

  it('announces the ring once when it appears and once when it goes', () => {
    const h = setup()
    const seen: unknown[] = []
    h.controller.subscribeHold((ring) => seen.push(ring))
    press(h, { nx: 0.3, ny: 0.6 })
    h.advance(1400)
    expect(seen).toEqual([])
    h.advance(300)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ nx: 0.3, ny: 0.6, totalMs: 1500 })
    h.advance(1000)
    // Not once per frame.
    expect(seen).toHaveLength(1)
    h.controller.pressRelease()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBeNull()
  })

  it('goes when the run begins, and for a press that never showed it', () => {
    const h = setup()
    const seen: unknown[] = []
    h.controller.subscribeHold((ring) => seen.push(ring))
    press(h)
    h.advance(3100)
    expect(h.controller.getSnapshot().phase).toBe('windup')
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBeNull()

    const early = setup()
    const earlySeen: unknown[] = []
    early.controller.subscribeHold((ring) => earlySeen.push(ring))
    press(early)
    early.advance(900)
    early.controller.pressRelease()
    expect(earlySeen).toEqual([])
  })

  it('goes when the pointer wanders off, with a touch allowance of 24px', () => {
    const mouse = setup()
    const seen: unknown[] = []
    mouse.controller.subscribeHold((ring) => seen.push(ring))
    press(mouse)
    mouse.advance(1700)
    expect(seen).toHaveLength(1)
    mouse.controller.pressMove(12, 5, 5)
    mouse.advance(40)
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBeNull()
    expect(mouse.controller.getHoldProgress()).toBeNull()

    const touch = setup()
    press(touch, { pointerType: 'touch' })
    touch.advance(1700)
    touch.controller.pressMove(12, 5, 5)
    touch.advance(40)
    expect(touch.controller.getHoldProgress()).not.toBeNull()
  })

  it('never shows for a held Space', () => {
    const h = setup()
    const seen: unknown[] = []
    h.controller.subscribeHold((ring) => seen.push(ring))
    holdKey(h, 4000)
    expect(seen).toEqual([])
    expect(h.controller.getHoldProgress()).toBeNull()
  })

  it('shows for a found path, too', () => {
    const h = setup({}, { found: ALL_FOUND })
    press(h)
    h.advance(2000)
    expect(h.controller.getHoldProgress()).not.toBeNull()
  })

  it('stops announcing once unsubscribed', () => {
    const h = setup()
    const listener = vi.fn()
    const unsubscribe = h.controller.subscribeHold(listener)
    unsubscribe()
    press(h)
    h.advance(2000)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('ShuffleProController: warming up', () => {
  it('warms the effect up once a hold has lasted 1.5s, not before', () => {
    const h = setup()
    hold(h, 1400)
    expect(h.calls).not.toContain('prewarm')
    h.advance(200)
    expect(h.calls.filter((call) => call === 'prewarm')).toHaveLength(1)
  })

  it('tells the page which tier the hold is heading for', () => {
    const prewarmTier = vi.fn()
    const h = setup(
      { prewarmTier },
      { found: { frost: 1, amethyst: 1, jade: 1 } },
    )
    hold(h, 1700)
    expect(prewarmTier).toHaveBeenCalledWith('gold')
  })

  it('cancels the warm-up when the hold is let go early', () => {
    const prewarmTier = vi.fn()
    const h = setup({ prewarmTier })
    hold(h, 2500)
    h.controller.pressRelease()
    expect(h.calls).toContain('cancelPrewarm')
    expect(prewarmTier).toHaveBeenLastCalledWith(null)
  })

  it('does not warm anything up for a plain click', () => {
    const h = setup()
    hold(h, 120)
    h.controller.pressRelease()
    expect(h.calls).not.toContain('prewarm')
    expect(h.calls).not.toContain('cancelPrewarm')
  })

  it('warms up one action before a streak would start a run, once', () => {
    const h = setup()
    for (let i = 0; i < 8; i += 1) h.controller.noteAction({ type: 'shuffle' })
    expect(h.calls).not.toContain('prewarm')
    h.controller.noteAction({ type: 'shuffle' })
    h.controller.noteAction({ type: 'neutral' })
    expect(h.calls.filter((call) => call === 'prewarm')).toHaveLength(1)
  })

  it('cancels a streak warm-up when the streak breaks', () => {
    const h = setup()
    for (let i = 0; i < 9; i += 1) h.controller.noteAction({ type: 'shuffle' })
    h.controller.noteAction({ type: 'break' })
    expect(h.calls).toContain('cancelPrewarm')
  })
})

describe('ShuffleProController: releasing', () => {
  it('lands premium after releasing past the peak', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(5300)
    expect(h.controller.getSnapshot().phase).toBe('peak')
    expect(h.controller.pressRelease()).toBe(true)
    expect(h.controller.getSnapshot().phase).toBe('landing')
    expect(h.calls).toContain('stopAutoSpin')
    // Still spinning fast: the snap hasn't taken over yet.
    h.advance(100)
    expect(h.calls.some((c) => c.startsWith('landOn'))).toBe(false)
    h.setOmega(1)
    h.advance(50)
    expect(h.calls).toContain('landOn:target-1')
    h.arriveLandOn()
    const snapshot = h.controller.getSnapshot()
    expect(snapshot.phase).toBe('presented')
    expect(snapshot.presented).toEqual({
      movieId: 'target-1',
      tier: 'frost',
      mood: null,
    })
    expect(h.recorded).toEqual(['frost'])
    // The sky holds at 60% behind the card, then fades when it closes.
    h.advance(1200)
    expect(h.getSky()?.intensity).toBeCloseTo(0.6, 1)
    h.controller.cardClosed()
    expect(h.controller.getSnapshot().presented).toBeNull()
    h.advance(800)
    expect(h.controller.getSnapshot().phase).toBe('idle')
    expect(h.getSky()).toBeNull()
  })

  it('treats a release before the peak as a normal shuffle', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(2000)
    expect(h.controller.pressRelease()).toBe(true)
    h.setOmega(0.5)
    h.advance(50)
    expect(h.calls).toContain('landOn:target-1')
    h.advance(600)
    // The sky is already gone, but the landing carries on to the card.
    expect(h.getSky()).toBeNull()
    h.arriveLandOn()
    expect(h.recorded).toEqual([])
    expect(h.controller.getSnapshot().presented).toBeNull()
    h.advance(100)
    expect(h.controller.getSnapshot().phase).toBe('idle')
    expect(h.controller.getStreak().streak).toBe(1)
  })

  it('never lands before the spin has slowed below 1.2 rad/s', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(5300)
    h.controller.pressRelease()
    h.setOmega(3)
    h.advance(1000)
    expect(h.calls.some((c) => c.startsWith('landOn'))).toBe(false)
    h.setOmega(1.1)
    h.advance(32)
    expect(h.calls.some((c) => c.startsWith('landOn'))).toBe(true)
  })

  it('lands on its own if the spin never slows (watchdog)', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(5300)
    h.controller.pressRelease()
    h.setOmega(5)
    h.advance(2800)
    expect(h.calls.some((c) => c.startsWith('landOn'))).toBe(true)
  })
})

describe('ShuffleProController: skip and abort', () => {
  it('skips a hold that has not peaked into a normal card within 300ms', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(2500)
    expect(h.controller.getSnapshot().canSkip).toBe(true)
    h.controller.skip()
    expect(h.calls).toContain('settleTo:target-1:300')
    h.arriveSettle()
    expect(h.recorded).toEqual([])
    expect(h.controller.getSnapshot().presented).toBeNull()
  })

  it('skips a hold past the peak into a premium card', () => {
    const h = setup()
    hold(h, 3100)
    h.advance(5300)
    h.controller.skip()
    h.arriveSettle()
    expect(h.controller.getSnapshot().presented?.tier).toBe('frost')
    expect(h.recorded).toEqual(['frost'])
  })

  it('skips an automatic run into a premium card even during the wind-up', () => {
    const h = setup()
    h.controller.startAutomatic('frost', 'auto-target')
    h.advance(1500)
    expect(h.controller.getSnapshot().phase).toBe('windup')
    h.controller.skip()
    expect(h.calls).toContain('settleTo:auto-target:300')
    h.arriveSettle()
    expect(h.controller.getSnapshot().presented).toEqual({
      movieId: 'auto-target',
      tier: 'frost',
      mood: null,
    })
  })

  it('skips again from the landing', () => {
    const h = setup()
    h.controller.startAutomatic('frost', 'auto-target')
    h.advance(5000 + 1700 + 200)
    expect(h.controller.getSnapshot().phase).toBe('landing')
    h.controller.skip()
    expect(h.calls).toContain('settleTo:auto-target:300')
  })

  it('treats a globe tap during an automatic run as Skip', () => {
    const h = setup()
    h.controller.startAutomatic('frost', 'auto-target')
    h.advance(2000)
    expect(h.controller.pressStart({ nx: 0.4, ny: 0.4 })).toBe('consumed')
    expect(h.calls).toContain('settleTo:auto-target:300')
  })

  it('aborts on Esc: no card, sky fades, streak broken', () => {
    const h = setup()
    h.controller.noteAction({ type: 'shuffle' })
    hold(h, 3100)
    h.advance(3000)
    expect(h.controller.canAbort()).toBe(true)
    h.controller.abort()
    expect(h.controller.getSnapshot().phase).toBe('aborting')
    expect(h.calls.some((c) => c.startsWith('landOn'))).toBe(false)
    expect(h.calls.some((c) => c.startsWith('settleTo'))).toBe(false)
    h.advance(600)
    expect(h.controller.getSnapshot().phase).toBe('idle')
    expect(h.getSky()).toBeNull()
    expect(h.recorded).toEqual([])
    expect(h.controller.getStreak()).toEqual({ streak: 0, bigSpinRun: 0 })
  })

  it('consumes the release of a press whose run was aborted', () => {
    const h = setup()
    const session = hold(h, 3100)
    h.advance(1000)
    h.controller.abort()
    h.controller.pressRelease()
    expect(session.triggered).toBe(true)
  })
})

describe('ShuffleProController: automatic runs', () => {
  it('holds the peak briefly then lands on the chosen movie', () => {
    const h = setup()
    h.controller.startAutomatic('frost', 'auto-target')
    expect(h.controller.getSnapshot().phase).toBe('windup')
    h.advance(5100)
    expect(h.controller.getSnapshot().phase).toBe('peak')
    h.advance(1700)
    expect(h.controller.getSnapshot().phase).toBe('landing')
    h.setOmega(0.8)
    h.advance(50)
    expect(h.calls).toContain('landOn:auto-target')
    h.arriveLandOn()
    expect(h.controller.getSnapshot().presented?.movieId).toBe('auto-target')
  })

  it('resets both counters once the run ends', () => {
    const h = setup()
    for (let i = 0; i < 4; i += 1) h.controller.noteAction({ type: 'bigSpin' })
    const trigger = h.controller.noteAction({ type: 'bigSpin' })
    expect(trigger).toBe('frost')
    h.controller.startAutomatic(trigger ?? 'frost', 'auto-target')
    h.advance(5100 + 1700 + 100)
    h.setOmega(0.5)
    h.advance(50)
    h.arriveLandOn()
    expect(h.controller.getStreak()).toEqual({ streak: 0, bigSpinRun: 0 })
  })

  it('ignores streak actions while a run is active', () => {
    const h = setup()
    h.controller.startAutomatic('frost', 'auto-target')
    expect(h.controller.noteAction({ type: 'shuffle' })).toBeNull()
    expect(h.controller.getStreak()).toEqual({ streak: 0, bigSpinRun: 0 })
  })
})

describe('ShuffleProController: reduced motion', () => {
  it('never spins or pulls the camera back, but still reveals the sky', () => {
    const h = setup({ isReducedMotion: () => true })
    h.controller.startAutomatic('frost', 'auto-target')
    h.advance(3500)
    expect(h.calls).not.toContain('startAutoSpin')
    expect(h.calls).not.toContain('kick')
    const sky = h.getSky()
    expect(sky?.reduced).toBe(true)
    expect(sky?.intensity).toBeGreaterThan(0.9)
    expect(sky?.time).toBe(0)
    expect(sky?.flow).toBe(0)
  })
})

describe('ShuffleProController: subscription', () => {
  it('notifies subscribers with a stable snapshot between changes', () => {
    const h = setup()
    const listener = vi.fn()
    h.controller.subscribe(listener)
    const first = h.controller.getSnapshot()
    h.advance(200)
    expect(h.controller.getSnapshot()).toBe(first)
    h.controller.startAutomatic('frost', 'x')
    expect(listener).toHaveBeenCalled()
    expect(h.controller.getSnapshot()).not.toBe(first)
  })

  it('disposes cleanly: sky off, loop stopped', () => {
    const h = setup()
    h.controller.startAutomatic('frost', 'x')
    h.controller.dispose()
    expect(h.getSky()).toBeNull()
    expect(h.controller.getSnapshot().phase).toBe('idle')
  })

  describe('mood runs', () => {
    const start = (overrides: Partial<MoodRunStart> = {}): MoodRunStart => ({
      path: 'resonance',
      look: 'amethyst',
      palette: paletteFromAccents(['#a78bfa', '#ffd23f']),
      energy: 1,
      length: 0.5,
      density: 0.6,
      ...overrides,
    })

    it('runs in the mood colours and shortens with the length', () => {
      const h = setup()
      expect(h.controller.startMoodRun(start(), 'mood-target')).toBe(true)
      const sky = h.getSky()
      expect(sky?.tier).toBe('amethyst')
      expect(sky?.palette).toEqual(start().palette)
      expect(sky?.density).toBe(0.6)
      // Half the wind-up of a standard run: the peak lands at 2.5s, not 5s.
      h.advance(STANDARD_PROFILE.peakMs / 2 + 100)
      expect(h.controller.getSnapshot().phase).toBe('peak')
    })

    it('records the mood path, not a tier, and presents it', () => {
      const h = setup()
      h.controller.startMoodRun(start({ path: 'eclipse' }), 'mood-target')
      h.advance(1500)
      h.controller.skip()
      h.arriveSettle()
      expect(h.recordedMood).toEqual(['eclipse'])
      expect(h.recorded).toEqual([])
      const presented = h.controller.getSnapshot().presented
      expect(presented?.movieId).toBe('mood-target')
      expect(presented?.mood?.path).toBe('eclipse')
      expect(presented?.mood?.look).toBe('amethyst')
    })

    it('does not start while another run is going', () => {
      const h = setup()
      h.controller.startAutomatic('frost', 'x')
      expect(h.controller.startMoodRun(start(), 'y')).toBe(false)
    })

    it('leaves ordinary runs on the tier colours', () => {
      const h = setup()
      h.controller.startAutomatic('jade', 'x')
      expect(h.getSky()?.palette).toBeNull()
      expect(h.getSky()?.density).toBe(1)
    })

    it('warms the sky up only while idle', () => {
      const h = setup()
      h.controller.prewarm()
      expect(h.calls).toContain('prewarm')
    })
  })
})
