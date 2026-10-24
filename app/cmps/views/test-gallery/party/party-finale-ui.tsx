// The screens around the edges of a game: the board someone sees when they
// open a link, the "pass it on" prompts, the veto finale, tonight's film, and
// the broken-link card.

import {
  ArrowRight,
  Check,
  Copy,
  Film,
  Link2Off,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../../../utils/tw'
import {
  type PartyState,
  actorIndex,
  catchUpVoter,
  currentRound,
  isFinished,
  playerTotal,
  remainingFilms,
  settleActor,
  standings,
} from './party-logic'
import {
  Dot,
  EndButton,
  MODE_LABELS,
  PLAYER_COLORS,
  type PartyMovieInfo,
  Poster,
  colorOf,
  useEscape,
} from './party-parts'
import type { Handoff } from './use-party'

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

const Scores = ({ state, up }: { state: PartyState; up?: number }) => (
  <ol className='party-board is-compact'>
    {standings(state.players).map((entry) => (
      <li
        key={`rank-${PLAYER_COLORS[entry.index]}`}
        className={cn(entry.index === up && 'is-up')}
        style={{ '--player': colorOf(entry.index) } as never}
      >
        <Dot index={entry.index} name={entry.player.name} size='sm' />
        <span className='party-who'>
          <strong>{entry.player.name}</strong>
        </span>
        <b className='party-total'>{playerTotal(entry.player)}</b>
      </li>
    ))}
  </ol>
)

// ------------------------------------------------------------------ board

type BoardProps = {
  state: PartyState
  onClaim: () => void
  onEnd: () => void
}

// What someone sees when they open a link: where the game stands, and a
// button for the player the link is meant for.
export const PartyBoard = ({ state, onClaim, onEnd }: BoardProps) => {
  const actor = actorIndex(state)
  const name = state.players[actor]?.name ?? ''
  const finished = isFinished(state)
  const owesVotes = finished && catchUpVoter(state) !== null
  const action = !finished
    ? `I’m ${name}, play my turn`
    : owesVotes
      ? `I’m ${name}, cast my votes`
      : `I’m ${name}, start the veto`
  const status = !finished
    ? `Round ${currentRound(state)} of ${state.rounds} · ${MODE_LABELS[state.mode]}`
    : owesVotes
      ? 'Last votes before the final scores'
      : 'Time to settle it'

  return (
    <section className='party-layer is-sheet' aria-label='Pass the globe'>
      <Backdrop />
      <div className='party-card party-sheet'>
        <span className='party-grip' aria-hidden='true' />
        <header className='party-heading'>
          <span className='party-badge' aria-hidden='true'>
            <Users />
          </span>
          <div>
            <h2>{name}&rsquo;s move</h2>
            <p>{status}</p>
          </div>
        </header>
        <Scores state={state} up={actor} />
        <button type='button' className='party-start' onClick={onClaim}>
          {action}
          <ArrowRight aria-hidden='true' />
        </button>
        <EndButton onEnd={onEnd} />
      </div>
    </section>
  )
}

// ------------------------------------------------------------- pass it on

type PassProps = {
  state: PartyState
  onPass: () => void
  onEnd: () => void
}

// This phone's turn is done and the game moves to someone else.
export const PartyPass = ({ state, onPass, onEnd }: PassProps) => {
  const name = state.players[actorIndex(state)]?.name ?? ''
  return (
    <section className='party-layer is-sheet' aria-label='Pass it on'>
      <Backdrop />
      <div className='party-card party-sheet'>
        <span className='party-grip' aria-hidden='true' />
        <header className='party-heading'>
          <span className='party-badge' aria-hidden='true'>
            <Share2 />
          </span>
          <div>
            <h2>Next up: {name}</h2>
            <p>
              Send them the game link. It picks up exactly where you left it.
            </p>
          </div>
        </header>
        <button type='button' className='party-start' onClick={onPass}>
          Pass to {name}
          <ArrowRight aria-hidden='true' />
        </button>
        <EndButton onEnd={onEnd} />
      </div>
    </section>
  )
}

type HandoffProps = {
  handoff: Handoff
  onShare: () => void
  onCopy: () => void
  onDone: () => void
}

// The link is made. Share it again or copy it if the first share didn't land.
export const PartyHandoff = ({
  handoff,
  onShare,
  onCopy,
  onDone,
}: HandoffProps) => {
  useEscape(onDone)
  const everyone = handoff.name === 'everyone'
  return (
    <section className='party-layer is-sheet' aria-label='Link ready'>
      <Backdrop />
      <div className='party-card party-sheet'>
        <span className='party-grip' aria-hidden='true' />
        <header className='party-heading'>
          <span className='party-badge is-green' aria-hidden='true'>
            <Check />
          </span>
          <div>
            <h2>{everyone ? 'Link ready' : `Passed to ${handoff.name}`}</h2>
            <p>
              {handoff.copied
                ? 'The link is copied. Paste it into your chat.'
                : 'Send the link in your chat if it didn’t go through.'}
            </p>
          </div>
        </header>
        <input
          className='party-link'
          readOnly
          value={handoff.url}
          aria-label='Game link'
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className='party-actions'>
          <button type='button' className='party-start' onClick={onShare}>
            <Share2 aria-hidden='true' />
            Share again
          </button>
          <button type='button' className='party-ghost' onClick={onCopy}>
            <Copy aria-hidden='true' />
            {handoff.copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <button type='button' className='party-quit' onClick={onDone}>
          Leave the game on this phone
        </button>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------- settle

type SettleProps = {
  state: PartyState
  movieOf: (movieId: string) => PartyMovieInfo | undefined
  onVeto: (movieId: string) => void
  onPick: (movieId: string) => void
  onEnd: () => void
}

export const PartySettle = ({
  state,
  movieOf,
  onVeto,
  onPick,
  onEnd,
}: SettleProps) => {
  const [chosen, setChosen] = useState<string | null>(null)
  const left = remainingFilms(state)
  const deciding = left.length === 2
  const actor = settleActor(state)
  const name = state.players[actor]?.name ?? ''
  const selected = left.find((pick) => pick.movieId === chosen) ?? null

  const ownerOf = (pick: (typeof left)[number]) =>
    state.players.findIndex((player) =>
      player.picks.some(
        (item) => item.movieId === pick.movieId && item.score === pick.score,
      ),
    )

  return (
    <section className='party-layer is-sheet' aria-label='Settle it'>
      <Backdrop />
      <div className='party-card party-sheet party-settle'>
        <span className='party-grip' aria-hidden='true' />
        <header className='party-heading'>
          <span className='party-badge is-gold' aria-hidden='true'>
            <Sparkles />
          </span>
          <div>
            <h2>{deciding ? `${name} decides` : `${name}, veto one film`}</h2>
            <p>
              {deciding
                ? 'Two films left. The winner picks tonight’s film.'
                : `${left.length} films left. Strike the one you least want to watch.`}
            </p>
          </div>
        </header>
        <ul className={cn('party-shortlist', left.length > 3 && 'is-many')}>
          {left.map((pick) => {
            const info = movieOf(pick.movieId)
            const owner = ownerOf(pick)
            return (
              <li key={pick.movieId}>
                <button
                  type='button'
                  aria-pressed={chosen === pick.movieId}
                  className={cn(chosen === pick.movieId && 'is-chosen')}
                  onClick={() => setChosen(pick.movieId)}
                >
                  <Poster src={info?.posterUrl} title={pick.title} />
                  <strong>{pick.title}</strong>
                  <small>
                    {owner >= 0 ? `${state.players[owner]?.name} · ` : ''}
                    {pick.score} pts
                  </small>
                </button>
              </li>
            )
          })}
        </ul>
        <button
          type='button'
          className={cn('party-start', !deciding && 'is-danger')}
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            setChosen(null)
            if (deciding) onPick(selected.movieId)
            else onVeto(selected.movieId)
          }}
        >
          {deciding
            ? selected
              ? `Watch ${selected.title}`
              : 'Pick a film'
            : selected
              ? `Veto ${selected.title}`
              : 'Pick a film to veto'}
          <ArrowRight aria-hidden='true' />
        </button>
        <EndButton onEnd={onEnd} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- tonight

type TonightProps = {
  state: PartyState
  movie: PartyMovieInfo | undefined
  onOpenFilm: () => void
  onShare: () => void
  onSendGroup: (() => void) | null
  onAgain: () => void
  onDone: () => void
}

export const PartyTonight = ({
  state,
  movie,
  onOpenFilm,
  onShare,
  onSendGroup,
  onAgain,
  onDone,
}: TonightProps) => {
  useEscape(onDone)
  const pick = state.players
    .flatMap((player) => player.picks)
    .find((item) => item.movieId === state.tonight)
  const title = movie?.title || pick?.title || 'Tonight’s film'
  const meta = [
    movie?.year || pick?.year,
    movie?.rating ?? (pick?.rating ? pick.rating.toFixed(1) : null),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className='party-layer' aria-label='Tonight’s film'>
      <Backdrop onClick={onDone} />
      <div className='party-card party-tonight'>
        <Poster src={movie?.posterUrl} title={title} className='is-large' />
        <span className='party-eyebrow is-gold'>
          <Sparkles aria-hidden='true' />
          Tonight&rsquo;s film
        </span>
        <h2>{title}</h2>
        {meta ? <p className='party-meta'>{meta}</p> : null}
        <div className='party-actions is-stack'>
          <button type='button' className='party-start' onClick={onOpenFilm}>
            <Film aria-hidden='true' />
            Open film
          </button>
          <button type='button' className='party-ghost' onClick={onShare}>
            <Share2 aria-hidden='true' />
            Share
          </button>
        </div>
        <div className='party-foot'>
          {onSendGroup ? (
            <button type='button' className='party-quit' onClick={onSendGroup}>
              Send to the group chat
            </button>
          ) : null}
          <button type='button' className='party-quit' onClick={onAgain}>
            Play again
          </button>
          <button type='button' className='party-quit' onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------- broken

type BrokenProps = {
  kind: 'broken' | 'newer'
  onNew: () => void
  onClose: () => void
}

export const PartyBroken = ({ kind, onNew, onClose }: BrokenProps) => {
  useEscape(onClose)
  return (
    <section className='party-layer' aria-label='Game link'>
      <Backdrop onClick={onClose} />
      <div className='party-card'>
        <header className='party-heading'>
          <span className='party-badge is-muted' aria-hidden='true'>
            <Link2Off />
          </span>
          <div>
            <h2>
              {kind === 'newer'
                ? 'This link is from a newer version'
                : 'This game link is broken'}
            </h2>
            <p>
              {kind === 'newer'
                ? 'Refresh the page to get the latest version, then open it again.'
                : 'It may have been cut short when it was copied. Ask for a fresh one, or start your own game.'}
            </p>
          </div>
        </header>
        <div className='party-actions is-stack'>
          <button type='button' className='party-start' onClick={onNew}>
            Start a new game
            <ArrowRight aria-hidden='true' />
          </button>
          <button type='button' className='party-ghost' onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </section>
  )
}
