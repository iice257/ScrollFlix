import { describe, expect, it } from 'vitest'
import { createLayerPool } from './layer-pool'

describe('layer pool', () => {
  it('hands out distinct layers until full', () => {
    const pool = createLayerPool(3)
    const layers = ['a', 'b', 'c'].map((key, at) => pool.acquire(key, at).layer)
    expect(new Set(layers).size).toBe(3)
    expect(pool.size).toBe(3)
  })

  it('evicts least recently visible', () => {
    const pool = createLayerPool(2)
    const a = pool.acquire('a', 1).layer
    pool.acquire('b', 2)
    const taken = pool.acquire('c', 3)
    expect(taken.evicted).toBe('a')
    expect(taken.layer).toBe(a)
    expect(pool.layerOf('a')).toBeNull()
  })

  it('touch protects', () => {
    const pool = createLayerPool(2)
    pool.acquire('a', 1)
    pool.acquire('b', 2)
    pool.touch('a', 5)
    expect(pool.acquire('c', 6).evicted).toBe('b')
    expect(pool.layerOf('a')).not.toBeNull()
  })

  it('release frees layer', () => {
    const pool = createLayerPool(1)
    const a = pool.acquire('a', 1).layer
    pool.release('a')
    const b = pool.acquire('b', 2)
    expect(b.evicted).toBeNull()
    expect(b.layer).toBe(a)
  })

  it('reuses the layer a key already holds', () => {
    const pool = createLayerPool(2)
    const first = pool.acquire('a', 1)
    expect(pool.acquire('a', 2)).toEqual({ layer: first.layer, evicted: null })
    expect(pool.size).toBe(1)
  })

  it('a zero-capacity pool gives nothing', () => {
    expect(createLayerPool(0).acquire('a', 1).layer).toBe(-1)
  })
})
