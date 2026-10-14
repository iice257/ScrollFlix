import { describe, expect, it } from 'vitest'
import { LEAN_LAYERS, leanTranslate, stagePosition } from './mood-lean'

describe('stagePosition', () => {
  it('runs from -1 at the start of the stage to 1 at the far edge', () => {
    expect(stagePosition(100, 100, 800)).toBe(-1)
    expect(stagePosition(500, 100, 800)).toBe(0)
    expect(stagePosition(900, 100, 800)).toBe(1)
  })

  it('never over-leans for a pointer outside the stage', () => {
    expect(stagePosition(-400, 100, 800)).toBe(-1)
    expect(stagePosition(5000, 100, 800)).toBe(1)
  })

  it('stays still while the stage has no size yet', () => {
    expect(stagePosition(300, 0, 0)).toBe(0)
  })
})

describe('leanTranslate', () => {
  it('moves a layer against the pointer by its reach', () => {
    expect(leanTranslate(-26, -16, 1, 1)).toBe('-26.00px -16.00px')
    expect(leanTranslate(-26, -16, -0.5, 0.25)).toBe('13.00px -4.00px')
  })

  it('rests at the origin when the pointer is centred', () => {
    expect(leanTranslate(-14, -9, 0, 0)).toBe('0.00px 0.00px')
  })
})

describe('LEAN_LAYERS', () => {
  it('leans the nearer layers further, and the iris towards the pointer', () => {
    const reach = Object.fromEntries(
      LEAN_LAYERS.map((layer) => [layer.selector, layer.reachX]),
    )
    expect(Math.abs(reach['.ms-near'])).toBeGreaterThan(
      Math.abs(reach['.ms-mid']),
    )
    expect(Math.abs(reach['.ms-mid'])).toBeGreaterThan(
      Math.abs(reach['.ms-far']),
    )
    expect(reach['.ms-iris']).toBeGreaterThan(0)
  })
})
