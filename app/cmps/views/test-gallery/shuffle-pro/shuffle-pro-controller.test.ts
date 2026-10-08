import { describe, expect, it, vi } from 'vitest'
import {
  type ControllerDeps,
  ShuffleProController,
  type ShuffleProPort,
} from './shuffle-pro-controller'
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
  it('does nothing for a press that ends before 5s', () => {
    const h = setup()
    hold(h, 4900)
    expect(h.controller.getSnapshot().phase).toBe('armed')
    expect(h.controller.pressRelease()).toBe(false)
    expect(h.controller.getSnapshot().phase).toBe('idle')
    expect(h.calls).not.toContain('startAutoSpin')
  })

  it('starts a Frost run after 5s held still', () => {
    const h = setup()
    const session = hold(h, 5100)
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

  it('needs 10s when the pointer moved', () => {
    const h = setup()
    hold(h, 6000, 80)
    expect(h.controller.getSnapshot().phase).toBe('armed')
    h.advance(4100)
    expect(h.controller.getSnapshot().phase).toBe('windup')
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
    hold(h, 5100)
    expect(h.controller.getSnapshot().tier).toBe('gold')
  })

  it('reaches the peak 5s after the trigger', () => {
    const h = setup()
    hold(h, 5100)
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
    hold(h, 5100)
    h.advance(1000)
    const early = h.getOmega()
    h.advance(2500)
    expect(h.getOmega()).toBeGreaterThan(early)
    expect(h.getSky()?.intensity).toBeGreaterThan(0.9)
    h.advance(2000)
    expect(h.getOmega()).toBeGreaterThan(6.6)
  })
})

describe('ShuffleProController: releasing', () => {
  it('lands premium after releasing past the peak', () => {
    const h = setup()
    hold(h, 5100)
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
    expect(snapshot.presented).toEqual({ movieId: 'target-1', tier: 'frost' })
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
    hold(h, 5100)
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
    hold(h, 5100)
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
    hold(h, 5100)
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
    hold(h, 5100)
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
    hold(h, 5100)
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
    hold(h, 5100)
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
    const session = hold(h, 5100)
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
})
