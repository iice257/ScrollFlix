import { describe, expect, it, vi } from 'vitest'
import {
  type WatchReply,
  handleWatch,
  normalizeRegion,
  parseWatch,
  providerUrl,
} from './watch'

const body = {
  results: {
    US: {
      link: 'https://www.themoviedb.org/movie/27205/watch?locale=US',
      flatrate: [
        { provider_id: 384, provider_name: 'Max', display_priority: 5 },
        { provider_id: 8, provider_name: 'Netflix', display_priority: 1 },
      ],
      rent: [
        { provider_id: 8, provider_name: 'Netflix', display_priority: 1 },
        { provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.jpg' },
      ],
      free: [{ provider_id: 73, provider_name: 'Tubi TV' }],
    },
    GB: { link: 'http://insecure.example/x', buy: [] },
  },
}

describe('parseWatch', () => {
  it('orders by kind, then display priority, and lists a service once', () => {
    const reply = parseWatch(body, 'US', 'Inception')
    expect(reply.providers.map((p) => `${p.name}:${p.kind}`)).toEqual([
      'Netflix:stream',
      'Max:stream',
      'Tubi TV:free',
      'Apple TV:rent',
    ])
  })

  it('builds a search link for known services only', () => {
    const reply = parseWatch(body, 'US', 'Spirited Away')
    expect(reply.providers[0].url).toBe(
      'https://www.netflix.com/search?q=Spirited%20Away',
    )
    expect(providerUrl(999999, 'x')).toBeNull()
    expect(providerUrl(8, '')).toBeNull()
  })

  it('keeps the JustWatch link only when it is https', () => {
    expect(parseWatch(body, 'US', 'x').link).toMatch(/^https:\/\//)
    expect(parseWatch(body, 'GB', 'x').link).toBeNull()
  })

  it('is empty for a country or body with nothing', () => {
    expect(parseWatch(body, 'FR', 'x')).toEqual({
      region: 'FR',
      link: null,
      providers: [],
    })
    expect(parseWatch(null, 'US', 'x').providers).toEqual([])
  })
})

describe('normalizeRegion', () => {
  it('accepts two letters and falls back to the US', () => {
    expect(normalizeRegion('gb')).toBe('GB')
    expect(normalizeRegion(null)).toBe('US')
    expect(normalizeRegion('usa')).toBe('US')
    expect(normalizeRegion('../')).toBe('US')
  })
})

describe('handleWatch', () => {
  const ask = (query: string, headers: Record<string, string> = {}) =>
    new Request(`https://scrollflix.app/api/watch?${query}`, { headers })

  it('rejects a missing or non-numeric id without calling TMDB', async () => {
    const load = vi.fn()
    expect((await handleWatch(ask('id=abc'), load)).status).toBe(400)
    expect((await handleWatch(ask(''), load)).status).toBe(400)
    expect(load).not.toHaveBeenCalled()
  })

  it('uses the geo header for the country and caches the reply', async () => {
    const load = vi.fn().mockResolvedValue(body)
    const res = await handleWatch(
      ask('id=27205&title=Inception', { 'x-vercel-ip-country': 'GB' }),
      load,
    )
    expect(load).toHaveBeenCalledWith('movie/27205/watch/providers')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400')
    expect(((await res.json()) as WatchReply).region).toBe('GB')
  })

  it('lets the query override the country', async () => {
    const load = vi.fn().mockResolvedValue(body)
    const res = await handleWatch(
      ask('id=27205&region=US', { 'x-vercel-ip-country': 'GB' }),
      load,
    )
    expect(((await res.json()) as WatchReply).providers.length).toBeGreaterThan(
      0,
    )
  })

  it('answers 502 when TMDB is unreachable or unconfigured', async () => {
    expect(
      (await handleWatch(ask('id=1'), vi.fn().mockResolvedValue(null))).status,
    ).toBe(502)
    expect(
      (
        await handleWatch(
          ask('id=1'),
          vi.fn().mockRejectedValue(new Error('x')),
        )
      ).status,
    ).toBe(502)
  })
})
