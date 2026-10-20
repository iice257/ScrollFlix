// A poster's average colour, shown while the real image loads. Taken from
// TMDB's w92 poster (a few KB) squeezed down to a single pixel.
import sharp from 'sharp'

const POSTER_URL = 'https://image.tmdb.org/t/p/w92'
const ATTEMPTS = 4

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Six hex digits for the average colour of an image buffer or path.
export const colourOfImage = async (input) => {
  const { data } = await sharp(input)
    .removeAlpha()
    .toColourspace('srgb')
    .resize(1, 1, { fit: 'fill', kernel: 'cubic' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return [...data.subarray(0, 3)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
}

// Resolves to the colour, or null when the poster no longer exists (the film
// then drops out). Other failures are retried, then thrown.
export const averageColour = async (
  posterPath,
  { fetchImpl = fetch, sleep = defaultSleep } = {},
) => {
  let lastError
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(`${POSTER_URL}/${posterPath}.jpg`, {
        signal: AbortSignal.timeout(30_000),
      })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`Poster ${response.status}`)
      return await colourOfImage(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      lastError = error
      if (attempt < ATTEMPTS) await sleep(attempt * 1000)
    }
  }
  throw lastError
}
