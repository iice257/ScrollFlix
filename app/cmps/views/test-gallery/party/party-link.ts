// Pass the globe by link: the whole game lives in the address, so a game can
// be passed through any chat app with no server. The payload is small, versioned
// JSON turned into base64url. Titles are not in it; they are looked up from
// the catalogue by TMDB id, which keeps a six-player game well under 1,500
// characters. Nothing here touches React or the page.

import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_PLAYERS,
  PARTY_MODES,
  type PartyMode,
  type PartyPhase,
  type PartyPick,
  type PartyState,
  actorIndex,
  isFinished,
  modeForRound,
  outstandingVotes,
  playerTotal,
  remainingFilms,
  shortlist,
  standings,
  winners,
} from './party-logic'

const VERSION = 1
const VOTED_SHIFT = 6

type Payload = {
  v: number
  m: PartyMode
  r: number
  s: 0 | 1
  p: string[]
  // The film each player chose as their picture: its TMDB id, 0 for none.
  // Absent in links made before pictures existed.
  a?: number[]
  // One row per turn, in play order: TMDB id, round, guess, votes, score.
  t: [number, number, number | null, number | null, number][]
  x: number[]
  w: number | null
  // How many votes are still owed. Decoding checks it matches the picks.
  k: number
}

export type PartyLinkError = { error: 'broken' | 'newer' }

// What the catalogue knows about a film, so a link doesn't have to carry it.
export type FilmLookup = (
  tmdbId: number,
) => { title: string; year: number | null; rating: number | null } | undefined

const tmdbOf = (movieId: string) => Number(movieId.replace(/^c/, ''))

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (code: string) => {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export const encodeParty = (state: PartyState): string => {
  const count = state.players.length
  const rows: Payload['t'] = []
  for (let order = 0; order < count * state.rounds; order += 1) {
    const pick = state.players[order % count]?.picks[Math.floor(order / count)]
    if (!pick) break
    rows.push([
      tmdbOf(pick.movieId),
      Math.floor(order / count) + 1,
      pick.guess ?? null,
      pick.votes ? pick.votes.yes | (pick.votes.voted << VOTED_SHIFT) : null,
      pick.score,
    ])
  }
  const payload: Payload = {
    v: VERSION,
    m: state.mode,
    r: state.rounds,
    s: state.settle ? 1 : 0,
    p: state.players.map((player) => player.name),
    ...(state.players.some((player) => player.avatar)
      ? {
          a: state.players.map((player) =>
            player.avatar ? tmdbOf(player.avatar) : 0,
          ),
        }
      : {}),
    t: rows,
    x: state.vetoed.map(tmdbOf),
    w: state.tonight === null ? null : tmdbOf(state.tonight),
    k: outstandingVotes(state).length,
  }
  return toBase64Url(JSON.stringify(payload))
}

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

const unresolved = { title: 'A film', year: null, rating: null }

export const decodeParty = (
  code: string,
  lookup?: FilmLookup,
): PartyState | PartyLinkError => {
  const broken: PartyLinkError = { error: 'broken' }
  try {
    if (!/^[A-Za-z0-9_-]{8,4000}$/.test(code)) return broken
    const raw: unknown = JSON.parse(fromBase64Url(code))
    if (!raw || typeof raw !== 'object') return broken
    const data = raw as Record<string, unknown>
    if (isInt(data.v) && data.v > VERSION) return { error: 'newer' }
    if (data.v !== VERSION) return broken

    const { m, r, s, p, t, x, w, k, a } = data
    if (typeof m !== 'string' || !PARTY_MODES.includes(m as PartyMode))
      return broken
    if (!isInt(r) || r < 1 || r > MAX_ROUNDS) return broken
    if (s !== 0 && s !== 1) return broken
    if (!Array.isArray(p) || p.length < MIN_PLAYERS || p.length > MAX_PLAYERS)
      return broken
    if (
      !p.every(
        (name) =>
          typeof name === 'string' &&
          name.length > 0 &&
          name.length <= MAX_NAME_LENGTH,
      )
    )
      return broken
    if (!Array.isArray(t) || t.length > p.length * r) return broken
    if (!Array.isArray(x) || !x.every((id) => isInt(id) && id > 0))
      return broken
    if (w !== null && !(isInt(w) && w > 0)) return broken
    if (!isInt(k) || k < 0) return broken
    if (
      a !== undefined &&
      !(
        Array.isArray(a) &&
        a.length === p.length &&
        a.every((id) => isInt(id) && id >= 0)
      )
    )
      return broken

    const mode = m as PartyMode
    const everyone = (1 << p.length) - 1
    const avatars = (a as number[] | undefined) ?? []
    const players = (p as string[]).map((name, at) => ({
      name,
      picks: [] as PartyPick[],
      ...(avatars[at] ? { avatar: `c${avatars[at]}` } : {}),
    }))

    for (let order = 0; order < t.length; order += 1) {
      const row: unknown = t[order]
      if (!Array.isArray(row) || row.length !== 5) return broken
      const [id, round, guess, mask, score] = row as unknown[]
      const owner = order % p.length
      if (!isInt(id) || id <= 0) return broken
      if (round !== Math.floor(order / p.length) + 1) return broken
      if (!isInt(score) || score < 0 || score > 100) return broken
      const roundMode = modeForRound(mode, round as number)
      let votes: PartyPick['votes']
      if (roundMode === 'crowd') {
        if (guess !== null || !isInt(mask) || mask < 0) return broken
        const yes = mask & ((1 << VOTED_SHIFT) - 1)
        const voted = mask >> VOTED_SHIFT
        if ((yes & ~voted) !== 0) return broken
        if ((voted & ~everyone) !== 0 || (voted & (1 << owner)) !== 0)
          return broken
        votes = { yes, voted }
      } else {
        if (mask !== null) return broken
        if (typeof guess !== 'number' || !Number.isFinite(guess)) return broken
        if (
          roundMode === 'year' &&
          !(isInt(guess) && guess >= 1800 && guess <= 2200)
        )
          return broken
        if (
          roundMode === 'rating' &&
          !(guess >= 0 && guess <= 10 && (guess * 2) % 1 === 0)
        )
          return broken
      }
      const film = lookup?.(id) ?? unresolved
      players[owner].picks.push({
        movieId: `c${id}`,
        title: film.title,
        year: film.year,
        rating: film.rating,
        mode: roundMode,
        ...(typeof guess === 'number' ? { guess } : {}),
        ...(votes ? { votes } : {}),
        score,
      })
    }

    const state: PartyState = {
      phase: 'turn',
      mode,
      players,
      rounds: r,
      settle: s === 1,
      online: true,
      turn: t.length,
      current: null,
      last: null,
      vetoed: (x as number[]).map((id) => `c${id}`),
      tonight: w === null ? null : `c${w}`,
      notice: null,
    }

    // The links are only made between turns, so a count that doesn't match the
    // picks means the link was cut short or edited.
    if (outstandingVotes(state).length !== k) return broken

    const list = shortlist(players)
    const ids = new Set(list.map((pick) => pick.movieId))
    if (!state.vetoed.every((id) => ids.has(id))) return broken
    if (new Set(state.vetoed).size !== state.vetoed.length) return broken
    if (state.tonight !== null && !ids.has(state.tonight)) return broken
    if (state.vetoed.length > 0 || state.tonight !== null) {
      if (!isFinished(state) || outstandingVotes(state).length) return broken
      if (list.length - state.vetoed.length < 2 && state.tonight === null)
        return broken
    }

    return { ...state, phase: restingPhaseOf(state) }
  } catch {
    return broken
  }
}

const restingPhaseOf = (state: PartyState): PartyPhase => {
  if (state.tonight !== null) return 'tonight'
  if (!isFinished(state) || outstandingVotes(state).length) return 'turn'
  return state.vetoed.length > 0 && remainingFilms(state).length >= 2
    ? 'settle'
    : 'final'
}

export const partyUrl = (state: PartyState, base?: string) => {
  const url = new URL(base ?? window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('party', encodeParty(state))
  return url.toString()
}

// One line each for a link preview: who is up, and where the game stands.
export const summarizeParty = (
  state: PartyState,
): { headline: string; detail: string; lastTmdbId: string | null } => {
  const lastPick = state.players
    .flatMap((player, owner) =>
      player.picks.map((pick, round) => ({
        pick,
        order: round * state.players.length + owner,
      })),
    )
    .sort((a, b) => b.order - a.order)[0]?.pick
  const lastId = state.tonight ?? lastPick?.movieId ?? null
  const lastTmdbId = lastId ? String(tmdbOf(lastId)) : null

  const ranked = standings(state.players)
  const leader = ranked[0]
  const lead = leader
    ? `${leader.player.name} leads with ${leader.total}`
    : 'Pass the Globe'
  const name = state.players[actorIndex(state)]?.name ?? 'Next'

  if (state.tonight !== null) {
    const pick = shortlist(state.players).find(
      (item) => item.movieId === state.tonight,
    )
    return {
      headline: pick?.title ? `Tonight: ${pick.title}` : "Tonight's film",
      detail: 'Picked in a game of Pass the Globe',
      lastTmdbId,
    }
  }
  if (isFinished(state) && !outstandingVotes(state).length) {
    const top = winners(state.players)
    const names = top.map((at) => state.players[at]?.name).join(' and ')
    const total = leader ? playerTotal(leader.player) : 0
    return {
      headline: state.settle ? `${name}, settle it` : `${names} won`,
      detail: `${names} ${top.length > 1 ? 'tie' : 'wins'} with ${total}`,
      lastTmdbId,
    }
  }
  const round = Math.min(
    state.rounds,
    Math.floor(state.turn / state.players.length) + 1,
  )
  return {
    headline: `Your turn, ${name}`,
    detail: `${lead} · Round ${round} of ${state.rounds}`,
    lastTmdbId,
  }
}
