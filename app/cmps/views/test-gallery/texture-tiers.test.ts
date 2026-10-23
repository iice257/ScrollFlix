import { describe, expect, it } from 'vitest'
import {
  DESKTOP_BUDGET_BYTES,
  DESKTOP_GLOBE_COUNT,
  PHONE_BUDGET_BYTES,
  PHONE_GLOBE_COUNT,
  atlasLayout,
  estimateTextureBytes,
  fitTierConfig,
  mipChainBytes,
  tierConfig,
} from './texture-tiers'

const CAPS = { maxTextureSize: 16384, maxArrayLayers: 2048 }
const SMALL_CAPS = { maxTextureSize: 4096, maxArrayLayers: 256 }

describe('texture tiers', () => {
  it('base atlas cells are 2:3 with a gutter, in a near-square grid', () => {
    for (const desktop of [true, false]) {
      const config = tierConfig(desktop)
      const layout = atlasLayout(900, config)
      expect(config.baseWidth / config.baseHeight).toBeCloseTo(2 / 3, 5)
      expect(layout.cellWidth).toBe(config.baseWidth + config.gutter * 2)
      expect(layout.cellHeight).toBe(config.baseHeight + config.gutter * 2)
      expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(900)
      expect((layout.columns - 1) * layout.rows).toBeLessThan(900 + layout.rows)
      expect(layout.width / layout.height).toBeGreaterThan(0.8)
      expect(layout.width / layout.height).toBeLessThan(1.25)
    }
  })

  it('shrinks the atlas to the texture limit', () => {
    const config = tierConfig(true)
    const layout = atlasLayout(DESKTOP_GLOBE_COUNT, config, 2048)
    expect(layout.width).toBeLessThanOrEqual(2048)
    expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(
      DESKTOP_GLOBE_COUNT,
    )
  })

  it('memory estimate within budget', () => {
    const desktop = fitTierConfig(tierConfig(true), DESKTOP_GLOBE_COUNT, CAPS)
    const phone = fitTierConfig(tierConfig(false), PHONE_GLOBE_COUNT, CAPS)
    expect(
      estimateTextureBytes(desktop, DESKTOP_GLOBE_COUNT),
    ).toBeLessThanOrEqual(DESKTOP_BUDGET_BYTES)
    expect(estimateTextureBytes(phone, PHONE_GLOBE_COUNT)).toBeLessThanOrEqual(
      PHONE_BUDGET_BYTES,
    )
  })

  it('respects the array layer limit', () => {
    const fitted = fitTierConfig(
      tierConfig(true),
      DESKTOP_GLOBE_COUNT,
      SMALL_CAPS,
    )
    expect(fitted.midLayers).toBeLessThanOrEqual(256)
  })

  it('trims pools when the budget is tight', () => {
    const fitted = fitTierConfig(
      tierConfig(true),
      DESKTOP_GLOBE_COUNT,
      CAPS,
      100 * 1024 * 1024,
    )
    expect(fitted.midLayers).toBeLessThan(tierConfig(true).midLayers)
  })

  it('counts a mip chain', () => {
    expect(mipChainBytes(8, 8, 1)).toBe(8 * 8 * 4)
    expect(mipChainBytes(8, 8, 4)).toBe((64 + 16 + 4 + 1) * 4)
  })
})
