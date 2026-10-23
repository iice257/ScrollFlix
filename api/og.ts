import { ImageResponse } from '@vercel/og'
import { SITE } from './_lib/meta.js'
import {
  type Film,
  POSTER_BASE,
  fetchFilm,
  fetchPopularPosters,
} from './_lib/tmdb.js'

// 1200x630 share cards, drawn with @vercel/og (Satori) on the Node runtime.
// Pinned to 0.8.x: 1.0.x looks for an hb.wasm its package does not ship (Node),
// and its edge build fails the Vercel bundler.
// Elements are plain objects instead of JSX so no JSX transform is needed.
// Palette is the app's: near-black ground, one teal accent.
const INK = '#08090b'
const TEAL = '#4fe3c4'
const TEXT = '#f7f7f8'
const MUTED = '#9a9ea6'

type Style = Record<string, string | number>
type El = { type: string; props: Record<string, unknown> }
const h = (
  type: string,
  style: Style,
  children?: unknown,
  extra: Record<string, unknown> = {},
): El => ({ type, props: { style, children, ...extra } })

const FONT_BASE = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@5'
let fontCache: Promise<
  { name: string; data: ArrayBuffer; weight: 500 | 800 }[]
> | null = null
const loadFonts = () => {
  fontCache ??= Promise.all(
    ([500, 800] as const).map(async (weight) => {
      const res = await fetch(`${FONT_BASE}/latin-${weight}-normal.woff`, {
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) throw new Error('font')
      return { name: 'Inter', data: await res.arrayBuffer(), weight }
    }),
  ).catch(() => {
    fontCache = null
    return []
  })
  return fontCache
}

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

const brand = (markSrc: string | null, size = 44) =>
  h('div', { display: 'flex', alignItems: 'center' }, [
    markSrc
      ? h(
          'img',
          { width: size, height: size, borderRadius: size * 0.22 },
          undefined,
          { src: markSrc, width: size, height: size },
        )
      : null,
    h(
      'div',
      {
        display: 'flex',
        marginLeft: markSrc ? 16 : 0,
        fontSize: size * 0.72,
        fontWeight: 800,
        letterSpacing: -0.5,
        color: TEXT,
      },
      'ScrollFlix',
    ),
  ])

const glow = (x: string, y: string, size: number, alpha: number): El =>
  h('div', {
    position: 'absolute',
    left: x,
    top: y,
    width: size,
    height: size,
    borderRadius: size,
    background: `radial-gradient(circle, rgba(79,227,196,${alpha}) 0%, rgba(79,227,196,0) 65%)`,
  })

const frame = (children: unknown[]): El =>
  h(
    'div',
    {
      display: 'flex',
      position: 'relative',
      width: '100%',
      height: '100%',
      background: INK,
      color: TEXT,
      fontFamily: 'Inter',
      overflow: 'hidden',
    },
    children,
  )

// Satori can't measure text, so estimate the title's wrapped line count and
// shrink the type until it fits in at most three lines.
const fitTitle = (title: string) => {
  for (const size of [116, 96, 80, 68, 56]) {
    const perLine = Math.floor(600 / (size * 0.55))
    let lines = 1
    let width = 0
    for (const word of title.split(/\s+/)) {
      const need = word.length + (width ? 1 : 0)
      if (width && width + need > perLine) {
        lines++
        width = word.length
      } else width += need
    }
    if (lines <= (size >= 96 ? 1 : 3)) return { size, lines }
  }
  return { size: 56, lines: 3 }
}

const filmCard = (film: Film, poster: string, mark: string | null): El => {
  const facts = [
    film.rating
      ? h('div', { display: 'flex', alignItems: 'center' }, [
          h(
            'div',
            {
              display: 'flex',
              fontSize: 34,
              fontWeight: 800,
              color: INK,
              background: TEAL,
              borderRadius: 12,
              padding: '6px 16px',
            },
            film.rating.toFixed(1),
          ),
        ])
      : null,
    film.year
      ? h(
          'div',
          {
            display: 'flex',
            fontSize: 38,
            fontWeight: 500,
            color: MUTED,
            marginLeft: film.rating ? 22 : 0,
          },
          film.year,
        )
      : null,
  ]
  const { size, lines } = fitTitle(film.title)
  // Right column is 540 tall: eyebrow, title, facts, brand, and a gap of at
  // least 32 above the brand. What is left is the overview's room.
  const used = 56 + lines * size * 1.04 + 34 + 58 + 44 + 32 + 34
  const overviewLines = Math.min(
    lines >= 3 ? 1 : 2,
    Math.floor((540 - used) / 39.2),
  )
  return frame([
    glow('-100px', '-80px', 820, 0.3),
    glow('600px', '260px', 760, 0.12),
    h(
      'div',
      {
        display: 'flex',
        position: 'absolute',
        left: 70,
        top: 45,
        width: 380,
        height: 540,
        borderRadius: 22,
        boxShadow: '0 30px 80px rgba(0,0,0,0.75)',
        overflow: 'hidden',
      },
      [
        h('img', { width: 380, height: 540, objectFit: 'cover' }, undefined, {
          src: poster,
          width: 380,
          height: 540,
        }),
      ],
    ),
    h(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        left: 530,
        top: 45,
        width: 600,
        height: 540,
        justifyContent: 'space-between',
      },
      [
        h('div', { display: 'flex', flexDirection: 'column' }, [
          h(
            'div',
            {
              display: 'flex',
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 5,
              color: TEAL,
              marginBottom: 26,
            },
            'ON THE GLOBE',
          ),
          h(
            'div',
            {
              display: 'block',
              fontSize: size,
              lineHeight: 1.04,
              fontWeight: 800,
              letterSpacing: -2,
              lineClamp: 3,
              marginBottom: 34,
            },
            film.title,
          ),
          h('div', { display: 'flex', alignItems: 'center' }, facts),
          film.overview && overviewLines > 0
            ? h(
                'div',
                {
                  display: 'block',
                  fontSize: 28,
                  lineHeight: 1.4,
                  fontWeight: 500,
                  color: MUTED,
                  lineClamp: overviewLines,
                  marginTop: 34,
                },
                film.overview,
              )
            : null,
        ]),
        brand(mark),
      ],
    ),
  ])
}

// Home card: a tilted wall of posters with the pitch in front.
const defaultCard = (posters: string[], mark: string | null): El => {
  const col = (items: string[], top: number) =>
    h(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        marginLeft: 22,
        marginTop: top,
      },
      items.map((src) =>
        h(
          'img',
          {
            width: 190,
            height: 285,
            borderRadius: 14,
            marginBottom: 22,
            objectFit: 'cover',
          },
          undefined,
          { src, width: 190, height: 285 },
        ),
      ),
    )
  const wall = posters.length
    ? h(
        'div',
        {
          display: 'flex',
          position: 'absolute',
          left: 620,
          top: -150,
          transform: 'rotate(-9deg)',
          opacity: 0.95,
        },
        [
          col(posters.slice(0, 3), 40),
          col(posters.slice(3, 6), -60),
          col(posters.slice(6, 9), 90),
          col(posters.slice(9, 12), -20),
        ],
      )
    : null
  return frame([
    glow('-160px', '120px', 900, posters.length ? 0.18 : 0.3),
    wall,
    // Keeps the pitch readable over the wall.
    wall
      ? h('div', {
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1200,
          height: 630,
          background:
            'linear-gradient(90deg, rgba(8,9,11,1) 0%, rgba(8,9,11,0.96) 38%, rgba(8,9,11,0.35) 70%, rgba(8,9,11,0.1) 100%)',
        })
      : null,
    h(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        left: 80,
        top: 70,
        width: 600,
        height: 490,
        justifyContent: 'space-between',
      },
      [
        brand(mark, 64),
        h('div', { display: 'flex', flexDirection: 'column' }, [
          h(
            'div',
            {
              display: 'flex',
              fontSize: 86,
              lineHeight: 1.02,
              fontWeight: 800,
              letterSpacing: -3,
              marginBottom: 24,
            },
            'Spin a globe of 100k+ films',
          ),
          h(
            'div',
            {
              display: 'flex',
              fontSize: 32,
              fontWeight: 500,
              color: TEAL,
            },
            'Find what to watch tonight',
          ),
        ]),
      ],
    ),
  ])
}

const IMMUTABLE = 'public, immutable, no-transform, s-maxage=31536000'
const DEFAULT_CACHE =
  'public, no-transform, s-maxage=86400, stale-while-revalidate=604800'

const render = async (card: El, cache: string): Promise<Response> => {
  const fonts = await loadFonts()
  const res = new ImageResponse(card as never, {
    width: 1200,
    height: 630,
    ...(fonts.length ? { fonts } : {}),
  })
  res.headers.set('cache-control', cache)
  return res
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const mark = await toDataUri(`${SITE}/icon-512.png`)

    if (kind === 'film') {
      const id = url.searchParams.get('id') ?? ''
      const film = await fetchFilm(id)
      const poster =
        film?.posterPath && (await toDataUri(POSTER_BASE + film.posterPath))
      if (film && poster) {
        return render(filmCard(film, poster, mark), IMMUTABLE)
      }
      // Unknown film or TMDB unreachable: the home card, cached briefly so a
      // later request can recover.
      return render(
        defaultCard([], mark),
        'public, no-transform, s-maxage=300, stale-while-revalidate=600',
      )
    }

    const paths = await fetchPopularPosters(12)
    const posters = (
      await Promise.all(paths.map((p) => toDataUri(POSTER_BASE + p)))
    ).filter((p): p is string => !!p)
    return render(
      defaultCard(posters, mark),
      posters.length
        ? DEFAULT_CACHE
        : 'public, no-transform, s-maxage=300, stale-while-revalidate=600',
    )
  },
}
