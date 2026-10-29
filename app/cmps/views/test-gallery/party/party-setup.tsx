// Pass the globe's setup: who is playing (each with a poster for a face), the
// game, and how many rounds. Over chat it makes a room instead of starting.

import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  MessagesSquare,
  Plus,
  Shuffle,
  Smartphone,
  Star,
  ThumbsUp,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '../../../../utils/tw'
import { overlayScrollbarRef } from '../../../ui/use-overlay-scrollbar'
import './party.css'
import './party-v2.css'
import './party-setup.css'
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PARTY_MODES,
  type PartyMode,
  type StartOptions,
} from './party-logic'
import {
  Dot,
  MODE_BLURBS,
  MODE_LABELS,
  PLAYER_COLORS,
  useEscape,
} from './party-parts'

// A film that can stand in for a player: just what the picker draws.
export type AvatarFilm = {
  id: string
  title: string
  posterUrl: string | null
}

export type DrawFilms = (count: number, exclude: string[]) => AvatarFilm[]

const PICKER_SIZE = 12

const MODE_ICONS: Record<PartyMode, ReactNode> = {
  year: <CalendarDays aria-hidden='true' />,
  rating: <Star aria-hidden='true' />,
  crowd: <ThumbsUp aria-hidden='true' />,
  mixed: <Shuffle aria-hidden='true' />,
}

type Player = { name: string; avatar: AvatarFilm | null }

type SetupProps = {
  onStart: (options: StartOptions) => Promise<void>
  onJoin: () => void
  onClose: () => void
  drawFilms: DrawFilms
}

export const PartySetup = ({
  onStart,
  onJoin,
  onClose,
  drawFilms,
}: SetupProps) => {
  const [players, setPlayers] = useState<Player[]>([
    { name: '', avatar: null },
    { name: '', avatar: null },
  ])
  const [rounds, setRounds] = useState(2)
  const [mode, setMode] = useState<PartyMode>('year')
  const [settle, setSettle] = useState(true)
  const [online, setOnline] = useState(false)
  const [busy, setBusy] = useState(false)
  // The player whose picture is being chosen, and the films on offer.
  const [picking, setPicking] = useState<number | null>(null)
  const [offer, setOffer] = useState<AvatarFilm[]>([])
  const firstRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // On a phone the keyboard would cover the choices, so only a mouse and
    // keyboard setup starts with the cursor in the first name.
    if (window.matchMedia('(pointer: fine)').matches) firstRef.current?.focus()
  }, [])
  useEscape(picking === null ? onClose : () => setPicking(null))

  const taken = (except: number) =>
    players.flatMap((player, at) =>
      at !== except && player.avatar ? [player.avatar.id] : [],
    )

  const openPicker = (index: number) => {
    setOffer(drawFilms(PICKER_SIZE, taken(index)))
    setPicking(index)
  }

  const setPlayer = (index: number, change: Partial<Player>) =>
    setPlayers((current) =>
      current.map((player, at) =>
        at === index ? { ...player, ...change } : player,
      ),
    )

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onStart({
        names: players.map((player) => player.name),
        avatars: players.map((player) => player.avatar?.id ?? null),
        rounds,
        mode,
        settle,
        online,
      })
    } finally {
      setBusy(false)
    }
  }

  if (picking !== null) {
    const who = players[picking]?.name.trim() || `Player ${picking + 1}`
    return (
      <section className='party-layer' aria-label='Choose a picture'>
        <button
          type='button'
          className='party-backdrop'
          aria-label='Close'
          onClick={() => setPicking(null)}
        />
        <div ref={overlayScrollbarRef} className='party-card ps-card'>
          <header className='ps-head'>
            <button
              type='button'
              className='ps-icon'
              aria-label='Back to setup'
              onClick={() => setPicking(null)}
            >
              <ChevronLeft aria-hidden='true' />
            </button>
            <div>
              <h2>A face for {who}</h2>
              <p>Pick a film. Its poster is their picture all game.</p>
            </div>
          </header>
          <ul className='ps-offer'>
            {offer.map((film) => (
              <li key={film.id}>
                <button
                  type='button'
                  className={cn(
                    players[picking]?.avatar?.id === film.id && 'is-chosen',
                  )}
                  aria-label={film.title}
                  onClick={() => {
                    setPlayer(picking, { avatar: film })
                    setPicking(null)
                  }}
                >
                  {film.posterUrl ? (
                    <img
                      src={film.posterUrl}
                      crossOrigin='anonymous'
                      alt=''
                      decoding='async'
                      draggable={false}
                    />
                  ) : null}
                  <span>{film.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className='ps-picker-actions'>
            <button
              type='button'
              className='ps-ghost'
              onClick={() => setOffer(drawFilms(PICKER_SIZE, taken(picking)))}
            >
              <Shuffle aria-hidden='true' />
              Show others
            </button>
            {players[picking]?.avatar ? (
              <button
                type='button'
                className='ps-ghost'
                onClick={() => {
                  setPlayer(picking, { avatar: null })
                  setPicking(null)
                }}
              >
                Use my initial
              </button>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className='party-layer' aria-label='Pass the globe'>
      <button
        type='button'
        className='party-backdrop'
        aria-label='Close'
        onClick={onClose}
      />
      <form
        ref={overlayScrollbarRef}
        className='party-card ps-card'
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
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
            <h2>Pass the globe</h2>
            <p>
              Take turns on the globe, guess the film, and end with one to
              watch.
            </p>
          </div>
          <button
            type='button'
            className='ps-icon'
            aria-label='Close'
            onClick={onClose}
          >
            <X aria-hidden='true' />
          </button>
        </header>

        <fieldset className='ps-tabs' aria-label='How you are playing'>
          {[
            { value: false, label: 'Same phone', icon: <Smartphone /> },
            { value: true, label: 'Over chat', icon: <MessagesSquare /> },
          ].map((option) => (
            <button
              type='button'
              aria-pressed={online === option.value}
              key={option.label}
              className={cn(online === option.value && 'is-active')}
              onClick={() => setOnline(option.value)}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </fieldset>
        <p className='ps-hint'>
          {online
            ? 'You get a room code. Friends join live from their own phones.'
            : 'One phone, passed around the room.'}
        </p>

        <section className='ps-block' aria-labelledby='ps-players-label'>
          <header className='ps-label'>
            <h3 id='ps-players-label'>Players</h3>
            <small>
              {players.length} of {MAX_PLAYERS}
            </small>
          </header>
          <ul className='ps-players'>
            {players.map((player, index) => (
              <li key={`player-${PLAYER_COLORS[index]}`}>
                <button
                  type='button'
                  className='ps-face'
                  aria-label={`Choose a picture for ${player.name.trim() || `player ${index + 1}`}`}
                  onClick={() => openPicker(index)}
                >
                  <Dot
                    index={index}
                    name={player.name}
                    src={player.avatar?.posterUrl ?? null}
                  />
                  <em>
                    <Plus aria-hidden='true' />
                  </em>
                </button>
                <input
                  ref={index === 0 ? firstRef : undefined}
                  value={player.name}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder={`Player ${index + 1}`}
                  aria-label={`Player ${index + 1} name`}
                  autoComplete='off'
                  enterKeyHint='next'
                  onChange={(event) =>
                    setPlayer(index, { name: event.target.value })
                  }
                />
                {players.length > MIN_PLAYERS ? (
                  <button
                    type='button'
                    className='is-quiet ps-icon'
                    aria-label={`Remove player ${index + 1}`}
                    onClick={() =>
                      setPlayers((current) =>
                        current.filter((_, at) => at !== index),
                      )
                    }
                  >
                    <X aria-hidden='true' />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {players.length < MAX_PLAYERS ? (
            <button
              type='button'
              className='ps-add'
              onClick={() =>
                setPlayers((current) => [
                  ...current,
                  { name: '', avatar: null },
                ])
              }
            >
              <Plus aria-hidden='true' />
              Add a player
            </button>
          ) : null}
        </section>

        <section className='ps-block' aria-labelledby='ps-game-label'>
          <header className='ps-label'>
            <h3 id='ps-game-label'>Game</h3>
          </header>
          <div className='ps-modes'>
            {PARTY_MODES.map((option) => (
              <button
                type='button'
                aria-pressed={mode === option}
                key={option}
                className={cn(mode === option && 'is-active')}
                onClick={() => setMode(option)}
              >
                <span className='ps-mode-icon'>{MODE_ICONS[option]}</span>
                <span className='ps-mode-copy'>
                  <strong>{MODE_LABELS[option]}</strong>
                  <small>{MODE_BLURBS[option]}</small>
                </span>
                <em />
              </button>
            ))}
          </div>
        </section>

        <div className='ps-rules'>
          <div className='ps-rule'>
            <span>
              <strong>Rounds</strong>
              <small>Turns each</small>
            </span>
            <fieldset className='ps-steps' aria-label='Rounds'>
              {[1, 2, 3].map((count) => (
                <button
                  type='button'
                  key={count}
                  aria-pressed={rounds === count}
                  className={cn(rounds === count && 'is-active')}
                  onClick={() => setRounds(count)}
                >
                  {count}
                </button>
              ))}
            </fieldset>
          </div>
          <button
            type='button'
            role='switch'
            aria-checked={settle}
            className={cn('ps-rule ps-switch', settle && 'is-on')}
            onClick={() => setSettle((value) => !value)}
          >
            <span>
              <strong>Settle it</strong>
              <small>Veto down to tonight&rsquo;s film</small>
            </span>
            <em />
          </button>
        </div>

        <footer className='ps-foot'>
          <button type='submit' className='ps-start' disabled={busy}>
            {busy ? 'Opening…' : online ? 'Create a room' : 'Start'}
            <ArrowRight aria-hidden='true' />
          </button>
          {online ? (
            <button type='button' className='ps-link' onClick={onJoin}>
              Have a code? Join a room
            </button>
          ) : null}
        </footer>
      </form>
    </section>
  )
}
