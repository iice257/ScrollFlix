import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type WatchProvider,
  badgeProviders,
  badgeSummary,
  clearWatchCache,
  groupByKind,
  loadWatchOptions,
  providerBrand,
  tmdbIdOfMovie,
} from './watch-providers'

const provider = (id: number, kind: WatchProvider['kind']): WatchProvider => ({
  id,
  name: `p${id}`,
  logoPath: null,
  kind,
  url: null,
})

afterEach(clearWatchCache)

describe('groupByKind', () => {
  it('orders sections stream, free, ads, rent, buy and drops empty ones', () => {
    const groups = groupByKind([
      provider(1, 'buy'),
      provider(2, 'stream'),
      provider(3, 'rent'),
    ])
    expect(groups.map((g) => g.label)).toEqual(['Stream', 'Rent', 'Buy'])
  })
})

describe('tmdbIdOfMovie', () => {
  it('reads catalogue ids only', () => {
    expect(tmdbIdOfMovie('c27205')).toBe('27205')
    expect(tmdbIdOfMovie('0-27205')).toBeNull()
  })
})

describe('loadWatchOptions', () => {
  const reply = { region: 'US', link: null, providers: [provider(8, 'stream')] }
  const ok = () =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => reply })

  it('asks once per film and remembers the answer', async () => {
    const fetchImpl = ok()
    await loadWatchOptions('c1', 'A', fetchImpl)
    await loadWatchOptions('c1', 'A', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/watch?id=1&title=A')
  })

  it('does not cache a failure', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 502 })
    await expect(loadWatchOptions('c2', 'B', bad)).rejects.toThrow()
    const fetchImpl = ok()
    await expect(loadWatchOptions('c2', 'B', fetchImpl)).resolves.toEqual(reply)
  })

  it('refuses a film with no TMDB id', async () => {
    await expect(loadWatchOptions('x', 'B', ok())).rejects.toThrow()
  })
})

describe('country in the request', () => {
  it('names the country from the first reply in every later request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ region: 'GB', link: null, providers: [] }),
    })
    await loadWatchOptions('c1', 'A', fetchImpl)
    await loadWatchOptions('c2', 'B', fetchImpl)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/watch?id=1&title=A')
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/watch?id=2&title=B&region=GB')
  })
})

describe('badgeProviders', () => {
  const withLogo = (
    id: number,
    kind: WatchProvider['kind'],
    url: string | null = 'https://x',
  ) => ({ ...provider(id, kind), logoPath: `/${id}.jpg`, url })

  it('keeps confirmed subscription or free services with a link and a logo', () => {
    const options = {
      region: 'US',
      link: null,
      providers: [
        withLogo(1, 'stream'),
        withLogo(2, 'rent'),
        withLogo(3, 'free', null),
        provider(4, 'stream'),
        withLogo(5, 'ads'),
        withLogo(6, 'stream'),
        withLogo(7, 'stream'),
      ],
    }
    expect(badgeProviders(options).map((p) => p.id)).toEqual([1, 5, 6])
  })

  it('accepts the film page link when a service has no search link', () => {
    const options = {
      region: 'US',
      link: 'https://www.themoviedb.org/movie/1/watch',
      providers: [withLogo(3, 'free', null)],
    }
    expect(badgeProviders(options).map((p) => p.id)).toEqual([3])
  })

  it('shows nothing when nothing is confirmed', () => {
    expect(badgeProviders({ region: 'NG', link: null, providers: [] })).toEqual(
      [],
    )
  })
})

describe('providerBrand', () => {
  it('folds the listings of one service together', () => {
    const brands = [
      'Paramount Plus Premium',
      'Paramount Plus Essential',
      'Paramount+ Amazon Channel',
      'Paramount+ Roku Premium Channel',
    ].map(providerBrand)
    expect(new Set(brands).size).toBe(1)
    expect(providerBrand('Amazon Prime Video with Ads')).toBe(
      providerBrand('Amazon Prime Video'),
    )
    expect(providerBrand('HBO Max Amazon Channel')).toBe(
      providerBrand('HBO Max'),
    )
    expect(providerBrand('Netflix')).not.toBe(providerBrand('Disney Plus'))
  })
})

describe('badgeSummary', () => {
  const logo = (id: number, name: string, kind: WatchProvider['kind']) => ({
    ...provider(id, kind),
    name,
    logoPath: `/${id}.jpg`,
    url: 'https://x',
  })

  it('shows services side by side, never hiding one because another is on', () => {
    const options = {
      region: 'US',
      link: null,
      providers: [
        logo(8, 'Netflix', 'stream'),
        logo(9, 'Amazon Prime Video', 'stream'),
        logo(337, 'Disney Plus', 'stream'),
        logo(384, 'Max', 'stream'),
        logo(73, 'Tubi TV', 'free'),
        logo(2, 'Apple TV', 'rent'),
      ],
    }
    const { shown, more } = badgeSummary(options)
    expect(shown.map((p) => p.name)).toEqual([
      'Netflix',
      'Amazon Prime Video',
      'Disney Plus',
    ])
    // Max and Tubi are also confirmed; rent is left to the sheet.
    expect(more).toBe(2)
  })

  it('has nothing to add when three or fewer are confirmed', () => {
    const options = {
      region: 'US',
      link: null,
      providers: [
        logo(8, 'Netflix', 'stream'),
        logo(9, 'Amazon Prime Video', 'ads'),
      ],
    }
    expect(badgeSummary(options).more).toBe(0)
    expect(badgeSummary(options).shown).toHaveLength(2)
  })
})
