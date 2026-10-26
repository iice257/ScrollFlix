import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShufflePreroll } from './shuffle-preroll'

const films = Array.from({ length: 50 }, (_, id) => ({ id }))

const setup = (entropyValue?: () => number) => {
  const calls: unknown[][] = []
  const preroll = createShufflePreroll({
    candidates: () => films,
    preload: (...args: unknown[]) => {
      calls.push(args)
    },
    entropy: entropyValue,
  })
  return { calls, preroll }
}

afterEach(() => vi.restoreAllMocks())

describe('shuffle preroll', () => {
  it('preloads the pick and two distinct decoys through one code path', () => {
    const { calls, preroll } = setup()
    preroll.prepare()
    expect(calls).toHaveLength(3)
    // Same call shape for all three: the film and nothing else.
    for (const args of calls) expect(args).toHaveLength(1)
    const ids = calls.map((args) => (args[0] as { id: number }).id)
    expect(new Set(ids).size).toBe(3)
  })

  it('hands back the pick once, and it is one of the three preloaded', () => {
    const { calls, preroll } = setup()
    preroll.prepare()
    const ids = calls.map((args) => (args[0] as { id: number }).id)
    const taken = preroll.take()
    expect(taken && ids.includes(taken.id)).toBe(true)
    expect(preroll.take()).toBeNull()
  })

  it('draws the pick and the decoys through the shuffle’s own chooser', () => {
    const calls: unknown[][] = []
    const heavy = films[7]
    let asked = 0
    const preroll = createShufflePreroll({
      candidates: () => films,
      preload: (...args: unknown[]) => {
        calls.push(args)
      },
      // A chooser that always leans to film 7 first, then falls back to random.
      choose: (pool, random) =>
        asked++ === 0 ? heavy : pool[Math.floor(random() * pool.length)],
    })
    preroll.prepare()
    expect(calls).toHaveLength(3)
    expect(new Set(calls.map((args) => args[0])).size).toBe(3)
    expect(calls.some((args) => args[0] === heavy)).toBe(true)
  })

  it('does not return a pick the filters no longer allow', () => {
    const { preroll } = setup()
    preroll.prepare()
    expect(preroll.take(() => false)).toBeNull()
  })

  it('never lets a decoy become the next pick', () => {
    const { calls, preroll } = setup()
    for (let round = 0; round < 40; round += 1) {
      calls.length = 0
      preroll.prepare()
      const preloaded = calls.map((args) => (args[0] as { id: number }).id)
      const pick = preroll.take()
      // The pick is always among the preloaded, decoys are the other two.
      expect(preloaded).toContain(pick?.id)
    }
  })

  it('puts the pick in every slot of the batch about equally often', () => {
    const slots = [0, 0, 0]
    for (let round = 0; round < 600; round += 1) {
      const { calls, preroll } = setup()
      preroll.prepare()
      const pick = preroll.take()
      const at = calls.findIndex(
        (args) => (args[0] as { id: number }).id === pick?.id,
      )
      slots[at] += 1
    }
    for (const count of slots) {
      expect(count).toBeGreaterThan(140)
      expect(count).toBeLessThan(260)
    }
  })

  it('uses a fresh seed every time', () => {
    const { calls, preroll } = setup()
    const firsts = new Set<number>()
    for (let round = 0; round < 30; round += 1) {
      calls.length = 0
      preroll.prepare()
      firsts.add(preroll.take()?.id ?? -1)
    }
    expect(firsts.size).toBeGreaterThan(10)
  })

  it('handles a pool smaller than three', () => {
    const calls: unknown[][] = []
    const preroll = createShufflePreroll({
      candidates: () => [films[0], films[1]],
      preload: (...args: unknown[]) => {
        calls.push(args)
      },
    })
    preroll.prepare()
    expect(calls).toHaveLength(2)
    expect(preroll.take()).not.toBeNull()
  })

  it('keeps a failing preload from throwing', () => {
    const preroll = createShufflePreroll({
      candidates: () => films,
      preload: () => Promise.reject(new Error('offline')),
    })
    expect(() => preroll.prepare()).not.toThrow()
  })

  it('exposes neither the seed nor the pick', () => {
    const before = new Set(Object.getOwnPropertyNames(globalThis))
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (name) => vi.spyOn(console, name),
    )
    const { preroll } = setup(() => 0x1234abcd)
    preroll.prepare()
    // Nothing added to window/global, nothing logged.
    expect(
      Object.getOwnPropertyNames(globalThis).filter((key) => !before.has(key)),
    ).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    // The handle holds only functions: no seed, no pick as a property.
    expect(Object.keys(preroll).sort()).toEqual(['discard', 'prepare', 'take'])
    for (const value of Object.values(preroll))
      expect(typeof value).toBe('function')
    const serialised = JSON.stringify(preroll)
    expect(serialised).toBe('{}')
  })
})
