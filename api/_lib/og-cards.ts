// Share-card layouts for /api/og, drawn with @vercel/og (Satori). Elements are
// plain objects instead of JSX so no JSX transform is needed. Palette is the
// app's: near-black ground, one teal accent. Kept apart from the request
// handler so the layouts can be tested without a server.

import type { Film } from './tmdb.js'

const INK = '#08090b'
const TEAL = '#4fe3c4'
const TEXT = '#f7f7f8'
const MUTED = '#9a9ea6'

export type Style = Record<string, string | number>
export type El = { type: string; props: Record<string, unknown> }
// Layouts are written in 1200x630 design pixels. The PNG is what crawlers
// download and WhatsApp drops previews much over 300 KB, so the card is drawn
// on a smaller canvas: every length in a style is multiplied by the current
// scale as the element is built, and the file shrinks with the area.
let scale = 1
const LENGTHS = new Set([
  'width',
  'height',
  'left',
  'top',
  'fontSize',
  'letterSpacing',
  'borderRadius',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'padding',
  'boxShadow',
])
const sized = (value: string | number) =>
  typeof value === 'number'
    ? Math.round(value * scale * 100) / 100
    : value.replace(
        /(-?\d+(?:\.\d+)?)px/g,
        (_, n: string) => `${Math.round(Number(n) * scale * 100) / 100}px`,
      )
const h = (
  type: string,
  style: Style,
  children?: unknown,
  extra: Record<string, unknown> = {},
): El => {
  const out: Style = {}
  for (const [key, value] of Object.entries(style)) {
    out[key] = LENGTHS.has(key) ? sized(value) : value
  }
  const attrs: Record<string, unknown> = { ...extra }
  for (const key of ['width', 'height'] as const) {
    if (typeof attrs[key] === 'number') attrs[key] = sized(attrs[key] as number)
  }
  return { type, props: { style: out, children, ...attrs } }
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

const stripe = (): El =>
  h('div', {
    position: 'absolute',
    left: 0,
    top: 622,
    width: 1200,
    height: 8,
    background: TEAL,
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

export const filmCard = (
  film: Film,
  poster: string,
  mark: string | null,
): El => {
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
    stripe(),
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
export const defaultCard = (posters: string[], mark: string | null): El => {
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
          left: 760,
          top: -150,
          transform: 'rotate(-9deg)',
          opacity: 0.95,
        },
        [
          col(posters.slice(0, 3), 40),
          col(posters.slice(3, 6), -60),
          col(posters.slice(6, 9), 90),
        ],
      )
    : null
  return frame([
    posters.length ? null : glow('-160px', '120px', 900, 0.3),
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

export type PartyCardInput = {
  headline: string
  detail: string
  // The last film played, when it has a poster to show.
  poster: string | null
}

// Pass the Globe: the whole card says whose turn it is, or who won. With a
// poster it sits left like a film card; without one the text takes the width.
export const partyCard = (input: PartyCardInput, mark: string | null): El => {
  const { size, lines } = fitTitle(input.headline)
  const textLeft = input.poster ? 530 : 80
  const textWidth = input.poster ? 600 : 1040
  const used = 56 + lines * size * 1.04 + 34 + 44 + 44 + 32
  const detailLines = Math.max(1, Math.min(2, Math.floor((540 - used) / 44)))
  return frame([
    stripe(),
    input.poster
      ? h(
          'div',
          {
            display: 'flex',
            position: 'absolute',
            left: 70,
            top: 45,
            width: 380,
            height: 540,
            borderRadius: 22,
            overflow: 'hidden',
          },
          [
            h(
              'img',
              { width: 380, height: 540, objectFit: 'cover' },
              undefined,
              { src: input.poster, width: 380, height: 540 },
            ),
          ],
        )
      : null,
    h(
      'div',
      {
        display: 'flex',
        flexDirection: 'column',
        position: 'absolute',
        left: textLeft,
        top: 45,
        width: textWidth,
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
            'PASS THE GLOBE',
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
            input.headline,
          ),
          h(
            'div',
            {
              display: 'block',
              fontSize: 36,
              lineHeight: 1.3,
              fontWeight: 500,
              color: MUTED,
              lineClamp: detailLines,
            },
            input.detail,
          ),
        ]),
        brand(mark),
      ],
    ),
  ])
}

// Photo-heavy cards stay flat: soft gradients and shadows are what PNG
// compresses worst, and they cost ~100 KB on a film card.
export const OG_SCALE = 0.6
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

// Builds a card at `k` of its design size and reports the canvas to draw on.
export const buildCard = (k: number, build: () => El) => {
  scale = k
  try {
    return {
      card: build(),
      width: Math.round(CARD_WIDTH * k),
      height: Math.round(CARD_HEIGHT * k),
    }
  } finally {
    scale = 1
  }
}
