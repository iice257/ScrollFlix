import { describe, expect, it } from 'vitest'
import { type LodPoster, planLod } from './lod-scheduler'

const poster = (
  index: number,
  overrides: Partial<LodPoster> = {},
): LodPoster => ({
  index,
  key: `k${index}`,
  visible: true,
  deviceWidthPx: 400,
  focusDistance: index / 100,
  ...overrides,
})

const base = {
  openedKey: null,
  midCapacity: 100,
  detailCapacity: 100,
}

describe('planLod', () => {
  it('no detail while fast', () => {
    const plan = planLod({
      ...base,
      posters: [poster(0), poster(1)],
      angularSpeed: 1,
    })
    expect(plan.detail).toEqual([])
    expect(plan.mid).toEqual(['k0', 'k1'])
  })

  it('no mid either when flinging', () => {
    const plan = planLod({
      ...base,
      posters: [poster(0)],
      angularSpeed: 4,
    })
    expect(plan).toEqual({ mid: [], detail: [] })
  })

  it('opened poster always gets detail', () => {
    const plan = planLod({
      ...base,
      posters: [poster(0), poster(1, { deviceWidthPx: 40 })],
      angularSpeed: 3,
      openedKey: 'k1',
    })
    expect(plan.detail).toEqual(['k1'])
  })

  it('mid ordered by focus distance', () => {
    const plan = planLod({
      ...base,
      posters: [
        poster(0, { focusDistance: 0.9 }),
        poster(1, { focusDistance: 0.1 }),
        poster(2, { focusDistance: 0.5 }),
      ],
      angularSpeed: 0,
    })
    expect(plan.mid).toEqual(['k1', 'k2', 'k0'])
    expect(plan.detail).toEqual(['k1', 'k2', 'k0'])
  })

  it('respects capacities', () => {
    const posters = Array.from({ length: 20 }, (_, at) => poster(at))
    const plan = planLod({
      ...base,
      posters,
      angularSpeed: 0,
      midCapacity: 5,
      detailCapacity: 2,
      openedKey: 'k9',
    })
    expect(plan.mid).toHaveLength(5)
    expect(plan.detail).toHaveLength(2)
    expect(plan.detail[0]).toBe('k9')
  })

  it('small posters stay base', () => {
    const at = (deviceWidthPx: number) =>
      planLod({
        ...base,
        posters: [poster(0, { deviceWidthPx })],
        angularSpeed: 0,
      })
    expect(at(100)).toEqual({ mid: [], detail: [] })
    expect(at(150)).toEqual({ mid: ['k0'], detail: [] })
    expect(at(300)).toEqual({ mid: ['k0'], detail: ['k0'] })
  })

  it('hidden posters get nothing', () => {
    const plan = planLod({
      ...base,
      posters: [poster(0, { visible: false })],
      angularSpeed: 0,
    })
    expect(plan).toEqual({ mid: [], detail: [] })
  })
})
