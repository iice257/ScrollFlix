import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type WatchProvider,
  clearWatchCache,
  groupByKind,
  loadWatchOptions,
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
