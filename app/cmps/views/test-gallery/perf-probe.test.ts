import { describe, expect, it } from 'vitest'
import { createPerfProbe } from './perf-probe'

describe('perf probe', () => {
  it('percentiles', () => {
    const probe = createPerfProbe()
    for (let ms = 1; ms <= 100; ms += 1) probe.frame(ms)
    const stats = probe.stats()
    expect(stats.frames).toBe(100)
    expect(stats.p50).toBe(50)
    expect(stats.p95).toBe(95)
    expect(stats.p99).toBe(99)
  })

  it('reset clears', () => {
    const probe = createPerfProbe()
    probe.frame(10)
    probe.reset()
    expect(probe.stats()).toEqual({
      frames: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      longTasks: 0,
      workP95: 0,
    })
  })

  it('reports the p95 of work time', () => {
    const probe = createPerfProbe()
    for (let ms = 1; ms <= 100; ms += 1) probe.frame(16, ms / 10)
    expect(probe.stats().workP95).toBeCloseTo(9.5)
  })

  it('keeps only the most recent 1,200 frames', () => {
    const probe = createPerfProbe()
    for (let index = 0; index < 1_500; index += 1) probe.frame(100)
    for (let index = 0; index < 1_200; index += 1) probe.frame(5)
    const stats = probe.stats()
    expect(stats.frames).toBe(1_200)
    expect(stats.p99).toBe(5)
  })
})
