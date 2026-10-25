import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from '@vercel/og'
import { describe, expect, it } from 'vitest'
import {
  encodeParty,
  summarizeParty,
} from '../../app/cmps/views/test-gallery/party/party-link'
import type { PartyState } from '../../app/cmps/views/test-gallery/party/party-logic'
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  previewForParty,
  renderMetaHtml,
} from './meta'
import {
  OG_SCALE,
  buildCard,
  defaultCard,
  filmCard,
  partyCard,
} from './og-cards'
import { interFonts } from './og-fonts'
import { MARK_DATA_URI } from './og-mark'
import { summarizePartyCode } from './party-meta'

// WhatsApp drops preview images much over ~300 KB.
const LIMIT = 300_000

const poster = `data:image/jpeg;base64,${readFileSync(
  join(process.cwd(), 'api/_lib/fixtures/poster-342.jpg'),
).toString('base64')}`

const film = {
  title: 'The Lord of the Rings: The Return of the King',
  year: '2003',
  rating: 8.5,
  posterPath: null,
  overview:
    'Aragorn is revealed as the heir to the ancient kings as he, Gandalf and the other members of the broken fellowship struggle to save Gondor from Sauron’s forces.',
}

const png = async (built: ReturnType<typeof buildCard>) => {
  const res = new ImageResponse(built.card as never, {
    width: built.width,
    height: built.height,
    fonts: interFonts(),
  })
  return Buffer.from(await res.arrayBuffer())
}

describe('share card images', () => {
  it('draws at the size the tags promise', () => {
    const built = buildCard(OG_SCALE, () =>
      filmCard(film, poster, MARK_DATA_URI),
    )
    expect(built.width).toBe(OG_IMAGE_WIDTH)
    expect(built.height).toBe(OG_IMAGE_HEIGHT)
    expect(
      renderMetaHtml(
        previewForParty(new URL('https://x.test/?party=eyJ2IjoxfQ')) ?? {
          title: 't',
          description: 'd',
          image: 'i',
          imageAlt: 'a',
          url: 'u',
        },
      ),
    ).toContain(`og:image:width" content="${OG_IMAGE_WIDTH}"`)
  })

  it('keeps a film card under the WhatsApp limit', async () => {
    const bytes = await png(
      buildCard(OG_SCALE, () => filmCard(film, poster, MARK_DATA_URI)),
    )
    expect(bytes.subarray(1, 4).toString()).toBe('PNG')
    expect(bytes.length).toBeLessThan(LIMIT)
  }, 30000)

  it('keeps a party card with a poster under the limit', async () => {
    const bytes = await png(
      buildCard(OG_SCALE, () =>
        partyCard(
          {
            headline: 'Your turn, Maya',
            detail: 'Sam leads with 182 · Round 2 of 3',
            poster,
          },
          MARK_DATA_URI,
        ),
      ),
    )
    expect(bytes.length).toBeLessThan(LIMIT)
  }, 30000)

  it('keeps the home card under the limit even with a poster wall', async () => {
    const bytes = await png(
      buildCard(OG_SCALE, () =>
        defaultCard(
          Array.from({ length: 6 }, () => poster),
          MARK_DATA_URI,
        ),
      ),
    )
    expect(bytes.length).toBeLessThan(LIMIT)
  }, 30000)
})

const state = (over: Partial<PartyState> = {}): PartyState => {
  const pick = (id: number, score: number, guess: number) => ({
    movieId: `c${id}`,
    title: 'A film',
    year: null,
    rating: null,
    mode: 'year' as const,
    guess,
    score,
  })
  return {
    phase: 'turn',
    mode: 'year',
    players: [
      { name: 'Maya', picks: [pick(603, 40, 1999)] },
      { name: 'Sam', picks: [pick(27205, 70, 2010)] },
    ],
    rounds: 1,
    settle: false,
    online: true,
    turn: 2,
    current: null,
    last: null,
    vetoed: [],
    tonight: null,
    notice: null,
    ...over,
  } as PartyState
}

describe('party previews', () => {
  it('says the same as the app for a finished game', () => {
    const s = state()
    const mine = summarizePartyCode(encodeParty(s))
    const app = summarizeParty(s)
    expect(mine?.headline).toBe(app.headline)
    expect(mine?.detail).toBe(app.detail)
    expect(mine?.lastTmdbId).toBe(app.lastTmdbId)
  })

  it('says whose turn it is mid-game', () => {
    const s = state({
      rounds: 2,
      turn: 2,
    })
    const mine = summarizePartyCode(encodeParty(s))
    const app = summarizeParty(s)
    expect(mine?.headline).toBe(app.headline)
    expect(mine?.detail).toBe(app.detail)
  })

  it('rejects junk codes', () => {
    expect(summarizePartyCode('not a code')).toBeNull()
    expect(summarizePartyCode('AAAAAAAAAAAA')).toBeNull()
    expect(
      previewForParty(new URL('https://x.test/?party=%3Cscript%3E')),
    ).toBeNull()
  })

  it('builds tags that point at the party card', () => {
    const code = encodeParty(state())
    const p = previewForParty(new URL(`https://x.test/?party=${code}`))
    expect(p?.image).toBe(`https://x.test/api/og?kind=party&code=${code}`)
    expect(p?.url).toBe(`https://x.test/?party=${code}`)
    expect(p?.title).toContain('Pass the Globe')
  })
})
