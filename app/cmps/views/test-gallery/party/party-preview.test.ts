import { describe, expect, it } from 'vitest'
import { previewForParty } from '../../../../../api/_lib/meta'
import { summarizePartyCode } from '../../../../../api/_lib/party-meta'
import { encodeParty, summarizeParty } from './party-link'
import type { PartyState } from './party-logic'

// The preview function in /api reads the same ?party= code the app writes.
// These run the app's own encoder to keep the two in step.
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
