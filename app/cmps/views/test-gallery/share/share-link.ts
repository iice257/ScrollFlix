import { filmLinkId } from '../landing'

// A film's page: the app opens straight onto it. Kept apart from the share
// artwork so the page can build links without loading any of that code.
export const shareLink = (movieId: string, base = window.location.href) => {
  const url = new URL(base)
  url.search = ''
  url.hash = ''
  url.searchParams.set('film', filmLinkId(movieId))
  return url.toString()
}
