// GET /api/search: the live TMDB fallback for the index search. See
// ./_lib/search.ts.
import { handleSearch } from './_lib/search.js'
import { get } from './_lib/tmdb.js'

export function GET(request: Request) {
  return handleSearch(request, get)
}
