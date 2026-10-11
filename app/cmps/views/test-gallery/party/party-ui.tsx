import { ArrowRight, Crown, Plus, Users, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../../../utils/tw'
import './party.css'
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type PartyState,
  currentPlayerIndex,
  currentRound,
  playerTotal,
  standings,
  winners,
} from './party-logic'

export const PLAYER_COLORS = [
  '#ff7a2f',
  '#a78bfa',
  '#ffd23f',
  '#ff6b9d',
  '#5eead4',
  '#60a5fa',
]

const colorOf = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length]

export const weirdnessLabel = (score: number) =>
  score >= 75
    ? 'Truly strange'
    : score >= 50
      ? 'Weird'
      : score >= 25
        ? 'A bit off'
        : 'Mainstream'

const Dot = ({ index, name }: { index: number; name: string }) => (
  <span
    className='party-dot'
    style={{ background: colorOf(index) }}
    aria-hidden='true'
  >
    {name.trim().charAt(0).toUpperCase() || index + 1}
  </span>
)

// ------------------------------------------------------------------ setup

type SetupProps = {
  onStart: (names: string[], rounds: number) => void
  onClose: () => void
}

export const PartySetup = ({ onStart, onClose }: SetupProps) => {
  const [names, setNames] = useState<string[]>(['', ''])
  const [rounds, setRounds] = useState(2)
  const firstRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    firstRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onClose])

  return (
    <section className='party-layer' aria-label='Pass the globe'>
      <button
        type='button'
        className='party-backdrop'
        aria-label='Close'
        onClick={onClose}
      />
      <form
        className='party-card'
        onSubmit={(event) => {
          event.preventDefault()
          onStart(names, rounds)
        }}
      >
        <header className='party-heading'>
          <span className='party-badge' aria-hidden='true'>
            <Users />
          </span>
          <div>
            <h2>Pass the globe</h2>
            <p>
              Take turns flicking the globe. Whatever it lands on gets a
              weirdness score, and the highest total wins.
            </p>
          </div>
        </header>

        <fieldset className='party-players'>
          <legend>Who is playing?</legend>
          {names.map((name, index) => (
            <div className='party-row' key={`player-${PLAYER_COLORS[index]}`}>
              <Dot index={index} name={name} />
              <input
                ref={index === 0 ? firstRef : undefined}
                value={name}
                maxLength={MAX_NAME_LENGTH}
                placeholder={`Player ${index + 1}`}
                aria-label={`Player ${index + 1} name`}
                autoComplete='off'
                onChange={(event) =>
                  setNames((current) =>
                    current.map((item, at) =>
                      at === index ? event.target.value : item,
                    ),
                  )
                }
              />
              {names.length > MIN_PLAYERS ? (
                <button
                  type='button'
                  className='party-remove'
                  aria-label={`Remove player ${index + 1}`}
                  onClick={() =>
                    setNames((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  <X aria-hidden='true' />
                </button>
              ) : null}
            </div>
          ))}
          {names.length < MAX_PLAYERS ? (
            <button
              type='button'
              className='party-add'
              onClick={() => setNames((current) => [...current, ''])}
            >
              <Plus aria-hidden='true' />
              Add a player
            </button>
          ) : null}
        </fieldset>

        <fieldset className='party-rounds'>
          <legend>Rounds</legend>
          <div>
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
          </div>
        </fieldset>

        <button type='submit' className='party-start'>
          Start
          <ArrowRight aria-hidden='true' />
        </button>
      </form>
    </section>
  )
}

// -------------------------------------------------------------------- hud

type HudProps = {
  state: PartyState
  onNext: () => void
  onEnd: () => void
}

export const PartyHud = ({ state, onNext, onEnd }: HudProps) => {
  const index = currentPlayerIndex(state)
  const player = state.players[index]
  const nextName =
    state.players[(state.turn + 1) % state.players.length]?.name ?? ''
  const lastTurn = state.turn + 1 >= state.players.length * state.rounds
  const result = state.phase === 'result' ? state.last : null

  return (
    <aside className='party-hud' aria-label='Pass the globe'>
      <div className='party-pill' data-phase={state.phase}>
        <Dot index={result ? result.player : index} name={player?.name ?? ''} />
        {result ? (
          <>
            <span className='party-copy'>
              <strong>
                {state.players[result.player]?.name} landed on {result.title}
              </strong>
              <small>
                Weirdness <b>{result.score}</b> · {weirdnessLabel(result.score)}
              </small>
            </span>
            <button type='button' className='party-next' onClick={onNext}>
              {lastTurn ? 'Results' : `Pass to ${nextName}`}
              <ArrowRight aria-hidden='true' />
            </button>
          </>
        ) : (
          <>
            <span className='party-copy'>
              <strong>{player?.name}&rsquo;s turn</strong>
              <small>
                Round {currentRound(state)} of {state.rounds} · flick the globe
                or shuffle
              </small>
            </span>
            <button
              type='button'
              className='party-end'
              aria-label='End the game'
              onClick={onEnd}
            >
              <X aria-hidden='true' />
            </button>
          </>
        )}
      </div>
      {/* The scores sit out of the way while the film's card is open. */}
      {state.phase === 'turn' ? (
        <ul className='party-scores'>
          {state.players.map((item, at) => (
            <li
              key={`score-${PLAYER_COLORS[at]}`}
              className={cn(at === index && state.phase === 'turn' && 'is-up')}
              style={{ '--player': colorOf(at) } as never}
            >
              <i />
              <span>{item.name}</span>
              <b>{playerTotal(item)}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  )
}

// ------------------------------------------------------------------ final

type FinalProps = {
  state: PartyState
  onAgain: () => void
  onDone: () => void
}

export const PartyFinal = ({ state, onAgain, onDone }: FinalProps) => {
  const ranked = standings(state.players)
  const top = new Set(winners(state.players))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onDone()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onDone])

  const names = [...top].map((at) => state.players[at]?.name).join(' and ')

  return (
    <section className='party-layer' aria-label='Results'>
      <button
        type='button'
        className='party-backdrop'
        aria-label='Close results'
        onClick={onDone}
      />
      <div className='party-card is-final'>
        <header className='party-heading'>
          <span className='party-badge is-gold' aria-hidden='true'>
            <Crown />
          </span>
          <div>
            <h2>
              {names} {top.size > 1 ? 'share it' : 'wins'}
            </h2>
            <p>The weirdest landings of the night.</p>
          </div>
        </header>
        <ol className='party-board'>
          {ranked.map((entry, place) => {
            const best = [...entry.player.picks].sort(
              (a, b) => b.score - a.score,
            )[0]
            return (
              <li
                key={`rank-${PLAYER_COLORS[entry.index]}`}
                className={cn(top.has(entry.index) && 'is-winner')}
              >
                <span className='party-place'>{place + 1}</span>
                <Dot index={entry.index} name={entry.player.name} />
                <span className='party-who'>
                  <strong>{entry.player.name}</strong>
                  {best ? (
                    <small>
                      Best: {best.title} ({best.score})
                    </small>
                  ) : null}
                </span>
                <b className='party-total'>{entry.total}</b>
              </li>
            )
          })}
        </ol>
        <div className='party-actions'>
          <button type='button' className='party-start' onClick={onAgain}>
            Play again
          </button>
          <button type='button' className='party-ghost' onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </section>
  )
}
