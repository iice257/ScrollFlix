// GET /api/watch: which services carry a film in the visitor's country.
// See ./_lib/watch.ts.
import { get } from './_lib/tmdb.js'
import { handleWatch } from './_lib/watch.js'

export function GET(request: Request) {
  return handleWatch(request, get)
}
