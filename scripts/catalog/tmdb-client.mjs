// A small TMDB v3 client for the catalogue pipeline: bearer-token auth, a
// rate limit shared by every caller, and retry with exponential backoff.
//
// Time and the network are injected (`fetchImpl`, `sleep`, `now`), so the
// rate limiter and the retry schedule can be tested on a fake clock.
const API_URL = 'https://api.themoviedb.org/3'
const MAX_RETRIES = 5
const BACKOFF_START_MS = 500

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const createTmdbClient = ({
  token,
  rps = 40,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = Date.now,
} = {}) => {
  const interval = 1000 / rps
  let nextSlot = 0
  let requests = 0
  let failures = 0

  // Each call reserves the next free slot before it waits, so concurrent
  // callers queue up instead of bursting past the limit.
  const throttle = async () => {
    const time = now()
    const slot = Math.max(time, nextSlot)
    nextSlot = slot + interval
    if (slot > time) await sleep(slot - time)
  }

  const retryDelay = (attempt, response) => {
    const header = Number(response?.headers.get('retry-after'))
    if (Number.isFinite(header) && header > 0) return header * 1000
    return BACKOFF_START_MS * 2 ** attempt
  }

  // Resolves to the parsed JSON, or null for a 404 when allowed.
  const request = async (path, params = {}, { allowNotFound = false } = {}) => {
    const url = new URL(`${API_URL}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
    requests += 1
    let lastError
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      await throttle()
      let response
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        })
      } catch (error) {
        lastError = error
        if (attempt < MAX_RETRIES) await sleep(retryDelay(attempt))
        continue
      }
      if (response.ok) return response.json()
      if (response.status === 404 && allowNotFound) return null
      lastError = new Error(`TMDB ${response.status} ${path}`)
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) break
      if (attempt < MAX_RETRIES) await sleep(retryDelay(attempt, response))
    }
    failures += 1
    throw lastError
  }

  return {
    discover: (params) => request('/discover/movie', params),
    movie: (id) =>
      request(
        `/movie/${id}`,
        {
          append_to_response: 'external_ids,videos',
          include_video_language: 'en,null',
        },
        { allowNotFound: true },
      ),
    changes: (startDate, endDate, page = 1) =>
      request('/movie/changes', {
        start_date: startDate,
        end_date: endDate,
        page,
      }),
    stats: () => ({ requests, failures }),
  }
}
