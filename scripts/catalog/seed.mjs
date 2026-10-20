// Finding which films belong in the catalogue: pick the vote threshold that
// gives about the target count, then list every film above it.
import { mapPool } from './pool.mjs'

const FIRST_YEAR = 1874
// TMDB serves at most 500 pages (10,000 films) for any one query.
const MAX_PAGES = 500
const MIN_VOTES_RANGE = [1, 200]
const PAGE_CONCURRENCY = 16

const baseParams = (minVotes) => ({
  include_adult: false,
  include_video: false,
  sort_by: 'vote_count.desc',
  'vote_count.gte': minVotes,
})

// The smallest vote threshold whose film count is within 5% of the target
// (or under it). The count only ever falls as the threshold rises, so this
// is a binary search: about eight probes.
export const chooseMinVotes = async (client, target) => {
  const limit = target * 1.05
  let [low, high] = MIN_VOTES_RANGE
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const { total_results: total } = await client.discover({
      ...baseParams(middle),
      page: 1,
    })
    if (total <= limit) high = middle
    else low = middle + 1
  }
  return low
}

const pad = (value) => String(value).padStart(2, '0')

const monthRange = (year, month) => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    'primary_release_date.gte': `${year}-${pad(month)}-01`,
    'primary_release_date.lte': `${year}-${pad(month)}-${pad(lastDay)}`,
  }
}

// Every id on every page of one query. Films without a poster or a release
// date cannot be shown, so they are not worth a detail request.
const collect = async (client, params, firstPage) => {
  const ids = new Set()
  const take = (page) => {
    for (const result of page.results ?? []) {
      if (result.poster_path && result.release_date) ids.add(result.id)
    }
  }
  take(firstPage)
  const pages = Math.min(firstPage.total_pages ?? 1, MAX_PAGES)
  const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2)
  await mapPool(rest, PAGE_CONCURRENCY, async (page) => {
    take(await client.discover({ ...params, page }))
  })
  return ids
}

export const discoverIds = async (
  client,
  minVotes,
  { fromYear = FIRST_YEAR, toYear = new Date().getUTCFullYear() + 1 } = {},
) => {
  const ids = new Set()
  for (let year = fromYear; year <= toYear; year += 1) {
    const params = {
      ...baseParams(minVotes),
      primary_release_year: year,
    }
    const first = await client.discover({ ...params, page: 1 })
    if ((first.total_pages ?? 0) <= MAX_PAGES) {
      for (const id of await collect(client, params, first)) ids.add(id)
      continue
    }
    // Over the 500-page cap: walk the year month by month instead.
    for (let month = 1; month <= 12; month += 1) {
      const monthParams = { ...baseParams(minVotes), ...monthRange(year, month) }
      const page = await client.discover({ ...monthParams, page: 1 })
      for (const id of await collect(client, monthParams, page)) ids.add(id)
    }
  }
  return ids
}
