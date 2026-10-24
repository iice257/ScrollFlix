import { describe, expect, it } from 'vitest'
import {
  type MoodRunInputs,
  ODD_PAIRS,
  densityFor,
  eclipseHint,
  eclipseWorlds,
  isOddPair,
  notePick,
  planMoodRun,
  recordLanding,
  wandererReached,
} from './mood-runs'
import type { MoodFilter } from './mood-worlds'

const picksAt = (entries: Array<[MoodFilter, number]>) =>
  entries.reduce(
    (list, [id, at]) => notePick(list, id, at),
    [] as ReturnType<typeof notePick>,
  )

const base = (overrides: Partial<MoodRunInputs> = {}): MoodRunInputs => ({
  selected: ['fast'],
  time: 'movie90to120',
  filmCount: 300,
  picks: [],
  landings: {},
  found: {},
  ...overrides,
})

describe('odd pairs', () => {
  it('matches each pair in either order', () => {
    for (const [a, b] of ODD_PAIRS) {
      expect(isOddPair([a, b])).toBe(true)
      expect(isOddPair([b, a])).toBe(true)
    }
  })

  it('ignores single worlds and ordinary pairs', () => {
    expect(isOddPair(['dark'])).toBe(false)
    expect(isOddPair(['dark', 'weird'])).toBe(false)
    expect(isOddPair([])).toBe(false)
  })
})

describe('eclipse', () => {
  it('counts every selected world in a landing', () => {
    expect(recordLanding({ dark: 1 }, ['dark', 'funny'])).toEqual({
      dark: 2,
      funny: 1,
    })
  })

  it('needs one world in three landings', () => {
    expect(eclipseWorlds({ dark: 2, funny: 1 })).toEqual([])
    expect(eclipseWorlds({ dark: 3 })).toEqual(['dark'])
  })

  it('or two worlds in two landings each', () => {
    expect(eclipseWorlds({ dark: 2, funny: 1 })).toEqual([])
    expect(eclipseWorlds({ dark: 2, funny: 2 })).toEqual(['dark', 'funny'])
  })

  it('hints when a selected world is one landing away', () => {
    expect(eclipseHint({ dark: 2 }, ['dark'])).toBe('dark')
    expect(eclipseHint({ dark: 2 }, ['funny'])).toBeNull()
    expect(eclipseHint({ dark: 1 }, ['dark'])).toBeNull()
  })

  it('fires on the third landing and spends the counts', () => {
    const plan = planMoodRun(
      base({ selected: ['dark'], landings: { dark: 2, fast: 1 } }),
    )
    expect(plan.run?.path).toBe('eclipse')
    expect(plan.landings).toEqual({ fast: 1 })
  })

  it('leads with the world just picked', () => {
    const plan = planMoodRun(
      base({ selected: ['funny'], landings: { dark: 2, funny: 1 } }),
    )
    expect(plan.run?.path).toBe('eclipse')
    expect(plan.run?.look).toBe('amethyst')
  })

  it('stays quiet once found', () => {
    const found = { eclipse: { count: 1 } }
    const quiet = planMoodRun(
      base({ selected: ['dark'], landings: { dark: 2 }, found }),
    )
    expect(quiet.run).toBeNull()
    expect(quiet.landings).toEqual({ dark: 3 })
  })
})

describe('wanderer', () => {
  it('counts three worlds inside 10 seconds', () => {
    const picks = picksAt([
      ['fast', 0],
      ['dark', 4000],
      ['funny', 9000],
    ])
    expect(wandererReached(picks)).toBe(3)
  })

  it('does not count three slow picks', () => {
    const picks = picksAt([
      ['fast', 0],
      ['dark', 6000],
      ['funny', 12000],
    ])
    expect(wandererReached(picks)).toBeNull()
  })

  it('counts five worlds inside 20 seconds', () => {
    const picks = picksAt([
      ['fast', 0],
      ['dark', 4000],
      ['funny', 8000],
      ['romantic', 12000],
      ['weird', 19000],
    ])
    expect(wandererReached(picks)).toBe(5)
  })

  it('counts all six at any pace', () => {
    const ids: MoodFilter[] = [
      'fast',
      'dark',
      'funny',
      'romantic',
      'weird',
      'highRated',
    ]
    const picks = picksAt(ids.map((id, i) => [id, i * 60_000]))
    expect(wandererReached(picks)).toBe(6)
  })

  it('counts a world once however often it is picked', () => {
    const picks = picksAt([
      ['fast', 0],
      ['fast', 1000],
      ['dark', 2000],
      ['fast', 3000],
    ])
    expect(wandererReached(picks)).toBeNull()
  })

  it('builds a longer run for a bigger wander', () => {
    const quick = planMoodRun(
      base({
        selected: ['funny'],
        picks: picksAt([
          ['fast', 0],
          ['dark', 1000],
          ['funny', 2000],
        ]),
      }),
    )
    const full = planMoodRun(
      base({
        selected: ['funny'],
        picks: picksAt(
          (
            ['fast', 'dark', 'funny', 'romantic', 'weird', 'highRated'] as const
          ).map((id, i) => [id, i * 30_000] as [MoodFilter, number]),
        ),
      }),
    )
    expect(quick.run?.path).toBe('wanderer')
    expect(full.run?.path).toBe('wanderer')
    expect((full.run?.length ?? 0) > (quick.run?.length ?? 0)).toBe(true)
  })
})

describe('resolving a landing', () => {
  it('starts nothing for an ordinary landing', () => {
    const plan = planMoodRun(base())
    expect(plan.run).toBeNull()
    expect(plan.landings).toEqual({ fast: 1 })
  })

  it('starts a resonance run for an odd pair', () => {
    const plan = planMoodRun(base({ selected: ['dark', 'funny'] }))
    expect(plan.run?.path).toBe('resonance')
  })

  it('puts eclipse before resonance and keeps resonance for later', () => {
    const plan = planMoodRun(
      base({ selected: ['dark', 'funny'], landings: { dark: 2 } }),
    )
    expect(plan.run?.path).toBe('eclipse')
    const next = planMoodRun(
      base({ selected: ['dark', 'funny'], landings: plan.landings }),
    )
    expect(next.run?.path).toBe('resonance')
  })

  it('puts resonance before wanderer', () => {
    const plan = planMoodRun(
      base({
        selected: ['dark', 'funny'],
        picks: picksAt([
          ['fast', 0],
          ['dark', 1000],
          ['funny', 2000],
        ]),
      }),
    )
    expect(plan.run?.path).toBe('resonance')
  })

  it('falls through to a path that is still open', () => {
    const plan = planMoodRun(
      base({
        selected: ['dark', 'funny'],
        found: { resonance: { count: 1 } },
        picks: picksAt([
          ['fast', 0],
          ['dark', 1000],
          ['funny', 2000],
        ]),
      }),
    )
    expect(plan.run?.path).toBe('wanderer')
  })

  it('slows dark runs and speeds fast ones', () => {
    const dark = planMoodRun(base({ selected: ['funny', 'dark'] }))
    const fast = planMoodRun(base({ selected: ['romantic', 'fast'] }))
    expect(dark.run?.energy).toBeLessThan(1)
    expect(fast.run?.energy).toBeGreaterThan(1)
  })

  it('shortens a quick film run and lengthens a long one', () => {
    const short = planMoodRun(
      base({ selected: ['dark', 'funny'], time: 'movieUnder90' }),
    )
    const long = planMoodRun(
      base({ selected: ['dark', 'funny'], time: 'movieOver120' }),
    )
    expect((short.run?.length ?? 0) < (long.run?.length ?? 0)).toBe(true)
  })
})

describe('density', () => {
  it('grows with the number of films and stays in range', () => {
    expect(densityFor(0)).toBeGreaterThanOrEqual(0.4)
    expect(densityFor(50)).toBeLessThan(densityFor(500))
    expect(densityFor(1_000_000)).toBe(1)
  })
})
