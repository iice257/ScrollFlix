import { describe, expect, it } from 'vitest'
import {
  decodeParty,
  encodeParty,
  partyUrl,
  summarizeParty,
} from './party-link'
import {
  PARTY_OFF,
  type PartyFilm,
  type PartyMode,
  type PartyState,
  partyReducer,
} from './party-logic'

const film = (id: number): PartyFilm => ({
  id: `c${id}`,
  title: `Film ${id}`,
  year: 1980 + (id % 40),
  ratingValue: 7.5,
  voteCount: 900,
})

const lookup = (id: number) => ({
  title: `Film ${id}`,
  year: 1980 + (id % 40),
  rating: 7.5,
})

// One whole turn, whatever the mode asks for.
const play = (state: PartyState, id: number): PartyState => {
  let next = partyReducer(state, { type: 'land', film: film(id) })
  if (next.phase === 'vote') {
    const yes = next.players.slice(1).map(() => true)
    next = partyReducer(next, { type: 'vote', yes })
  } else if (next.phase === 'guess') {
    const value = next.current?.mode === 'rating' ? 7 : 1990
    next = partyReducer(next, { type: 'guess', value })
  }
  return partyReducer(next, { type: 'next' })
}

const start = (names: string[], rounds: number, mode: PartyMode = 'year') =>
  partyReducer(PARTY_OFF, {
    type: 'start',
    names,
    rounds,
    mode,
    settle: true,
    online: true,
  })

const fromCode = (code: string) =>
  JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')))
const toCode = (data: unknown) =>
  btoa(JSON.stringify(data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

describe('party link codec', () => {
  it('round trips a game in progress', () => {
    let state = start(['Ada', 'Bo', 'Cy'], 2, 'mixed')
    for (const id of [101, 202, 303, 404]) state = play(state, id)
    const decoded = decodeParty(encodeParty(state), lookup)
    expect('error' in decoded).toBe(false)
    expect(decoded).toEqual({ ...state, online: true, phase: 'turn' })
  })

  it('round trips the finale and tonight', () => {
    let state = start(['Ada', 'Bo', 'Cy'], 1)
    for (const id of [101, 202, 303]) state = play(state, id)
    expect(state.phase).toBe('final')
    const final = decodeParty(encodeParty(state), lookup) as PartyState
    expect(final.phase).toBe('final')
    let game = partyReducer(final, { type: 'settle' })
    game = partyReducer(game, { type: 'veto', movieId: 'c101' })
    const mid = decodeParty(encodeParty(game), lookup) as PartyState
    expect(mid.phase).toBe('settle')
    expect(mid.vetoed).toEqual(game.vetoed)
    game = partyReducer(game, { type: 'pick', movieId: 'c202' })
    const tonight = decodeParty(encodeParty(game), lookup) as PartyState
    expect(tonight.phase).toBe('tonight')
    expect(tonight.tonight).toBe('c202')
  })

  it('keeps crowd votes through the link', () => {
    let state = start(['Ada', 'Bo'], 1, 'crowd')
    state = partyReducer(state, { type: 'land', film: film(7) })
    state = partyReducer(state, { type: 'next' })
    const decoded = decodeParty(encodeParty(state), lookup) as PartyState
    expect(decoded.players[0].picks[0].votes).toEqual({ yes: 0, voted: 0 })
  })

  it('keeps six players over three rounds under 1,500 characters', () => {
    const names = [
      'Alexandra',
      'Bartholomew',
      'Christopher',
      'Dominique',
      'Evangeline',
      'Ferdinand-Ja',
    ]
    let state = start(names, 3, 'mixed')
    for (let i = 0; i < 18; i += 1) state = play(state, 1_000_000 + i * 997)
    // The crowd round's last votes are still owed, so it waits for them.
    expect(state.phase).toBe('turn')
    expect(encodeParty(state).length).toBeLessThan(1500)
  })

  it('refuses garbage, tampering and newer versions without throwing', () => {
    expect(decodeParty('')).toEqual({ error: 'broken' })
    expect(decodeParty('not a link!!')).toEqual({ error: 'broken' })
    expect(decodeParty('aGVsbG8gd29ybGQ')).toEqual({ error: 'broken' })
    const code = encodeParty(start(['Ada', 'Bo'], 1))
    expect(decodeParty(code.slice(0, -6))).toEqual({ error: 'broken' })
    expect(decodeParty(toCode({ v: 2 }))).toEqual({ error: 'newer' })
    const bad = (patch: object) => toCode({ ...fromCode(code), ...patch })
    const broken = { error: 'broken' }
    expect(decodeParty(bad({ p: ['Solo'] }))).toEqual(broken)
    expect(decodeParty(bad({ r: 9 }))).toEqual(broken)
    expect(decodeParty(bad({ m: 'weird' }))).toEqual(broken)
    expect(decodeParty(bad({ p: ['A'.repeat(40), 'B'] }))).toEqual(broken)
    expect(
      decodeParty(
        bad({
          t: [
            [1, 1, 1990, null, 50],
            [2, 1, 1990, null, 50],
            [3, 2, 1990, null, 50],
          ],
        }),
      ),
    ).toEqual(broken)
    expect(decodeParty(bad({ w: 5 }))).toEqual(broken)
    expect(decodeParty(bad({ k: 4 }))).toEqual(broken)
  })

  it('builds a url with only the party parameter', () => {
    const state = start(['Ada', 'Bo'], 1)
    const url = partyUrl(state, 'https://scrollflix.app/?film=1#x')
    const parsed = new URL(url)
    expect([...parsed.searchParams.keys()]).toEqual(['party'])
    expect(parsed.hash).toBe('')
  })

  it('summarises for a link preview', () => {
    let state = start(['Ada', 'Bo'], 2)
    state = play(state, 101)
    const summary = summarizeParty(state)
    expect(summary.headline).toBe('Your turn, Bo')
    expect(summary.detail).toBe('Ada leads with 12 · Round 1 of 2')
    expect(summary.lastTmdbId).toBe('101')
  })
})

describe('player pictures', () => {
  const pictured = (): PartyState =>
    partyReducer(PARTY_OFF, {
      type: 'start',
      names: ['Ada', 'Bo'],
      avatars: ['c603', null],
      rounds: 1,
      mode: 'year',
      settle: true,
      online: true,
    })

  it('start keeps the film each player chose', () => {
    expect(pictured().players.map((player) => player.avatar)).toEqual([
      'c603',
      undefined,
    ])
  })

  it('travel in the link and come back', () => {
    const decoded = decodeParty(encodeParty(pictured()), lookup)
    if ('error' in decoded) throw new Error('should decode')
    expect(decoded.players.map((player) => player.avatar)).toEqual([
      'c603',
      undefined,
    ])
  })

  it('leave a link without any unchanged from before pictures', () => {
    const plain = start(['Ada', 'Bo'], 1)
    expect(fromCode(encodeParty(plain))).not.toHaveProperty('a')
  })

  it('are checked, so a link cannot smuggle in nonsense', () => {
    const data = fromCode(encodeParty(pictured()))
    for (const a of [[1], [1, -4], 'x', [1.5, 2]])
      expect(decodeParty(toCode({ ...data, a }), lookup)).toEqual({
        error: 'broken',
      })
  })

  it('stay with a player when the game is played again', () => {
    let state = pictured()
    state = { ...state, phase: 'final', turn: 2 }
    const again = partyReducer(state, { type: 'again' })
    expect(again.players[0].avatar).toBe('c603')
  })
})
