// The Pass the globe session on this device: the reducer, a copy kept in
// sessionStorage so a reload doesn't lose a same-phone game, the ?party= link
// that opens a game someone passed along, passing it on, and the live room
// that lets friends play from their own phones (see party-room-api.ts).

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { decodeParty, encodeParty, partyUrl } from './party-link'
import type { FilmLookup } from './party-link'
import {
  PARTY_OFF,
  type PartyFilm,
  type PartyMode,
  type PartyState,
  type StartOptions,
  actorIndex,
  isFinished,
  partyReducer,
} from './party-logic'
import {
  type RoomError,
  type RoomSession,
  type RoomView,
  claimSeat,
  createRoom,
  endRoom,
  newToken,
  publishRoom,
  readRoom,
  startRoom,
} from './party-room-api'

const STORAGE_KEY = 'wtw:party:v2'
const ROOM_KEY = 'wtw:party:room:v1'

// How often a phone asks the room what has changed: quicker while waiting for
// someone else, slower on its own turn or in a hidden tab.
const POLL_WAITING_MS = 1800
const POLL_OWN_TURN_MS = 5000
const POLL_HIDDEN_MS = 8000

type RoomState = {
  session: RoomSession
  // The room as last heard from the server. Null until the first answer.
  view: RoomView | null
  // The room is gone: closed by the host, or expired.
  gone: boolean
}

const readSavedRoom = (): RoomSession | null => {
  try {
    const raw = window.sessionStorage.getItem(ROOM_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as Partial<RoomSession>
    return typeof saved.room === 'string' && typeof saved.token === 'string'
      ? { room: saved.room, token: saved.token }
      : null
  } catch {
    return null
  }
}

const readLinkRoom = () => {
  try {
    const code = new URLSearchParams(window.location.search).get('room')
    return code
      ? code
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 4)
      : null
  } catch {
    return null
  }
}

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

  // The live room this phone is in, and the join screen when it is open (with
  // the room code from a ?room= link, or '' to type one).
  const [room, setRoom] = useState<RoomState | null>(() => {
    const session = readSavedRoom()
    return session ? { session, view: null, gone: false } : null
  })
  const linkRoom = useRef<string | null | undefined>(undefined)
  if (linkRoom.current === undefined) linkRoom.current = readLinkRoom()
  const [joining, setJoining] = useState<string | null>(linkRoom.current)
  const roomRef = useRef(room)
  roomRef.current = room
  // The room version the game on screen was taken from, so a poll that brings
  // nothing new never resets a turn in progress.
  const appliedV = useRef(0)
  // A move that could not be sent yet; sent again with the next poll.
  const outbox = useRef<PartyState | null>(null)
  const [roomError, setRoomError] = useState<RoomError | null>(null)

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

  // A ?room= link opens the join screen once, then leaves the address clean.
  useEffect(() => {
    if (linkRoom.current === null) return
    linkRoom.current = null
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('room')
      window.history.replaceState(null, '', url)
    } catch {
      // The address stays as it is; the join screen still opens.
    }
    dispatch({ type: 'open' })
  }, [])

  useEffect(() => {
    try {
      if (room)
        window.sessionStorage.setItem(ROOM_KEY, JSON.stringify(room.session))
      else window.sessionStorage.removeItem(ROOM_KEY)
    } catch {
      // Private mode: the room just won't survive a reload.
    }
  }, [room])

  useEffect(() => {
    try {
      if (party.phase === 'off' || party.phase === 'setup' || room)
        window.sessionStorage.removeItem(STORAGE_KEY)
      else
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ party, me } satisfies Saved),
        )
    } catch {
      // Private mode: the game just won't survive a reload.
    }
  }, [party, me, room])

  const start = useCallback(
    (options: Parameters<typeof partyReducer>[1] & { type: 'start' }) => {
      setHandoff(null)
      setLinkError(null)
      setMe(options.online ? 0 : null)
      dispatch(options)
    },
    [],
  )

  // Leave the room this phone is in. The host closing it ends it for all.
  const leaveRoom = useCallback(() => {
    const current = roomRef.current
    if (current?.view?.host && current.view.status !== 'ended')
      void endRoom(current.session)
    outbox.current = null
    appliedV.current = 0
    setRoom(null)
    setRoomError(null)
    setJoining(null)
  }, [])

  const close = useCallback(() => {
    setHandoff(null)
    setMe(null)
    leaveRoom()
    dispatch({ type: 'close' })
  }, [leaveRoom])

  // ------------------------------------------------------------ live room

  const adopt = useCallback((view: RoomView) => {
    setRoom((current) =>
      current && current.session.room === view.room
        ? { ...current, view, gone: false }
        : current,
    )
  }, [])

  // Send the game as it stands after a move. A move that can't be sent right
  // now waits and goes with the next poll.
  const publish = useCallback(
    async (state: PartyState) => {
      const current = roomRef.current
      if (!current?.view) return
      outbox.current = state
      const result = await publishRoom(
        current.session,
        current.view.v,
        encodeParty(state),
      )
      if (result.ok) {
        outbox.current = null
        appliedV.current = result.view.v
        setRoomError(null)
        adopt(result.view)
      } else if (result.error === 'stale' && result.view) {
        // Someone else's move landed first: theirs stands.
        outbox.current = null
        adopt(result.view)
      } else if (result.error === 'no-room') {
        outbox.current = null
        setRoom((now) => (now ? { ...now, gone: true } : now))
      } else {
        setRoomError(result.error)
      }
    },
    [adopt],
  )

  // Make a room for these players and wait in its lobby. False when rooms
  // can't be had here, so the caller can play by link instead.
  const openRoom = useCallback(async (options: StartOptions) => {
    const names = options.names.map(
      (name, at) => name.trim() || `Player ${at + 1}`,
    )
    const session: RoomSession = { room: '', token: newToken() }
    const result = await createRoom(session.token, {
      names,
      avatars: names.map((_, at) => {
        const id = Number(options.avatars?.[at]?.replace(/^c/, ''))
        return Number.isInteger(id) && id > 0 ? id : 0
      }),
      rounds: options.rounds,
      mode: options.mode,
      settle: options.settle,
    })
    if (!result.ok) {
      setRoomError(result.error)
      return false
    }
    setRoomError(null)
    appliedV.current = 0
    setRoom({
      session: { room: result.view.room, token: session.token },
      view: result.view,
      gone: false,
    })
    return true
  }, [])

  // Take a seat in someone's room (a fresh token for this phone).
  const joinRoom = useCallback(async (code: string, seat: number) => {
    const session: RoomSession = { room: code, token: newToken() }
    const result = await claimSeat(session, seat)
    if (!result.ok) return result.error
    appliedV.current = 0
    setRoomError(null)
    setJoining(null)
    setRoom({ session, view: result.view, gone: false })
    return null
  }, [])

  // The host: begin with the seats that were taken.
  const beginRoom = useCallback(async () => {
    const current = roomRef.current
    const view = current?.view
    if (!current || !view?.host || view.status !== 'lobby') return
    const seated = view.claimed.flatMap((taken, at) => (taken ? [at] : []))
    if (seated.length < 2) return
    const state = partyReducer(PARTY_OFF, {
      type: 'start',
      names: seated.map((at) => view.names[at] ?? ''),
      avatars: seated.map((at) =>
        view.avatars[at] ? `c${view.avatars[at]}` : null,
      ),
      rounds: view.rounds,
      mode: view.mode as PartyMode,
      settle: view.settle,
      online: true,
    })
    const result = await startRoom(current.session, encodeParty(state), seated)
    if (result.ok) {
      setRoomError(null)
      adopt(result.view)
    } else if (result.view) adopt(result.view)
    else setRoomError(result.error)
  }, [adopt])

  // Look at a room without joining it (the join screen).
  const lookupRoom = useCallback(async (code: string) => {
    const result = await readRoom({ room: code, token: newToken() })
    return 'unchanged' in result
      ? ({ ok: false, error: 'unavailable' } as const)
      : result
  }, [])

  // A room kept over a reload has no game on screen yet: open the layer so
  // the lobby or the game can show.
  useEffect(() => {
    if (room && party.phase === 'off') dispatch({ type: 'open' })
  }, [room, party.phase])

  // Bring the game on screen up to the room's latest move.
  useEffect(() => {
    const view = room?.view
    if (!view || view.status !== 'live' || !view.code || !ready) return
    if (view.v === appliedV.current) return
    const decoded = decodeParty(view.code, lookup)
    if ('error' in decoded) {
      setLinkError(decoded.error)
      return
    }
    appliedV.current = view.v
    setMe(view.you)
    dispatch({ type: 'load', state: decoded })
    if (
      view.you !== null &&
      decoded.phase === 'turn' &&
      actorIndex(decoded) === view.you
    )
      dispatch({ type: 'begin' })
  }, [room?.view, ready, lookup])

  // Ask the room what has changed, until the phone leaves it.
  const roomCode = room?.session.room ?? null
  const myTurnRef = useRef(false)
  myTurnRef.current =
    room?.view?.status === 'live' &&
    room.view.you !== null &&
    actorIndex(party) === room.view.you
  useEffect(() => {
    if (!roomCode) return
    const controller = new AbortController()
    let timer = 0
    const tick = async () => {
      const current = roomRef.current
      if (!current || controller.signal.aborted) return
      if (outbox.current) await publish(outbox.current)
      const reply = await readRoom(
        current.session,
        current.view?.v,
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (reply.ok && !('unchanged' in reply)) {
        setRoomError(null)
        adopt(reply.view)
      } else if (!reply.ok && reply.error === 'no-room') {
        setRoom((now) => (now ? { ...now, gone: true } : now))
        return
      } else if (!reply.ok) setRoomError(reply.error)
      timer = window.setTimeout(
        tick,
        document.hidden
          ? POLL_HIDDEN_MS
          : myTurnRef.current
            ? POLL_OWN_TURN_MS
            : POLL_WAITING_MS,
      )
    }
    timer = window.setTimeout(tick, 400)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [roomCode, adopt, publish])

  // In a live room only the player whose turn it is can land a film.
  const roomLive = room?.view?.status === 'live'
  const myTurn = !roomLive || actorIndex(party) === me

  // A flick or shuffle landed. Only counts on a turn someone is playing.
  const land = useCallback(
    (film: PartyFilm) => {
      if (party.phase !== 'turn' || isFinished(party)) return false
      if (party.online && me === null) return false
      if (!myTurn) return false
      dispatch({ type: 'land', film })
      return true
    },
    [party, me, myTurn],
  )

  const canLand =
    party.phase === 'turn' &&
    !isFinished(party) &&
    (!party.online || me !== null) &&
    myTurn

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
      if (roomRef.current?.view?.status === 'live') {
        if (next.phase === 'off') return
        void publish(next)
        const actor = actorIndex(next)
        if (actor === me && next.phase === 'turn') dispatch({ type: 'begin' })
        return
      }
      if (next.tonight !== null || next.phase === 'off') return
      if (next.phase === 'final' && !next.settle) return
      const actor = actorIndex(next)
      if (actor === me) {
        if (next.phase === 'turn') dispatch({ type: 'begin' })
        return
      }
      void passOn(next)
    },
    [party.online, me, passOn, publish],
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
      if (party.online && after !== party) {
        if (roomRef.current?.view?.status === 'live') void publish(after)
        else void passOn(after)
      }
    },
    [party, passOn, publish],
  )

  // Another round with the same players.
  const again = useCallback(() => {
    const after = partyReducer(party, { type: 'again' })
    dispatch({ type: 'again' })
    if (roomRef.current?.view?.status === 'live' && after !== party)
      void publish(after)
  }, [party, publish])

  return {
    party,
    dispatch,
    again,
    room,
    roomError,
    joining,
    openRoom,
    joinRoom,
    beginRoom,
    lookupRoom,
    leaveRoom,
    openJoin: (code = '') => {
      setJoining(code)
      dispatch({ type: 'open' })
    },
    closeJoin: () => {
      setJoining(null)
      if (!roomRef.current) dispatch({ type: 'close' })
    },
    dismissRoomError: () => setRoomError(null),
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
