import { tmdbIdOfMovie } from './watch-providers'

// The "More links" in the Watch sheet: where else to read about a film. All
// are plain links (no API, no key): IMDb and Trakt and Letterboxd by id where
// we have one, searches otherwise.
export type MoreLink = { id: string; label: string; href: string }

type Film = {
  id: string
  title: string
  year: string
  imdbId?: string
}

export const moreLinks = ({ id, title, year, imdbId }: Film): MoreLink[] => {
  const q = encodeURIComponent(title)
  const withYear = encodeURIComponent(
    /^\d{4}$/.test(year) ? `${title} ${year}` : title,
  )
  const tmdbId = tmdbIdOfMovie(id)
  return [
    {
      id: 'imdb',
      label: 'IMDb',
      href: imdbId
        ? `https://www.imdb.com/title/${encodeURIComponent(imdbId)}/`
        : `https://www.imdb.com/find/?q=${withYear}&s=tt`,
    },
    {
      id: 'letterboxd',
      label: 'Letterboxd',
      href: tmdbId
        ? `https://letterboxd.com/tmdb/${tmdbId}/`
        : `https://letterboxd.com/search/${q}/`,
    },
    {
      id: 'rotten-tomatoes',
      label: 'Rotten Tomatoes',
      href: `https://www.rottentomatoes.com/search?search=${q}`,
    },
    {
      id: 'wikipedia',
      label: 'Wikipedia',
      href: `https://en.wikipedia.org/w/index.php?search=${withYear}+film`,
    },
    {
      id: 'trakt',
      label: 'Trakt',
      href: tmdbId
        ? `https://trakt.tv/search/tmdb/${tmdbId}?id_type=movie`
        : `https://trakt.tv/search?query=${q}`,
    },
  ]
}

// "No options?": a Google search for where to watch the film.
export const whereToWatchUrl = (title: string, year: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(
    `where to watch ${title}${/^\d{4}$/.test(year) ? ` ${year}` : ''}`,
  )}`
