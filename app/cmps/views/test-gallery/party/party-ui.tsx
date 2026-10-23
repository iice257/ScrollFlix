import { ArrowRight, Crown, Link2, Plus, Users, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../../../utils/tw'
import './party.css'
import './party-v2.css'
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PARTY_MODES,
  type PartyMode,
  type PartyState,
  type StartOptions,
  currentPlayerIndex,
  currentRound,
  currentRoundMode,
  playerTotal,
  standings,
  winners,
} from './party-logic'
import {
  Dot,
  MODE_BLURBS,
  MODE_LABELS,
  PLAYER_COLORS,
  colorOf,
  useEscape,
} from './party-parts'

export { PLAYER_COLORS } from './party-parts'

// ------------------------------------------------------------------ setup

type SetupProps = {
  onStart: (options: StartOptions) => void
  onClose: () => void
}

export const PartySetup = ({ onStart, onClose }: SetupProps) => {
  const [names, setNames] = useState<string[]>(['', ''])
  const [rounds, setRounds] = useState(2)
  const [mode, setMode] = useState<PartyMode>('year')
  const [settle, setSettle] = useState(true)
  const [online, setOnline] = useState(false)
  const firstRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    // On a phone the keyboard would cover the choices, so only a mouse and
    // keyboard setup starts with the cursor in the first name.
    if (window.matchMedia('(pointer: fine)').matches) firstRef.current?.focus()
  }, [])
  useEscape(onClose)

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
          onStart({ names, rounds, mode, settle, online })
        }}
      >
        <header className='party-heading'>
          <span className='party-badge' aria-hidden='true'>
            <Users />
          </span>
          <div>
            <h2>Pass the globe</h2>
            <p>
              Take turns flicking the globe, then guess your way to the best
              score. The night ends with one film to watch.
            </p>
          </div>
        </header>

        <fieldset className='party-segment' aria-label='How you are playing'>
          {[
            { value: false, label: 'Same phone' },
            { value: true, label: 'Over chat' },
          ].map((option) => (
            <button
              type='button'
              aria-pressed={online === option.value}
              key={option.label}
              className={cn(online === option.value && 'is-active')}
              onClick={() => setOnline(option.value)}
            >
              {option.value ? <Link2 aria-hidden='true' /> : null}
              {option.label}
            </button>
          ))}
        </fieldset>
        <p className='party-hint'>
          {online
            ? 'Each turn ends with a link. Send it to the next player and they carry on from their own phone.'
            : 'Pass this phone around the room.'}
        </p>

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
                enterKeyHint='next'
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

        <fieldset className='party-modes'>
          <legend>Game</legend>
          {PARTY_MODES.map((option) => (
            <button
              type='button'
              key={option}
              aria-pressed={mode === option}
              className={cn(mode === option && 'is-active')}
              onClick={() => setMode(option)}
            >
              <strong>{MODE_LABELS[option]}</strong>
              <small>{MODE_BLURBS[option]}</small>
            </button>
          ))}
        </fieldset>

        <div className='party-options'>
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
          <button
            type='button'
            role='switch'
            aria-checked={settle}
            className={cn('party-switch', settle && 'is-on')}
            onClick={() => setSettle((value) => !value)}
          >
            <span>
              <strong>Settle it</strong>
              <small>Veto down to tonight&rsquo;s film</small>
            </span>
            <i />
          </button>
        </div>

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
  // Over chat, the player holding this phone.
  me: number | null
  onEnd: () => void
}

// The pill under the top bar while a player is up and the globe is theirs.
export const PartyHud = ({ state, me, onEnd }: HudProps) => {
  const index = me ?? currentPlayerIndex(state)
  const player = state.players[index]
  const mode = currentRoundMode(state)
  const prompt =
    mode === 'year'
      ? 'flick, then guess the year'
      : mode === 'rating'
        ? 'flick, then guess the rating'
        : 'flick and let the others vote'

  return (
    <aside className='party-hud' aria-label='Pass the globe'>
      <div className='party-pill' data-phase={state.phase}>
        <Dot index={index} name={player?.name ?? ''} />
        <span className='party-copy'>
          <strong>{player?.name}&rsquo;s turn</strong>
          <small className={cn(state.notice && 'is-notice')} aria-live='polite'>
            {state.notice ??
              `Round ${currentRound(state)} of ${state.rounds} · ${prompt}`}
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
      </div>
      <ul className='party-scores'>
        {state.players.map((item, at) => (
          <li
            key={`score-${PLAYER_COLORS[at]}`}
            className={cn(at === index && 'is-up')}
            style={{ '--player': colorOf(at) } as never}
          >
            <i />
            <span>{item.name}</span>
            <b>{playerTotal(item)}</b>
          </li>
        ))}
      </ul>
    </aside>
  )
}

// ------------------------------------------------------------------ final

type FinalProps = {
  state: PartyState
  // The label for the main button and whether it hands the phone on.
  primary: { label: string; onClick: () => void } | null
  onAgain: () => void
  onDone: () => void
  onShare?: () => void
}

export const PartyFinal = ({
  state,
  primary,
  onAgain,
  onDone,
  onShare,
}: FinalProps) => {
  const ranked = standings(state.players)
  const top = new Set(winners(state.players))
  useEscape(onDone)

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
            <p>{MODE_LABELS[state.mode]} · final scores</p>
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
          {primary ? (
            <button
              type='button'
              className='party-start'
              onClick={primary.onClick}
            >
              {primary.label}
              <ArrowRight aria-hidden='true' />
            </button>
          ) : (
            <button type='button' className='party-start' onClick={onAgain}>
              Play again
            </button>
          )}
          <button type='button' className='party-ghost' onClick={onDone}>
            Done
          </button>
        </div>
        {onShare && !primary ? (
          <button type='button' className='party-quit' onClick={onShare}>
            Copy a link to these results
          </button>
        ) : null}
      </div>
    </section>
  )
}
