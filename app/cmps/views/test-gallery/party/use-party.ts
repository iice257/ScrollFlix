// The Pass the globe session on this device: the reducer, a copy kept in
// sessionStorage so a reload doesn't lose a same-phone game, the ?party= link
// that opens a game someone passed along, and passing it on.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { decodeParty, partyUrl } from './party-link'
import type { FilmLookup } from './party-link'
import {
  PARTY_OFF,
  type PartyFilm,
  type PartyState,
  actorIndex,
  isFinished,
  partyReducer,
} from './party-logic'

const STORAGE_KEY = 'wtw:party:v2'

type Saved = { party: PartyState; me: number | null }

const readSaved = (): Saved | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Saved
    const state = saved?.party
    if (
      !state ||
      typeof state.phase !== 'string' ||
      !Array.isArray(state.players) ||
      state.phase === 'off'
    )
      return null
    return { party: state, me: typeof saved.me === 'number' ? saved.me : null }
  } catch {
    return null
  }
}

const readLinkCode = () => {
  try {
    return new URLSearchParams(window.location.search).get('party')
  } catch {
    return null
  }
}

// A film's year, from the text the catalogue keeps ('----' when unknown).
export const partyYear = (year: string) => {
  const value = Number.parseInt(year, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}

export type PartyMovie = {
  id: string
  title: string
  year: string
  ratingValue: number | null
  voteCount: number | null
}

export const toPartyFilm = (movie: PartyMovie): PartyFilm => ({
  id: movie.id,
  title: movie.title,
  year: partyYear(movie.year),
  ratingValue: movie.ratingValue,
  voteCount: movie.voteCount,
})

// Where a passed link stands once it is made: who it is for, and the address.
export type Handoff = { name: string; url: string; copied: boolean }

export type PartyGame = ReturnType<typeof usePartyGame>

export const usePartyGame = (lookup: FilmLookup, ready: boolean) => {
  // A link in the address wins over whatever this tab last saved.
  const linkCode = useRef<string | null | undefined>(undefined)
  if (linkCode.current === undefined) linkCode.current = readLinkCode()

  const saved = useRef<Saved | null | undefined>(undefined)
  if (saved.current === undefined)
    saved.current = linkCode.current ? null : readSaved()

  const [party, dispatch] = useReducer(
    partyReducer,
    saved.current?.party ?? PARTY_OFF,
  )
  // Which player is holding this device (over chat only).
  const [me, setMe] = useState<number | null>(saved.current?.me ?? null)
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [linkError, setLinkError] = useState<'broken' | 'newer' | null>(null)
  // A link is waiting for the catalogue to name its films.
  const [pendingLink, setPendingLink] = useState(linkCode.current !== null)

  // Open a game passed by link once the catalogue can name its films.
  useEffect(() => {
    const code = linkCode.current
    if (!code || !ready) return
    linkCode.current = null
    setPendingLink(false)
    const decoded = decodeParty(code, lookup)
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('party')
      window.history.replaceState(null, '', url)
    } catch {
      // The address stays as it is; the game still opens.
    }
    if ('error' in decoded) {
      setLinkError(decoded.error)
      return
    }
    setMe(null)
    dispatch({ type: 'load', state: decoded })
  }, [ready, lookup])

  useEffect(() => {
    try {
      if (party.phase === 'off' || party.phase === 'setup')
        window.sessionStorage.removeItem(STORAGE_KEY)
      else
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ party, me } satisfies Saved),
        )
    } catch {
      // Private mode: the game just won't survive a reload.
    }
  }, [party, me])

  const start = useCallback(
    (options: Parameters<typeof partyReducer>[1] & { type: 'start' }) => {
      setHandoff(null)
      setLinkError(null)
      setMe(options.online ? 0 : null)
      dispatch(options)
    },
    [],
  )

  const close = useCallback(() => {
    setHandoff(null)
    setMe(null)
    dispatch({ type: 'close' })
  }, [])

  // A flick or shuffle landed. Only counts on a turn someone is playing.
  const land = useCallback(
    (film: PartyFilm) => {
      if (party.phase !== 'turn' || isFinished(party)) return false
      if (party.online && me === null) return false
      dispatch({ type: 'land', film })
      return true
    },
    [party, me],
  )

  const canLand =
    party.phase === 'turn' &&
    !isFinished(party) &&
    (!party.online || me !== null)

  // "I'm <name>, play my turn": the named player picks the game up.
  const claim = useCallback(() => {
    setMe(actorIndex(party))
    dispatch({ type: 'begin' })
  }, [party])

  // Share a link to `state`, falling back to copying it. Called straight from
  // a tap, because phones only open the share sheet from one.
  const passOn = useCallback(async (state: PartyState) => {
    const url = partyUrl(state)
    const tonight = state.tonight
      ? state.players
          .flatMap((player) => player.picks)
          .find((pick) => pick.movieId === state.tonight)
      : null
    const name = tonight
      ? 'everyone'
      : (state.players[actorIndex(state)]?.name ?? 'the next player')
    setMe(null)
    setHandoff({ name, url, copied: false })
    const text = tonight
      ? `We're watching ${tonight.title} tonight`
      : `Your turn, ${name}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Pass the Globe', text, url })
        return
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      setHandoff({ name, url, copied: true })
    } catch {
      // The link is still on screen to copy by hand.
    }
  }, [])

  const copyHandoff = useCallback(async () => {
    if (!handoff) return
    try {
      await navigator.clipboard.writeText(handoff.url)
      setHandoff({ ...handoff, copied: true })
    } catch {
      // Nothing more to do; the link is on screen.
    }
  }, [handoff])

  // After a step that changes who is up: keep going if it is still me, or
  // pass the link on to whoever is next.
  const continueOrPass = useCallback(
    (next: PartyState) => {
      if (!party.online) return
      if (next.tonight !== null || next.phase === 'off') return
      if (next.phase === 'final' && !next.settle) return
      const actor = actorIndex(next)
      if (actor === me) {
        if (next.phase === 'turn') dispatch({ type: 'begin' })
        return
      }
      void passOn(next)
    },
    [party.online, me, passOn],
  )

  // Finish the reveal and move on.
  const next = useCallback(() => {
    const after = partyReducer(party, { type: 'next' })
    dispatch({ type: 'next' })
    continueOrPass(after)
  }, [party, continueOrPass])

  const veto = useCallback(
    (movieId: string) => {
      const after = partyReducer(party, { type: 'veto', movieId })
      dispatch({ type: 'veto', movieId })
      if (after !== party) continueOrPass(after)
    },
    [party, continueOrPass],
  )

  // The winner's final choice. Over chat, the answer goes out to everyone.
  const pick = useCallback(
    (movieId: string) => {
      const after = partyReducer(party, { type: 'pick', movieId })
      dispatch({ type: 'pick', movieId })
      if (party.online && after !== party) void passOn(after)
    },
    [party, passOn],
  )

  return {
    party,
    dispatch,
    me,
    handoff,
    linkError,
    pendingLink,
    canLand,
    start,
    close,
    land,
    claim,
    next,
    veto,
    pick,
    passOn,
    copyHandoff,
    dismissLinkError: () => setLinkError(null),
    dismissHandoff: () => setHandoff(null),
  }
}
