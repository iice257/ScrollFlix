// The screens of a live room: the lobby where friends gather, the screen for
// joining one, the wait while someone else plays, and the end of a room.

import { ArrowRight, Check, Copy, Loader2, Share2, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../../../utils/tw'
import { overlayScrollbarRef } from '../../../ui/use-overlay-scrollbar'
import './party.css'
import './party-v2.css'
import './party-setup.css'
import { Scores } from './party-finale-ui'
import {
  type PartyState,
  actorIndex,
  currentRound,
  isFinished,
} from './party-logic'
import { Dot, EndButton, MODE_LABELS, useEscape } from './party-parts'
import {
  type RoomError,
  type RoomResult,
  type RoomView,
  readRoomCode,
  roomUrl,
} from './party-room-api'

const Backdrop = ({ onClick }: { onClick?: () => void }) =>
  onClick ? (
    <button
      type='button'
      className='party-backdrop'
      aria-label='Close'
      onClick={onClick}
    />
  ) : (
    <div className='party-backdrop' aria-hidden='true' />
  )

// The poster standing in for a seat, by the TMDB id the room keeps.
type PosterOf = (tmdbId: number) => string | null

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------------ lobby

type LobbyProps = {
  view: RoomView
  error: RoomError | null
  posterOf: PosterOf
  onBegin: () => void
  onLeave: () => void
}

export const PartyLobby = ({
  view,
  error,
  posterOf,
  onBegin,
  onLeave,
}: LobbyProps) => {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const joined = view.claimed.filter(Boolean).length
  const ready = joined >= 2
  const waiting = view.names.length - joined
  useEscape(null)

  const flash = (what: 'code' | 'link') => {
    setCopied(what)
    window.setTimeout(() => setCopied(null), 1600)
  }

  const invite = async () => {
    const url = roomUrl(view.room)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Pass the globe',
          text: `Join my game of Pass the globe: ${view.room}`,
          url,
        })
        return
      }
    } catch (failure) {
      if ((failure as Error)?.name === 'AbortError') return
    }
    if (await copyText(url)) flash('link')
  }

  return (
    <section className='party-layer' aria-label='Room lobby'>
      <Backdrop />
      <div ref={overlayScrollbarRef} className='party-card ps-card pr-lobby'>
        <header className='pr-head'>
          <span className='pr-eyebrow'>Room code</span>
          <strong
            className='pr-code'
            aria-label={`Room code ${view.room.split('').join(' ')}`}
          >
            {view.room}
          </strong>
          <div className='pr-share'>
            <button
              type='button'
              className='ps-ghost'
              onClick={async () => {
                if (await copyText(view.room)) flash('code')
              }}
            >
              {copied === 'code' ? <Check /> : <Copy />}
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            <button type='button' className='ps-ghost' onClick={invite}>
              {copied === 'link' ? <Check /> : <Share2 />}
              {copied === 'link' ? 'Link copied' : 'Invite'}
            </button>
          </div>
        </header>

        <ul className='pr-seats' aria-label='Players'>
          {view.names.map((name, at) => {
            const taken = view.claimed[at]
            const poster = view.avatars[at] ? posterOf(view.avatars[at]) : null
            const role =
              view.seat === at
                ? at === 0
                  ? 'You, host'
                  : 'You'
                : at === 0
                  ? 'Host'
                  : taken
                    ? 'Joined'
                    : 'Waiting to join'
            return (
              <li
                key={`seat-${at}-${name}`}
                className={cn(taken && 'is-here', view.seat === at && 'is-me')}
              >
                <Dot index={at} name={name} src={poster} />
                <span className='pr-seat-name'>
                  <strong>{name}</strong>
                  <small>{role}</small>
                </span>
                <em />
              </li>
            )
          })}
        </ul>

        <footer className='is-flat ps-foot'>
          {view.host ? (
            <>
              <button
                type='button'
                className='ps-start'
                disabled={!ready}
                onClick={onBegin}
              >
                {ready
                  ? `Start with ${joined} players`
                  : 'Waiting for a friend'}
                <ArrowRight aria-hidden='true' />
              </button>
              <p className='ps-hint pr-note'>
                {ready
                  ? waiting > 0
                    ? `${waiting} ${waiting === 1 ? 'seat is' : 'seats are'} still empty and will be left out.`
                    : 'Everyone is here.'
                  : 'Friends join with the code or the invite link.'}
              </p>
            </>
          ) : (
            <p className='pr-waiting'>
              <Loader2 aria-hidden='true' />
              Waiting for {view.names[0]} to start
            </p>
          )}
          {error === 'unavailable' ? (
            <p className='pr-offline'>
              <WifiOff aria-hidden='true' />
              Reconnecting…
            </p>
          ) : null}
          <EndButton
            onEnd={onLeave}
            label={view.host ? 'Close the room' : 'Leave the room'}
            armedLabel={
              view.host ? 'Tap again to close the room' : 'Tap again to leave'
            }
          />
        </footer>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------- join

const JOIN_ERRORS: Partial<Record<RoomError, string>> = {
  'no-room': 'There is no room with that code. Check it and try again.',
  unavailable: 'Rooms can’t be reached right now. Try again in a moment.',
  taken: 'Someone just took that seat. Pick another.',
  started: 'That game has already started.',
}

type JoinProps = {
  initialCode: string
  posterOf: PosterOf
  lookup: (code: string) => Promise<RoomResult>
  onJoin: (code: string, seat: number) => Promise<RoomError | null>
  onClose: () => void
}

export const PartyJoin = ({
  initialCode,
  posterOf,
  lookup,
  onJoin,
  onClose,
}: JoinProps) => {
  const [code, setCode] = useState(readRoomCode(initialCode))
  const [view, setView] = useState<RoomView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<RoomError | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEscape(onClose)

  const find = async (value: string) => {
    if (value.length !== 4 || busy) return
    setBusy(true)
    setError(null)
    const result = await lookup(value)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.view.status !== 'lobby') setError('started')
    else setView(result.view)
  }

  // A link brings the code with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on open
  useEffect(() => {
    if (initialCode.length === 4) void find(readRoomCode(initialCode))
    else inputRef.current?.focus()
  }, [])

  const take = async (seat: number) => {
    if (!view || busy) return
    setBusy(true)
    const failure = await onJoin(view.room, seat)
    setBusy(false)
    if (failure) {
      setError(failure)
      // Show who is still free.
      void find(view.room)
    }
  }

  return (
    <section className='party-layer' aria-label='Join a room'>
      <Backdrop onClick={onClose} />
      <div ref={overlayScrollbarRef} className='party-card ps-card'>
        <header className='ps-head'>
          <img
            className='ps-mark'
            src='/mark-dark.svg'
            crossOrigin='anonymous'
            alt=''
            width={52}
            height={48}
            draggable={false}
          />
          <div>
            <h2>{view ? 'Who are you?' : 'Join a room'}</h2>
            <p>
              {view
                ? 'Pick your name. The host set the players up.'
                : 'Type the four letters the host is showing.'}
            </p>
          </div>
        </header>

        {view ? (
          <ul className='is-pick pr-seats' aria-label='Seats'>
            {view.names.map((name, at) => {
              const taken = view.claimed[at]
              const poster = view.avatars[at]
                ? posterOf(view.avatars[at])
                : null
              return (
                <li key={`pick-${at}-${name}`}>
                  <button
                    type='button'
                    disabled={taken || busy}
                    onClick={() => void take(at)}
                  >
                    <Dot index={at} name={name} src={poster} />
                    <span className='pr-seat-name'>
                      <strong>{name}</strong>
                      <small>{taken ? 'Taken' : 'Tap to join'}</small>
                    </span>
                    {taken ? null : <ArrowRight aria-hidden='true' />}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <form
            className='pr-code-form'
            onSubmit={(event) => {
              event.preventDefault()
              void find(code)
            }}
          >
            <input
              ref={inputRef}
              className='pr-code-input'
              value={code}
              inputMode='text'
              autoCapitalize='characters'
              autoComplete='off'
              autoCorrect='off'
              spellCheck={false}
              maxLength={4}
              placeholder='ABCD'
              aria-label='Room code'
              onChange={(event) => setCode(readRoomCode(event.target.value))}
            />
            <button
              type='submit'
              className='ps-start'
              disabled={code.length !== 4 || busy}
            >
              {busy ? 'Looking…' : 'Find the room'}
              <ArrowRight aria-hidden='true' />
            </button>
          </form>
        )}

        {error ? (
          <p className='pr-error' role='alert'>
            {JOIN_ERRORS[error] ?? 'That didn’t work. Try again.'}
          </p>
        ) : null}

        <footer className='is-flat ps-foot'>
          <button type='button' className='ps-link' onClick={onClose}>
            {view ? 'Cancel' : 'Back'}
          </button>
        </footer>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- waiting

// The most recent landing in the game: whose, what, and what it scored.
const latestPick = (state: PartyState) => {
  const count = state.players.length
  let best: {
    name: string
    title: string
    score: number
    order: number
  } | null = null
  state.players.forEach((player, owner) => {
    player.picks.forEach((pick, round) => {
      const order = round * count + owner
      if (!best || order > best.order)
        best = {
          name: player.name,
          title: pick.title,
          score: pick.score,
          order,
        }
    })
  })
  return best as { name: string; title: string; score: number } | null
}

type WaitingProps = {
  state: PartyState
  me: number
  host: boolean
  error: RoomError | null
  onLeave: () => void
}

// Someone else has the globe: where the game stands while the move comes in.
export const PartyWaiting = ({
  state,
  me,
  host,
  error,
  onLeave,
}: WaitingProps) => {
  const actor = actorIndex(state)
  const name = state.players[actor]?.name ?? ''
  const finished = isFinished(state)
  const latest = latestPick(state)
  const status =
    state.phase === 'settle'
      ? 'Vetoing down to tonight’s film'
      : finished
        ? 'Casting the last votes'
        : `Round ${currentRound(state)} of ${state.rounds} · ${MODE_LABELS[state.mode]}`
  return (
    <section className='party-layer is-sheet' aria-label='Waiting for a move'>
      <Backdrop />
      <div className='party-card party-sheet' ref={overlayScrollbarRef}>
        <span className='party-grip' aria-hidden='true' />
        <header className='pr-turn'>
          <Dot index={actor} name={name} />
          <div>
            <h2>{name} is up</h2>
            <p>{status}</p>
          </div>
          <span className='pr-live' aria-hidden='true'>
            <em />
          </span>
        </header>
        {latest ? (
          <p className='pr-latest'>
            <strong>{latest.name}</strong> landed on <em>{latest.title}</em> for{' '}
            {latest.score}.
          </p>
        ) : null}
        <Scores state={state} up={actor} />
        <p className='pr-you'>
          You are <strong>{state.players[me]?.name}</strong>
        </p>
        {error === 'unavailable' ? (
          <p className='pr-offline'>
            <WifiOff aria-hidden='true' />
            Reconnecting…
          </p>
        ) : null}
        <EndButton
          onEnd={onLeave}
          label={host ? 'End game' : 'Leave game'}
          armedLabel={host ? 'Tap again to end the game' : 'Tap again to leave'}
        />
      </div>
    </section>
  )
}

// ------------------------------------------------------------------- ended

type EndedProps = { host: string; closed: boolean; onClose: () => void }

export const PartyEnded = ({ host, closed, onClose }: EndedProps) => {
  useEscape(onClose)
  return (
    <section className='party-layer' aria-label='Room closed'>
      <Backdrop onClick={onClose} />
      <div className='party-card ps-card'>
        <header className='ps-head'>
          <img
            className='ps-mark'
            src='/mark-dark.svg'
            crossOrigin='anonymous'
            alt=''
            width={52}
            height={48}
            draggable={false}
          />
          <div>
            <h2>{closed ? 'That room has closed' : 'The game has ended'}</h2>
            <p>
              {closed
                ? 'It was closed or timed out. Start a new one any time.'
                : `${host} ended the game.`}
            </p>
          </div>
        </header>
        <footer className='is-flat ps-foot'>
          <button type='button' className='ps-start' onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </section>
  )
}
