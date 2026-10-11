import { describe, expect, it } from 'vitest'
import {
  PARTY_OFF,
  type PartyState,
  cleanName,
  currentPlayerIndex,
  currentRound,
  partyReducer,
  standings,
  weirdnessScore,
  winners,
} from './party-logic'

const started = (names = ['Ada', 'Bo'], rounds = 2): PartyState =>
  partyReducer(PARTY_OFF, { type: 'start', names, rounds })

const land = (state: PartyState, score: number, title = 'Film') =>
  partyReducer(state, {
    type: 'land',
    pick: { movieId: `${title}-${score}`, title, score },
  })

describe('weirdnessScore', () => {
  it('rates an obscure film far above a blockbuster', () => {
    const blockbuster = weirdnessScore({
      voteCount: 15_000,
      ratingValue: 8.1,
      genres: ['Action', 'Adventure'],
    })
    const obscure = weirdnessScore({
      voteCount: 7,
      ratingValue: 4.1,
      genres: ['Documentary', 'Music', 'History'],
    })
    expect(blockbuster).toBeLessThan(15)
    expect(obscure).toBeGreaterThan(85)
  })

  it('stays between 0 and 100 and copes with missing data', () => {
    const empty = weirdnessScore({
      voteCount: null,
      ratingValue: null,
      genres: [],
    })
    expect(empty).toBeGreaterThanOrEqual(0)
    expect(empty).toBeLessThanOrEqual(100)
    expect(
      weirdnessScore({ voteCount: 10_000_000, ratingValue: 9, genres: [] }),
    ).toBeGreaterThanOrEqual(0)
  })
})

describe('party game', () => {
  it('names empty players by their place', () => {
    expect(cleanName('  ', 2)).toBe('Player 3')
    expect(cleanName('  Maya  ', 0)).toBe('Maya')
    expect(cleanName('A'.repeat(40), 0).length).toBe(14)
  })

  it('needs at least two players to start', () => {
    expect(
      partyReducer(PARTY_OFF, { type: 'start', names: ['Ada'], rounds: 2 })
        .phase,
    ).toBe('off')
    expect(started().phase).toBe('turn')
  })

  it('goes round the table and ends after the last round', () => {
    let state = started(['Ada', 'Bo'], 2)
    const order: number[] = []
    for (let turn = 0; turn < 4; turn += 1) {
      order.push(currentPlayerIndex(state))
      state = land(state, 10 * (turn + 1))
      expect(state.phase).toBe('result')
      state = partyReducer(state, { type: 'next' })
    }
    expect(order).toEqual([0, 1, 0, 1])
    expect(state.phase).toBe('final')
  })

  it('shows the round number', () => {
    let state = started(['Ada', 'Bo'], 2)
    expect(currentRound(state)).toBe(1)
    state = partyReducer(land(land(state, 1), 1), { type: 'next' })
    state = partyReducer(land(state, 1), { type: 'next' })
    expect(currentRound(state)).toBe(2)
  })

  it('ignores a landing outside a turn', () => {
    const state = started()
    const after = land(state, 50)
    expect(land(after, 99)).toEqual(after)
  })

  it('crowns the highest total and shares a tie', () => {
    let state = started(['Ada', 'Bo'], 1)
    state = partyReducer(land(state, 40), { type: 'next' })
    state = partyReducer(land(state, 70), { type: 'next' })
    expect(state.phase).toBe('final')
    expect(winners(state.players)).toEqual([1])
    expect(standings(state.players)[0].player.name).toBe('Bo')

    let tie = started(['Ada', 'Bo'], 1)
    tie = partyReducer(land(tie, 55), { type: 'next' })
    tie = partyReducer(land(tie, 55), { type: 'next' })
    expect(winners(tie.players)).toEqual([0, 1])
  })

  it('plays again with the same people and clean scores', () => {
    let state = started(['Ada', 'Bo'], 1)
    state = partyReducer(land(state, 40), { type: 'next' })
    state = partyReducer(land(state, 70), { type: 'next' })
    const again = partyReducer(state, { type: 'again' })
    expect(again.phase).toBe('turn')
    expect(again.players.map((player) => player.name)).toEqual(['Ada', 'Bo'])
    expect(again.players.every((player) => player.picks.length === 0)).toBe(
      true,
    )
  })

  it('opens setup and closes back to nothing', () => {
    expect(partyReducer(PARTY_OFF, { type: 'open' }).phase).toBe('setup')
    expect(partyReducer(started(), { type: 'close' })).toEqual(PARTY_OFF)
  })
})
