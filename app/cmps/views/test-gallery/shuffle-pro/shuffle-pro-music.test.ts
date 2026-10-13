import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { JINGLE_URLS } from './shuffle-pro-music'

const TIERS = ['frost', 'amethyst', 'jade', 'gold'] as const

describe('reveal jingles', () => {
  it.each(TIERS)('ships a clip for %s', (tier) => {
    expect(existsSync(join(process.cwd(), 'public', JINGLE_URLS[tier]))).toBe(
      true,
    )
  })

  it('gives every path its own clip', () => {
    expect(new Set(Object.values(JINGLE_URLS)).size).toBe(TIERS.length)
  })
})
