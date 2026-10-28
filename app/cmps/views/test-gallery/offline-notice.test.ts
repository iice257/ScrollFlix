import { describe, expect, it } from 'vitest'
import { describeGlobeLoad, readGlobeLoadedShare } from './offline-notice'

const root = (dataset: Record<string, string>) => {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  for (const [key, value] of Object.entries(dataset))
    canvas.dataset[key] = value
  host.append(canvas)
  return host
}

describe('readGlobeLoadedShare', () => {
  it('is the share of posters showing a picture', () => {
    expect(
      readGlobeLoadedShare(
        root({ picturesTotal: '200', picturesLoaded: '50' }),
      ),
    ).toBe(25)
    expect(
      readGlobeLoadedShare(root({ picturesTotal: '3', picturesLoaded: '1' })),
    ).toBe(33)
  })

  it('is null with no globe, and 0 before any poster', () => {
    expect(readGlobeLoadedShare(document.createElement('div'))).toBeNull()
    expect(readGlobeLoadedShare(root({ picturesTotal: '10' }))).toBe(0)
  })
})

describe('describeGlobeLoad', () => {
  it('says fully loaded only at 100', () => {
    expect(describeGlobeLoad(100)).toBe('Globe fully loaded')
    expect(describeGlobeLoad(99)).toBe('Globe 99% loaded')
    expect(describeGlobeLoad(null)).toBe('Globe ready')
  })
})
