import { ArrowRight, Crown, X } from 'lucide-react'
import { cn } from '../../../../utils/tw'
import { overlayScrollbarRef } from '../../../ui/use-overlay-scrollbar'
import './party.css'
import './party-v2.css'
import {
  type PartyState,
  currentPlayerIndex,
  currentRound,
  playerTotal,
  standings,
  winners,
} from './party-logic'
import {
  Dot,
  MODE_LABELS,
  PLAYER_COLORS,
  colorOf,
  useEscape,
} from './party-parts'

export { PLAYER_COLORS } from './party-parts'

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

  return (
    <aside className='party-hud' aria-label='Pass the globe'>
      <div className='party-pill' data-phase={state.phase}>
        <Dot index={index} name={player?.name ?? ''} />
        <span className='party-copy'>
          <strong>{player?.name}&rsquo;s turn</strong>
          <small className={cn(state.notice && 'is-notice')} aria-live='polite'>
            {state.notice ??
              `Round ${currentRound(state)} of ${state.rounds} · flick or shuffle`}
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
      <div className='party-card is-final' ref={overlayScrollbarRef}>
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
