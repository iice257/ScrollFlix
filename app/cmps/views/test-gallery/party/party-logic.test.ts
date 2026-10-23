import { describe, expect, it } from 'vitest'
import {
  PARTY_OFF,
  type PartyFilm,
  type PartyState,
  actorIndex,
  cleanName,
  currentPlayerIndex,
  currentRound,
  isScorable,
  modeForRound,
  outstandingVotes,
  partyReducer,
  scoreCrowd,
  scoreRating,
  scoreYear,
  settleActor,
  shortlist,
  standings,
  vetoOrder,
  voteSlots,
  winners,
} from './party-logic'

const film = (id: number, over: Partial<PartyFilm> = {}): PartyFilm => ({
  id: `c${id}`,
  title: `Film ${id}`,
  year: 1990 + (id % 30),
  ratingValue: 7,
  voteCount: 500,
  ...over,
})

type Setup = Partial<{
  names: string[]
  rounds: number
  mode: 'year' | 'rating' | 'crowd' | 'mixed'
  settle: boolean
  online: boolean
}>

const started = (setup: Setup = {}): PartyState =>
  partyReducer(PARTY_OFF, {
    type: 'start',
    names: setup.names ?? ['Ada', 'Bo'],
    rounds: setup.rounds ?? 2,
    mode: setup.mode ?? 'year',
    settle: setup.settle ?? true,
    online: setup.online ?? false,
  })

// Plays one whole turn in a year or rating game with the given guess.
const playGuess = (state: PartyState, id: number, value: number) => {
  const landed = partyReducer(state, { type: 'land', film: film(id) })
  const guessed = partyReducer(landed, { type: 'guess', value })
  return partyReducer(guessed, { type: 'next' })
}

describe('scoring', () => {
  it('scores a year by distance, never below zero', () => {
    expect(scoreYear(1999, 1999)).toBe(100)
    expect(scoreYear(2001, 1999)).toBe(84)
    expect(scoreYear(1980, 1999)).toBe(0)
    expect(scoreYear(1900, 1999)).toBe(0)
  })

  it('scores a rating in half steps', () => {
    expect(scoreRating(7.5, 7.5)).toBe(100)
    expect(scoreRating(7, 7.5)).toBe(88)
    expect(scoreRating(1, 8.1)).toBe(0)
  })

  it('scores the crowd as a share of the others', () => {
    expect(scoreCrowd(2, 3)).toBe(67)
    expect(scoreCrowd(3, 3)).toBe(100)
    expect(scoreCrowd(0, 3)).toBe(0)
    expect(scoreCrowd(0, 0)).toBe(0)
  })
})

describe('modeForRound', () => {
  it('rotates year, rating, crowd in a mixed game', () => {
    expect([1, 2, 3, 4].map((round) => modeForRound('mixed', round))).toEqual([
      'year',
      'rating',
      'crowd',
      'year',
    ])
  })

  it('keeps a single mode fixed', () => {
    expect(modeForRound('rating', 3)).toBe('rating')
  })
})

describe('isScorable', () => {
  it('needs a year for the year game', () => {
    expect(isScorable(film(1, { year: null }), 'year')).toBe(false)
    expect(isScorable(film(1), 'year')).toBe(true)
  })

  it('needs a solid rating for the rating game', () => {
    expect(isScorable(film(1, { ratingValue: null }), 'rating')).toBe(false)
    expect(isScorable(film(1, { voteCount: 49 }), 'rating')).toBe(false)
    expect(isScorable(film(1, { voteCount: 50 }), 'rating')).toBe(true)
  })

  it('takes anything for the crowd game', () => {
    expect(
      isScorable(film(1, { year: null, ratingValue: null }), 'crowd'),
    ).toBe(true)
  })
})

describe('turn flow', () => {
  it('opens setup and closes it again', () => {
    const open = partyReducer(PARTY_OFF, { type: 'open' })
    expect(open.phase).toBe('setup')
    expect(partyReducer(open, { type: 'close' })).toEqual(PARTY_OFF)
  })

  it('needs two players to start', () => {
    const state = partyReducer(PARTY_OFF, {
      type: 'start',
      names: ['Solo'],
      rounds: 2,
      mode: 'year',
      settle: true,
      online: false,
    })
    expect(state.phase).toBe('off')
  })

  it('tidies names and caps rounds', () => {
    const state = started({ names: ['  Ada ', ''], rounds: 9 })
    expect(state.players.map((p) => p.name)).toEqual(['Ada', 'Player 2'])
    expect(state.rounds).toBe(3)
    expect(cleanName('x'.repeat(30), 0)).toHaveLength(14)
  })

  it('goes turn, guess, result, turn', () => {
    const turn = started()
    const guess = partyReducer(turn, { type: 'land', film: film(5) })
    expect(guess.phase).toBe('guess')
    const result = partyReducer(guess, { type: 'guess', value: 1995 })
    expect(result.phase).toBe('result')
    expect(result.last).toMatchObject({ player: 0, mode: 'year', guess: 1995 })
    const next = partyReducer(result, { type: 'next' })
    expect(next.phase).toBe('turn')
    expect(currentPlayerIndex(next)).toBe(1)
  })

  it('ignores a landing or guess in the wrong phase', () => {
    const turn = started()
    expect(partyReducer(turn, { type: 'guess', value: 1990 })).toBe(turn)
    expect(partyReducer(turn, { type: 'next' })).toBe(turn)
  })

  it('gives a free re-flick for a film it cannot score', () => {
    const turn = started()
    const again = partyReducer(turn, {
      type: 'land',
      film: film(5, { year: null }),
    })
    expect(again.phase).toBe('turn')
    expect(again.turn).toBe(0)
    expect(again.notice).toMatch(/Flick again/)
    expect(again.players[0].picks).toHaveLength(0)
  })

  it('takes the crowd vote on one phone', () => {
    const turn = started({ names: ['A', 'B', 'C'], mode: 'crowd' })
    const vote = partyReducer(turn, { type: 'land', film: film(5) })
    expect(vote.phase).toBe('vote')
    const slots = voteSlots(vote)
    expect(slots.map((slot) => slot.voter)).toEqual([1, 2])
    const result = partyReducer(vote, { type: 'vote', yes: [true, false] })
    expect(result.phase).toBe('result')
    expect(result.last?.score).toBe(50)
    expect(result.last?.votes).toEqual({ yes: 0b010, voted: 0b110 })
  })

  it('rotates the mode through a mixed game', () => {
    let state = started({ mode: 'mixed', rounds: 3 })
    const seen: string[] = []
    for (let turn = 0; turn < 6; turn += 1) {
      const landed = partyReducer(state, { type: 'land', film: film(turn + 1) })
      seen.push(landed.phase)
      state =
        landed.phase === 'vote'
          ? partyReducer(landed, { type: 'vote', yes: [true] })
          : partyReducer(landed, { type: 'guess', value: 7 })
      state = partyReducer(state, { type: 'next' })
    }
    expect(seen).toEqual(['guess', 'guess', 'guess', 'guess', 'vote', 'vote'])
    expect(currentRound(started({ mode: 'mixed' }))).toBe(1)
  })

  it('reaches the final after the last turn', () => {
    let state = started({ rounds: 1 })
    state = playGuess(state, 1, 1991)
    expect(state.phase).toBe('turn')
    state = playGuess(state, 2, 2000)
    expect(state.phase).toBe('final')
    expect(state.turn).toBe(2)
  })

  it('plays again with the same setup', () => {
    let state = started({ rounds: 1, mode: 'rating' })
    state = playGuess(state, 1, 7)
    state = playGuess(state, 2, 7)
    const again = partyReducer(state, { type: 'again' })
    expect(again.phase).toBe('turn')
    expect(again.mode).toBe('rating')
    expect(again.players.every((p) => p.picks.length === 0)).toBe(true)
  })
})

describe('standings', () => {
  const players = [
    { name: 'A', score: 10 },
    { name: 'B', score: 40 },
    { name: 'C', score: 40 },
  ].map((p) => ({
    name: p.name,
    picks: [
      {
        movieId: `c${p.name}`,
        title: p.name,
        year: 2000,
        rating: 7,
        mode: 'year' as const,
        guess: 2000,
        score: p.score,
      },
    ],
  }))

  it('ranks by total and shares a tie', () => {
    expect(standings(players).map((entry) => entry.index)).toEqual([1, 2, 0])
    expect(winners(players)).toEqual([1, 2])
  })

  it('orders the veto from the lowest total, the winner last', () => {
    expect(vetoOrder(players)).toEqual([0, 2, 1])
  })
})

// A finished one-round game where each player's score is given. A year guess
// n off scores 100 - 8n.
const finished = (scores: number[], ids: number[], settle = true) => {
  let state = started({
    names: scores.map((_, i) => `P${i}`),
    rounds: 1,
    settle,
  })
  scores.forEach((score, i) => {
    const off = (100 - score) / 8
    const landed = partyReducer(state, { type: 'land', film: film(ids[i]) })
    const year = landed.current?.film.year ?? 0
    state = partyReducer(
      partyReducer(landed, { type: 'guess', value: year + off }),
      { type: 'next' },
    )
  })
  return state
}

describe('settle it', () => {
  it('builds the shortlist from best picks without duplicates', () => {
    const state = finished([80, 60, 40], [1, 1, 3])
    expect(shortlist(state.players).map((p) => p.movieId)).toEqual(['c1', 'c3'])
  })

  it('skips straight to tonight for a single film', () => {
    const state = finished([80, 60], [7, 7])
    const settled = partyReducer(state, { type: 'settle' })
    expect(settled.phase).toBe('tonight')
    expect(settled.tonight).toBe('c7')
  })

  it('has the last place veto first and the winner choose last', () => {
    const state = finished([60, 90, 20, 40], [1, 2, 3, 4])
    expect(state.phase).toBe('final')
    let game = partyReducer(state, { type: 'settle' })
    expect(game.phase).toBe('settle')
    expect(settleActor(game)).toBe(2)
    game = partyReducer(game, { type: 'veto', movieId: 'c3' })
    expect(settleActor(game)).toBe(3)
    game = partyReducer(game, { type: 'veto', movieId: 'c4' })
    // Two films left: the winner (P1) picks.
    expect(settleActor(game)).toBe(1)
    expect(partyReducer(game, { type: 'veto', movieId: 'c1' })).toBe(game)
    const done = partyReducer(game, { type: 'pick', movieId: 'c1' })
    expect(done.phase).toBe('tonight')
    expect(done.tonight).toBe('c1')
  })

  it('breaks a tie for the order by the earliest index winning last', () => {
    const state = finished([50, 50, 10], [1, 2, 3])
    expect(vetoOrder(state.players)).toEqual([2, 1, 0])
    const game = partyReducer(state, { type: 'settle' })
    expect(settleActor(game)).toBe(2)
  })

  it('rejects a veto of a film that is not on the shortlist', () => {
    const game = partyReducer(finished([60, 90, 20], [1, 2, 3]), {
      type: 'settle',
    })
    expect(partyReducer(game, { type: 'veto', movieId: 'c99' })).toBe(game)
  })

  it('names the actor on the board', () => {
    const state = finished([60, 90, 20], [1, 2, 3])
    expect(actorIndex(state)).toBe(2)
    expect(actorIndex(finished([60, 90], [1, 2], false))).toBe(1)
  })
})

describe('crowd votes passed by link', () => {
  const online = (names = ['A', 'B', 'C']) =>
    started({ names, mode: 'crowd', rounds: 1, online: true })

  it('records a landing and waits for the votes', () => {
    const result = partyReducer(online(), { type: 'land', film: film(5) })
    expect(result.phase).toBe('result')
    expect(result.last?.score).toBe(0)
    expect(result.last?.votes).toEqual({ yes: 0, voted: 0 })
  })

  it('asks each player for their votes on their own turn', () => {
    let state = partyReducer(online(), { type: 'land', film: film(5) })
    state = partyReducer(state, { type: 'next' })
    expect(currentPlayerIndex(state)).toBe(1)
    expect(voteSlots(state)).toHaveLength(1)
    state = partyReducer(state, { type: 'begin' })
    expect(state.phase).toBe('vote')
    state = partyReducer(state, { type: 'vote', yes: [true] })
    expect(state.phase).toBe('turn')
    expect(state.players[0].picks[0].votes).toEqual({
      yes: 0b010,
      voted: 0b010,
    })
    // Not everyone has voted yet, so no score.
    expect(state.players[0].picks[0].score).toBe(0)
  })

  it('lets the last voters catch up before the final', () => {
    let state = online(['A', 'B'])
    state = partyReducer(state, { type: 'land', film: film(1) })
    state = partyReducer(state, { type: 'next' })
    state = partyReducer(state, { type: 'begin' })
    state = partyReducer(state, { type: 'vote', yes: [true] })
    expect(state.players[0].picks[0].score).toBe(100)
    state = partyReducer(state, { type: 'land', film: film(2) })
    state = partyReducer(state, { type: 'next' })
    // The game is over but A has not voted on B's landing.
    expect(state.phase).toBe('turn')
    expect(outstandingVotes(state)).toHaveLength(1)
    expect(actorIndex(state)).toBe(0)
    state = partyReducer(state, { type: 'begin' })
    state = partyReducer(state, { type: 'vote', yes: [false] })
    expect(state.phase).toBe('final')
    expect(state.players[1].picks[0].score).toBe(0)
  })
})
