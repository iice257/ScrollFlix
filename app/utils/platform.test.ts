import { describe, expect, it } from 'vitest'
import { detectIOS } from './platform'

describe('detectIOS', () => {
  it('recognises iPhone and iPad user agents', () => {
    expect(
      detectIOS({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
      }),
    ).toBe(true)
    expect(
      detectIOS({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',
        platform: 'iPad',
      }),
    ).toBe(true)
  })

  it('recognises iPadOS that reports itself as a touch Mac', () => {
    expect(
      detectIOS({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(true)
  })

  it('leaves desktop browsers alone', () => {
    expect(
      detectIOS({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      }),
    ).toBe(false)
    expect(
      detectIOS({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
      }),
    ).toBe(false)
    expect(detectIOS(undefined)).toBe(false)
  })
})
