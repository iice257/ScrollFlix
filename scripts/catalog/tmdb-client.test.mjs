import { describe, expect, it } from 'vitest'
import { createTmdbClient } from './tmdb-client.mjs'

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })

const fakeClock = () => {
  const clock = { time: 0, sleeps: [] }
  clock.now = () => clock.time
  clock.sleep = async (ms) => {
    clock.sleeps.push(ms)
    clock.time += ms
  }
  return clock
}

describe('tmdb client', () => {
  it('rate limit: 100 calls at 40 rps take at least 2.4 s', async () => {
    const clock = fakeClock()
    const client = createTmdbClient({
      token: 't',
      rps: 40,
      fetchImpl: async () => json({ page: 1, results: [] }),
      sleep: clock.sleep,
      now: clock.now,
    })
    for (let call = 0; call < 100; call += 1) await client.discover({})
    expect(clock.time).toBeGreaterThanOrEqual(2400)
    expect(client.stats()).toEqual({ requests: 100, failures: 0 })
  })

  it('rate limit holds for concurrent callers', async () => {
    const clock = fakeClock()
    const client = createTmdbClient({
      token: 't',
      rps: 40,
      fetchImpl: async () => json({ page: 1, results: [] }),
      sleep: clock.sleep,
      now: clock.now,
    })
    await Promise.all(Array.from({ length: 100 }, () => client.discover({})))
    expect(clock.time).toBeGreaterThanOrEqual(2400)
  })

  it('sends the bearer token and the query', async () => {
    const seen = []
    const client = createTmdbClient({
      token: 'secret',
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), auth: init.headers.Authorization })
        return json({ page: 1, results: [] })
      },
      sleep: async () => {},
    })
    await client.discover({ page: 2, 'vote_count.gte': 10 })
    expect(seen[0].auth).toBe('Bearer secret')
    const url = new URL(seen[0].url)
    expect(url.pathname).toBe('/3/discover/movie')
    expect(url.searchParams.get('vote_count.gte')).toBe('10')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('retries 429 honouring Retry-After', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createTmdbClient({
      token: 't',
      fetchImpl: async () => {
        calls += 1
        return calls === 1
          ? new Response('slow down', {
              status: 429,
              headers: { 'retry-after': '3' },
            })
          : json({ id: 1 })
      },
      sleep: clock.sleep,
      now: clock.now,
    })
    await expect(client.movie(1)).resolves.toEqual({ id: 1 })
    expect(calls).toBe(2)
    expect(clock.sleeps).toContain(3000)
    expect(client.stats()).toEqual({ requests: 1, failures: 0 })
  })

  it('backs off exponentially on 5xx from 500 ms', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createTmdbClient({
      token: 't',
      rps: 1000,
      fetchImpl: async () => {
        calls += 1
        return calls <= 3 ? new Response('', { status: 503 }) : json({ id: 9 })
      },
      sleep: clock.sleep,
      now: clock.now,
    })
    await client.movie(9)
    expect(clock.sleeps.filter((ms) => ms >= 500)).toEqual([500, 1000, 2000])
  })

  it('404 → null', async () => {
    const client = createTmdbClient({
      token: 't',
      fetchImpl: async () => new Response('{}', { status: 404 }),
      sleep: async () => {},
    })
    await expect(client.movie(404)).resolves.toBeNull()
    expect(client.stats()).toEqual({ requests: 1, failures: 0 })
  })

  it('5 failures → throws and counts', async () => {
    let calls = 0
    const client = createTmdbClient({
      token: 't',
      fetchImpl: async () => {
        calls += 1
        return new Response('', { status: 500 })
      },
      sleep: async () => {},
    })
    await expect(client.movie(1)).rejects.toThrow(/500/)
    expect(calls).toBe(6)
    expect(client.stats()).toEqual({ requests: 1, failures: 1 })
  })

  it('retries network errors', async () => {
    let calls = 0
    const client = createTmdbClient({
      token: 't',
      fetchImpl: async () => {
        calls += 1
        if (calls < 3) throw new TypeError('fetch failed')
        return json({ id: 5 })
      },
      sleep: async () => {},
    })
    await expect(client.movie(5)).resolves.toEqual({ id: 5 })
  })

  it('changes pages through the movie/changes endpoint', async () => {
    let seen = ''
    const client = createTmdbClient({
      token: 't',
      fetchImpl: async (url) => {
        seen = String(url)
        return json({ results: [{ id: 1 }], page: 2, total_pages: 3 })
      },
      sleep: async () => {},
    })
    await client.changes('2026-10-01', '2026-10-02', 2)
    const url = new URL(seen)
    expect(url.pathname).toBe('/3/movie/changes')
    expect(url.searchParams.get('start_date')).toBe('2026-10-01')
    expect(url.searchParams.get('end_date')).toBe('2026-10-02')
    expect(url.searchParams.get('page')).toBe('2')
  })
})
