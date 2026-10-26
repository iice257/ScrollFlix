import { ImageResponse } from '@vercel/og'
import {
  OG_SCALE,
  buildCard,
  defaultCard,
  filmCard,
  partyCard,
} from './_lib/og-cards.js'
import { interFonts } from './_lib/og-fonts.js'
import { MARK_DATA_URI } from './_lib/og-mark.js'
import { summarizePartyCode } from './_lib/party-meta.js'
import { type Film, fetchFilm, fetchPopularPosters } from './_lib/tmdb.js'

// Share cards drawn with @vercel/og (Satori) on the Node runtime. Pinned to
// 0.8.x: 1.0.x looks for an hb.wasm its package does not ship (Node), and its
// edge build fails the Vercel bundler. The layouts live in _lib/og-cards.ts.
//
// The image is a PNG at OG_SCALE of 1200x630 (see og-cards.ts for why): the
// full-size card was 520 to 780 KB, over what WhatsApp will show. Fonts and
// the app mark are embedded, so a render only waits on TMDB.

const POSTER = 'https://image.tmdb.org/t/p/w342'

// Satori fetches images itself and fails the whole render if one is missing,
// so posters are fetched here and embedded; a miss just drops that poster.
const toDataUri = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/jpeg'
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return `data:${type};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

const posterOf = (film: Film | null) =>
  film?.posterPath ? toDataUri(POSTER + film.posterPath) : Promise.resolve(null)

const IMMUTABLE = 'public, immutable, no-transform, s-maxage=31536000'
const DEFAULT_CACHE =
  'public, no-transform, s-maxage=86400, stale-while-revalidate=604800'
// A fallback card is cached briefly so a later request can recover.
const BRIEF_CACHE =
  'public, no-transform, s-maxage=300, stale-while-revalidate=600'

type Built = ReturnType<typeof buildCard>

const render = (built: Built, cache: string): Response => {
  const res = new ImageResponse(built.card as never, {
    width: built.width,
    height: built.height,
    fonts: interFonts(),
  })
  res.headers.set('cache-control', cache)
  return res
}

const home = (posters: string[]) =>
  buildCard(OG_SCALE, () => defaultCard(posters, MARK_DATA_URI))

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')

    if (kind === 'film') {
      const film = await fetchFilm(url.searchParams.get('id') ?? '')
      const poster = await posterOf(film)
      if (film && poster) {
        return render(
          buildCard(OG_SCALE, () => filmCard(film, poster, MARK_DATA_URI)),
          IMMUTABLE,
        )
      }
      return render(home([]), BRIEF_CACHE)
    }

    if (kind === 'party') {
      const summary = summarizePartyCode(url.searchParams.get('code') ?? '')
      if (!summary) return render(home([]), BRIEF_CACHE)
      const film = summary.lastTmdbId
        ? await fetchFilm(summary.lastTmdbId)
        : null
      const poster = await posterOf(film)
      return render(
        buildCard(OG_SCALE, () =>
          partyCard(
            { headline: summary.headline, detail: summary.detail, poster },
            MARK_DATA_URI,
          ),
        ),
        IMMUTABLE,
      )
    }

    const paths = await fetchPopularPosters(6)
    const posters = (
      await Promise.all(paths.map((p) => toDataUri(POSTER + p)))
    ).filter((p): p is string => !!p)
    return render(home(posters), posters.length ? DEFAULT_CACHE : BRIEF_CACHE)
  },
}
