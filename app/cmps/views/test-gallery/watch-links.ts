import { nextKey, youtubeSearchUrl } from './trailer/trailer-logic'

// Where the YouTube entry in the Watch dialog points: the film's first trailer
// that still plays, or a YouTube search for it when none is known or alive.
export const youtubeWatchHref = (
  keys: readonly string[] | undefined,
  dead: ReadonlySet<string>,
  title: string,
  year?: string,
) => {
  const key = nextKey(keys ?? [], dead)
  return key
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`
    : youtubeSearchUrl(title, year)
}
