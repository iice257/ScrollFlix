import { next } from '@vercel/functions'
import {
  filmIdFromUrl,
  isPreviewBot,
  previewFor,
  renderMetaHtml,
} from './api/_lib/meta.js'
import { fetchFilm } from './api/_lib/tmdb.js'

// Routing Middleware (Node runtime, the default). Link-preview crawlers get a
// tiny page of Open Graph tags for the shared URL. Everyone else, and any
// error, continues to the app.
export const config = { matcher: ['/'] }

export default async function middleware(request: Request) {
  try {
    if (!isPreviewBot(request.headers.get('user-agent'))) return next()
    const url = new URL(request.url)
    const id = filmIdFromUrl(url)
    const film = id ? await fetchFilm(id) : null
    return new Response(renderMetaHtml(previewFor(url, film)), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch {
    return next()
  }
}
