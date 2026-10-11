// Pass the globe: a party game for a few people on one screen. They take
// turns flicking the globe (or shuffling), whatever it lands on gets a
// weirdness score, and the highest total wins. This file is the rules; nothing
// here touches the page.

export type WeirdFilm = {
  voteCount: number | null
  ratingValue: number | null
  genres: readonly string[]
}

// Genres that make a film stand apart from the usual blockbuster.
const ODD_GENRES = new Set([
  'Documentary',
  'Music',
  'History',
  'Western',
  'War',
  'TV Movie',
  'Foreign',
  'Mystery',
  'Fantasy',
])

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// 0 to 100. Mostly how few people have rated it (obscure is weird), with a
// little for odd genres, a many-genre mash-up, and a rating at either extreme.
export const weirdnessScore = (film: WeirdFilm) => {
  const votes = Math.max(1, film.voteCount ?? 1)
  const most = Math.log10(20_000)
  const least = Math.log10(3)
  const rarity = clamp01((most - Math.log10(votes)) / (most - least))
  const odd = film.genres.filter((genre) => ODD_GENRES.has(genre)).length
  const mashup = film.genres.length >= 3 ? 1 : 0
  const extreme =
    film.ratingValue !== null &&
    (film.ratingValue < 4.5 || film.ratingValue > 8.6)
      ? 1
      : 0
  return Math.round(
    100 *
      clamp01(
        rarity * 0.7 + Math.min(odd, 2) * 0.08 + mashup * 0.06 + extreme * 0.08,
      ),
  )
}

// ------------------------------------------------------------------ game

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const MAX_NAME_LENGTH = 14

export type PartyPick = { movieId: string; title: string; score: number }

export type Player = { name: string; picks: PartyPick[] }

export type PartyPhase = 'off' | 'setup' | 'turn' | 'result' | 'final'

export type PartyState = {
  phase: PartyPhase
  players: Player[]
  rounds: number
  // How many turns have been played.
  turn: number
  // The landing that ended the latest turn.
  last: (PartyPick & { player: number }) | null
}

export const PARTY_OFF: PartyState = {
  phase: 'off',
  players: [],
  rounds: 2,
  turn: 0,
  last: null,
}

export type PartyAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'start'; names: string[]; rounds: number }
  | { type: 'land'; pick: PartyPick }
  | { type: 'next' }
  | { type: 'again' }

export const cleanName = (name: string, index: number) =>
  name.trim().slice(0, MAX_NAME_LENGTH) || `Player ${index + 1}`

export const totalTurns = (state: Pick<PartyState, 'players' | 'rounds'>) =>
  state.players.length * state.rounds

// Who is up, and which round it is, from how many turns have been played.
export const currentPlayerIndex = (state: PartyState) =>
  state.players.length ? state.turn % state.players.length : 0

export const currentRound = (state: PartyState) =>
  state.players.length
    ? Math.min(state.rounds, Math.floor(state.turn / state.players.length) + 1)
    : 1

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

export const partyReducer = (
  state: PartyState,
  action: PartyAction,
): PartyState => {
  switch (action.type) {
    case 'open':
      return state.phase === 'off' ? { ...PARTY_OFF, phase: 'setup' } : state
    case 'close':
      return PARTY_OFF
    case 'start': {
      const names = action.names
        .slice(0, MAX_PLAYERS)
        .map((name, index) => cleanName(name, index))
      if (names.length < MIN_PLAYERS) return state
      return {
        phase: 'turn',
        players: names.map((name) => ({ name, picks: [] })),
        rounds: Math.min(3, Math.max(1, Math.round(action.rounds))),
        turn: 0,
        last: null,
      }
    }
    case 'land': {
      if (state.phase !== 'turn') return state
      const index = currentPlayerIndex(state)
      const players = state.players.map((player, at) =>
        at === index
          ? { ...player, picks: [...player.picks, action.pick] }
          : player,
      )
      return {
        ...state,
        phase: 'result',
        players,
        last: { ...action.pick, player: index },
      }
    }
    case 'next': {
      if (state.phase !== 'result') return state
      const turn = state.turn + 1
      return turn >= totalTurns(state)
        ? { ...state, phase: 'final', turn }
        : { ...state, phase: 'turn', turn, last: null }
    }
    case 'again':
      return state.phase === 'final'
        ? {
            ...state,
            phase: 'turn',
            players: state.players.map((player) => ({
              name: player.name,
              picks: [],
            })),
            turn: 0,
            last: null,
          }
        : state
    default:
      return state
  }
}
