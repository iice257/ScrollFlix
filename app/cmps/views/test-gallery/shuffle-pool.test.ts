import { describe, expect, it } from 'vitest'
import { createShufflePool } from './shuffle-pool'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const drawFrom = (ids: string[]) => {
  let at = 0
  return () => ids[at++] ?? null
}

const allowAll = () => true

describe('shuffle pool', () => {
  it('fills to its size with distinct films and preloads each once', () => {
    const asked: string[] = []
    const pool = createShufflePool(async (id) => {
      asked.push(id)
    })
    pool.refill(drawFrom(['a', 'a', 'b', 'c', 'd']))
    expect(pool.peek().map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    expect(asked).toEqual(['a', 'b', 'c'])
  })

  it('lands only on candidates that have loaded while any have', async () => {
    const loads = new Map<string, ReturnType<typeof deferred>>()
    const pool = createShufflePool((id) => {
      const load = deferred()
      loads.set(id, load)
      return load.promise
    })
    pool.refill(drawFrom(['a', 'b', 'c']))
    loads.get('b')?.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(pool.take(null, allowAll, () => 0)).toBe('b')
    expect(pool.take(null, allowAll, () => 0.99)).not.toBe('b')
  })

  it('falls back to any candidate when none has loaded', () => {
    const pool = createShufflePool(() => new Promise(() => undefined))
    pool.refill(drawFrom(['a', 'b']))
    const id = pool.take(null, allowAll, () => 0)
    expect(['a', 'b']).toContain(id)
    expect(pool.peek()).toHaveLength(1)
  })

  it('never lands on the current film or one no longer allowed', async () => {
    const pool = createShufflePool(async () => undefined)
    pool.refill(drawFrom(['a', 'b', 'c']))
    await Promise.resolve()
    await Promise.resolve()
    const id = pool.take(
      'a',
      (candidate) => candidate !== 'b',
      () => 0,
    )
    expect(id).toBe('c')
    expect(pool.take('a', allowAll, () => 0)).toBeNull()
  })

  it('picks at random among the loaded candidates', async () => {
    const seen = new Set<string>()
    for (const roll of [0, 0.4, 0.8]) {
      const pool = createShufflePool(async () => undefined)
      pool.refill(drawFrom(['a', 'b', 'c']))
      await Promise.resolve()
      await Promise.resolve()
      seen.add(pool.take(null, allowAll, () => roll) ?? '')
    }
    expect(seen.size).toBe(3)
  })
})
