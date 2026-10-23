// Pass the globe: a party game for a few people. They take turns flicking the
// globe (or shuffling); whatever it lands on is scored by how well they guess
// its year, its rating, or how the others take it. Then the game ends with one
// film to watch tonight. This file is the rules; nothing here touches the
// page, so the whole game can be played from a link (see party-link.ts).

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const MAX_NAME_LENGTH = 14
export const MAX_ROUNDS = 3
// Under this many votes a rating is too noisy to guess at.
export const MIN_RATING_VOTES = 50

export type PartyMode = 'year' | 'rating' | 'crowd' | 'mixed'
export type RoundMode = Exclude<PartyMode, 'mixed'>

export const PARTY_MODES: readonly PartyMode[] = [
  'year',
  'rating',
  'crowd',
  'mixed',
]

// The mixed game walks through the three modes, one per round.
const MIXED_ORDER: readonly RoundMode[] = ['year', 'rating', 'crowd']

// `round` counts from 1.
export const modeForRound = (mode: PartyMode, round: number): RoundMode =>
  mode === 'mixed'
    ? MIXED_ORDER[(Math.max(1, round) - 1) % MIXED_ORDER.length]
    : mode

// ---------------------------------------------------------------- scoring

export const scoreYear = (guess: number, actual: number) =>
  Math.max(0, 100 - 8 * Math.abs(guess - actual))

export const scoreRating = (guess: number, actual: number) =>
  Math.max(0, Math.round(100 - 25 * Math.abs(guess - actual)))

export const scoreCrowd = (yes: number, others: number) =>
  others ? Math.round((100 * yes) / others) : 0

// What the game needs to know about a landing.
export type PartyFilm = {
  id: string
  title: string
  year: number | null
  ratingValue: number | null
  voteCount: number | null
}

// A film with no year can't be guessed at in year mode, and one with a thin
// rating can't be in rating mode. Crowd mode takes anything.
export const isScorable = (film: PartyFilm, mode: RoundMode) =>
  mode === 'year'
    ? film.year !== null && film.year > 0
    : mode === 'rating'
      ? film.ratingValue !== null &&
        film.ratingValue > 0 &&
        (film.voteCount ?? 0) >= MIN_RATING_VOTES
      : true

// -------------------------------------------------------------------- game

// Who said yes and who has voted, one bit per player.
export type PartyVotes = { yes: number; voted: number }

export type PartyPick = {
  movieId: string
  title: string
  year: number | null
  rating: number | null
  mode: RoundMode
  guess?: number
  votes?: PartyVotes
  score: number
}

export type Player = { name: string; picks: PartyPick[] }

export type PartyPhase =
  | 'off'
  | 'setup'
  | 'turn'
  | 'guess'
  | 'vote'
  | 'result'
  | 'final'
  | 'settle'
  | 'tonight'

export type PartyState = {
  phase: PartyPhase
  mode: PartyMode
  players: Player[]
  rounds: number
  // End with the veto finale that picks tonight's film.
  settle: boolean
  // Passed around by link instead of one phone.
  online: boolean
  // How many turns have been played.
  turn: number
  // The landing waiting for a guess or for the others' votes.
  current: { film: PartyFilm; mode: RoundMode } | null
  // The landing that ended the latest turn.
  last: (PartyPick & { player: number }) | null
  // Shortlisted films that were vetoed, and the one chosen for tonight.
  vetoed: string[]
  tonight: string | null
  // A short line for the player ("No release date, flick again").
  notice: string | null
}

export const PARTY_OFF: PartyState = {
  phase: 'off',
  mode: 'year',
  players: [],
  rounds: 2,
  settle: true,
  online: false,
  turn: 0,
  current: null,
  last: null,
  vetoed: [],
  tonight: null,
  notice: null,
}

export type StartOptions = {
  names: string[]
  rounds: number
  mode: PartyMode
  settle: boolean
  online: boolean
}

export type PartyAction =
  | { type: 'open' }
  | { type: 'close' }
  | ({ type: 'start' } & StartOptions)
  | { type: 'land'; film: PartyFilm }
  | { type: 'guess'; value: number }
  | { type: 'vote'; yes: boolean[] }
  | { type: 'begin' }
  | { type: 'next' }
  | { type: 'settle' }
  | { type: 'veto'; movieId: string }
  | { type: 'pick'; movieId: string }
  | { type: 'again' }
  | { type: 'load'; state: PartyState }

export const cleanName = (name: string, index: number) =>
  name.trim().slice(0, MAX_NAME_LENGTH) || `Player ${index + 1}`

export const clampRounds = (rounds: number) =>
  Math.min(MAX_ROUNDS, Math.max(1, Math.round(rounds)))

type Shape = Pick<PartyState, 'players' | 'rounds'>

export const totalTurns = (state: Shape) => state.players.length * state.rounds

export const isFinished = (
  state: Pick<PartyState, 'players' | 'rounds' | 'turn'>,
) => state.turn >= totalTurns(state)

// Who is up, and which round it is, from how many turns have been played.
export const currentPlayerIndex = (state: PartyState) =>
  state.players.length ? state.turn % state.players.length : 0

export const currentRound = (state: PartyState) =>
  state.players.length
    ? Math.min(state.rounds, Math.floor(state.turn / state.players.length) + 1)
    : 1

export const currentRoundMode = (state: PartyState) =>
  modeForRound(state.mode, currentRound(state))

export const playerTotal = (player: Player) =>
  player.picks.reduce((sum, pick) => sum + pick.score, 0)

export const standings = (players: readonly Player[]) =>
  players
    .map((player, index) => ({ player, index, total: playerTotal(player) }))
    .sort((a, b) => b.total - a.total || a.index - b.index)

// Everyone on the top total (a tie is shared).
export const winners = (players: readonly Player[]) => {
  const ranked = standings(players)
  if (!ranked.length) return []
  const top = ranked[0].total
  return ranked.filter((entry) => entry.total === top).map((e) => e.index)
}

const allBits = (count: number) => (1 << count) - 1

const countBits = (mask: number) => {
  let count = 0
  for (let rest = mask; rest; rest &= rest - 1) count += 1
  return count
}

// ------------------------------------------------------------------- votes

// One vote someone has to cast. `pickIndex` is null for the landing that is
// still waiting on this phone (same-phone crowd mode).
export type VoteSlot = {
  owner: number
  pickIndex: number | null
  voter: number
}

// The picks in the order they were played, with who played each.
const playedPicks = (state: Shape) => {
  const count = state.players.length
  const rows: { pick: PartyPick; owner: number; order: number }[] = []
  for (let order = 0; order < count * state.rounds; order += 1) {
    const pick = state.players[order % count]?.picks[Math.floor(order / count)]
    if (pick) rows.push({ pick, owner: order % count, order })
  }
  return rows
}

// Crowd landings that someone hasn't voted on yet. Used when the game is
// passed by link: the votes come in on each player's own turn.
export const outstandingVotes = (state: Shape): VoteSlot[] => {
  const everyone = allBits(state.players.length)
  const slots: VoteSlot[] = []
  for (const { pick, owner, order } of playedPicks(state)) {
    if (pick.mode !== 'crowd' || !pick.votes) continue
    const missing = everyone & ~pick.votes.voted & ~(1 << owner)
    for (let voter = 0; voter < state.players.length; voter += 1) {
      if (missing & (1 << voter)) slots.push({ owner, pickIndex: order, voter })
    }
  }
  return slots
}

// After the last turn, whoever still owes votes goes first.
export const catchUpVoter = (state: Shape) => {
  const slots = outstandingVotes(state)
  return slots.length ? Math.min(...slots.map((slot) => slot.voter)) : null
}

// The votes the current player has to cast right now.
export const voteSlots = (state: PartyState): VoteSlot[] => {
  if (state.current) {
    const owner = currentPlayerIndex(state)
    return state.players
      .map((_, voter) => ({ owner, pickIndex: null, voter }))
      .filter((slot) => slot.voter !== owner)
  }
  const voter = isFinished(state)
    ? catchUpVoter(state)
    : currentPlayerIndex(state)
  return voter === null
    ? []
    : outstandingVotes(state).filter((slot) => slot.voter === voter)
}

// ------------------------------------------------------------------ finale

const bestPick = (player: Player) =>
  player.picks.reduce<PartyPick | null>(
    (best, pick) => (!best || pick.score > best.score ? pick : best),
    null,
  )

// Each player's best landing, with the same film listed once.
export const shortlist = (players: readonly Player[]) => {
  const seen = new Set<string>()
  const films: PartyPick[] = []
  for (const player of players) {
    const best = bestPick(player)
    if (!best || seen.has(best.movieId)) continue
    seen.add(best.movieId)
    films.push(best)
  }
  return films
}

// Who vetoes first: the lowest total goes first and the winner goes last, so
// the winner makes the final choice.
export const vetoOrder = (players: readonly Player[]) =>
  standings(players)
    .map((entry) => entry.index)
    .reverse()

export const remainingFilms = (state: PartyState) =>
  shortlist(state.players).filter(
    (pick) => !state.vetoed.includes(pick.movieId),
  )

// Who acts in the finale: a veto each until two films remain, then the winner
// picks between the last two.
export const settleActor = (state: PartyState) => {
  const order = vetoOrder(state.players)
  if (!order.length) return 0
  return remainingFilms(state).length > 2
    ? order[Math.min(state.vetoed.length, order.length - 1)]
    : order[order.length - 1]
}

// Whose move it is on the board, in any phase. Used to say who a link is for.
export const actorIndex = (state: PartyState) => {
  if (!isFinished(state)) return currentPlayerIndex(state)
  const voter = catchUpVoter(state)
  if (voter !== null) return voter
  if (state.tonight === null && state.settle) return settleActor(state)
  return winners(state.players)[0] ?? 0
}

// Where the game rests once a turn (or a catch-up vote) is done.
const restingPhase = (state: PartyState): PartyPhase => {
  if (!isFinished(state)) return 'turn'
  return catchUpVoter(state) === null ? 'final' : 'turn'
}

// ----------------------------------------------------------------- reducer

const withPick = (
  state: PartyState,
  index: number,
  pick: PartyPick,
): PartyState => ({
  ...state,
  phase: 'result',
  notice: null,
  current: null,
  players: state.players.map((player, at) =>
    at === index ? { ...player, picks: [...player.picks, pick] } : player,
  ),
  last: { ...pick, player: index },
})

const filmPick = (
  film: PartyFilm,
  mode: RoundMode,
): Omit<PartyPick, 'score'> => ({
  movieId: film.id,
  title: film.title,
  year: film.year,
  rating: film.ratingValue,
  mode,
})

export const partyReducer = (
  state: PartyState,
  action: PartyAction,
): PartyState => {
  switch (action.type) {
    case 'open':
      return state.phase === 'off' ? { ...PARTY_OFF, phase: 'setup' } : state
    case 'close':
      return PARTY_OFF
    case 'load':
      return action.state
    case 'start': {
      const names = action.names
        .slice(0, MAX_PLAYERS)
        .map((name, index) => cleanName(name, index))
      if (names.length < MIN_PLAYERS) return state
      return {
        ...PARTY_OFF,
        phase: 'turn',
        mode: PARTY_MODES.includes(action.mode) ? action.mode : 'year',
        players: names.map((name) => ({ name, picks: [] })),
        rounds: clampRounds(action.rounds),
        settle: action.settle,
        online: action.online,
      }
    }
    case 'land': {
      if (state.phase !== 'turn' || isFinished(state)) return state
      const mode = currentRoundMode(state)
      const { film } = action
      // A film that can't be scored gives a free re-flick.
      if (!isScorable(film, mode)) {
        return {
          ...state,
          notice:
            mode === 'year'
              ? `${film.title} has no release date. Flick again.`
              : `${film.title} has too few ratings. Flick again.`,
        }
      }
      if (mode === 'crowd' && state.online) {
        // Votes arrive as the others take their turns.
        return withPick(state, currentPlayerIndex(state), {
          ...filmPick(film, mode),
          votes: { yes: 0, voted: 0 },
          score: 0,
        })
      }
      return {
        ...state,
        phase: mode === 'crowd' ? 'vote' : 'guess',
        notice: null,
        current: { film, mode },
      }
    }
    case 'guess': {
      if (state.phase !== 'guess' || !state.current) return state
      const { film, mode } = state.current
      const value = Number.isFinite(action.value) ? action.value : 0
      const score =
        mode === 'year'
          ? scoreYear(value, film.year ?? 0)
          : scoreRating(value, film.ratingValue ?? 0)
      return withPick(state, currentPlayerIndex(state), {
        ...filmPick(film, mode),
        guess: value,
        score,
      })
    }
    case 'vote': {
      if (state.phase !== 'vote') return state
      const slots = voteSlots(state)
      if (!slots.length) return state
      if (state.current) {
        // Same phone: everyone else votes on this landing at once.
        const owner = currentPlayerIndex(state)
        let yes = 0
        let voted = 0
        slots.forEach((slot, at) => {
          voted |= 1 << slot.voter
          if (action.yes[at]) yes |= 1 << slot.voter
        })
        return withPick(state, owner, {
          ...filmPick(state.current.film, 'crowd'),
          votes: { yes, voted },
          score: scoreCrowd(countBits(yes), slots.length),
        })
      }
      // By link: the player votes on the landings they haven't seen yet.
      const others = state.players.length - 1
      const players = state.players.map((player, owner) => ({
        ...player,
        picks: player.picks.map((pick, index) => {
          if (!pick.votes) return pick
          const order = index * state.players.length + owner
          let { yes, voted } = pick.votes
          slots.forEach((slot, at) => {
            if (slot.pickIndex !== order) return
            voted |= 1 << slot.voter
            if (action.yes[at]) yes |= 1 << slot.voter
          })
          const done = countBits(voted) >= others
          return {
            ...pick,
            votes: { yes, voted },
            score: done ? scoreCrowd(countBits(yes), others) : 0,
          }
        }),
      }))
      const next = { ...state, players, notice: null }
      if (!isFinished(next)) return { ...next, phase: 'turn' }
      // The last votes are in: the game is over, or someone else still owes some.
      return catchUpVoter(next) === null
        ? { ...next, phase: 'final' }
        : { ...next, phase: 'result', last: null }
    }
    case 'begin': {
      // Online: the player named on the board takes their turn. Anything they
      // owe in votes comes first.
      if (state.phase !== 'turn') return state
      return voteSlots(state).length ? { ...state, phase: 'vote' } : state
    }
    case 'next': {
      if (state.phase !== 'result') return state
      if (!state.last) return { ...state, phase: restingPhase(state) }
      const next = { ...state, turn: state.turn + 1, last: null, current: null }
      return { ...next, phase: restingPhase(next) }
    }
    case 'settle': {
      if (state.phase !== 'final') return state
      const films = shortlist(state.players)
      if (!films.length) return state
      return films.length === 1
        ? { ...state, phase: 'tonight', tonight: films[0].movieId }
        : { ...state, phase: 'settle' }
    }
    case 'veto': {
      if (state.phase !== 'settle') return state
      const left = remainingFilms(state)
      if (left.length <= 2 || !left.some((p) => p.movieId === action.movieId))
        return state
      return { ...state, vetoed: [...state.vetoed, action.movieId] }
    }
    case 'pick': {
      if (state.phase !== 'settle') return state
      const left = remainingFilms(state)
      if (left.length !== 2 || !left.some((p) => p.movieId === action.movieId))
        return state
      return { ...state, phase: 'tonight', tonight: action.movieId }
    }
    case 'again':
      return state.phase === 'final' ||
        state.phase === 'settle' ||
        state.phase === 'tonight'
        ? {
            ...state,
            phase: 'turn',
            players: state.players.map((player) => ({
              name: player.name,
              picks: [],
            })),
            turn: 0,
            current: null,
            last: null,
            vetoed: [],
            tonight: null,
            notice: null,
          }
        : state
    default:
      return state
  }
}
