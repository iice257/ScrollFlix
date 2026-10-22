import { describe, expect, it } from 'vitest'
import { fakeClient } from './fixtures/details.mjs'
import { discoverIds } from './seed.mjs'

const result = (id) => ({
  id,
  poster_path: `/p${id}.jpg`,
  release_date: '2000-01-01',
})

describe('discoverIds', () => {
  const yearOf = (params) => params.primary_release_year

  it('collects ids from every page of every year', async () => {
    const client = fakeClient({
      discoverFn: (params) => {
        const year = yearOf(params)
        if (year !== 2001) return { page: 1, total_pages: 0, results: [] }
        return {
          page: params.page,
          total_pages: 3,
          results: [result(params.page * 10), result(params.page * 10 + 1)],
        }
      },
    })
    const ids = await discoverIds(client, 10, { fromYear: 2000, toYear: 2002 })
    expect([...ids].sort((a, b) => a - b)).toEqual([10, 11, 20, 21, 30, 31])
    expect(new Set(client.calls.discover.map(yearOf))).toEqual(
      new Set([2000, 2001, 2002]),
    )
    for (const params of client.calls.discover) {
      expect(params['vote_count.gte']).toBe(10)
      expect(params.sort_by).toBe('vote_count.desc')
    }
  })

  it('skips results with no poster or no release date', async () => {
    const client = fakeClient({
      discoverFn: () => ({
        page: 1,
        total_pages: 1,
        results: [
          result(1),
          { id: 2, poster_path: null, release_date: '2000-01-01' },
          { id: 3, poster_path: '/p3.jpg', release_date: '' },
        ],
      }),
    })
    const ids = await discoverIds(client, 10, { fromYear: 2000, toYear: 2000 })
    expect([...ids]).toEqual([1])
  })

  it('splits capped years by month', async () => {
    const client = fakeClient({
      discoverFn: (params) => {
        if (yearOf(params) === 1999) {
          return { page: 1, total_pages: 600, results: [result(1)] }
        }
        if (params['primary_release_date.gte']) {
          const month = Number(params['primary_release_date.gte'].slice(5, 7))
          return {
            page: params.page,
            total_pages: 1,
            results: [result(1000 + month)],
          }
        }
        return { page: 1, total_pages: 0, results: [] }
      },
    })
    const ids = await discoverIds(client, 10, { fromYear: 1999, toYear: 1999 })
    const monthQueries = client.calls.discover.filter(
      (params) => params['primary_release_date.gte'] && params.page === 1,
    )
    expect(monthQueries).toHaveLength(12)
    expect(monthQueries[1]['primary_release_date.gte']).toBe('1999-02-01')
    expect(monthQueries[1]['primary_release_date.lte']).toBe('1999-02-28')
    expect(monthQueries[11]['primary_release_date.lte']).toBe('1999-12-31')
    // The capped query never walked past page 500.
    expect(
      Math.max(...client.calls.discover.map((params) => params.page)),
    ).toBeLessThanOrEqual(500)
    expect(ids.has(1012)).toBe(true)
    expect(ids.size).toBe(12)
  })

  it('caps pagination at 500 pages', async () => {
    const client = fakeClient({
      discoverFn: (params) => ({
        page: params.page,
        total_pages: 450,
        results: [],
      }),
    })
    await discoverIds(client, 10, { fromYear: 2000, toYear: 2000 })
    expect(client.calls.discover).toHaveLength(450)
  })
})
