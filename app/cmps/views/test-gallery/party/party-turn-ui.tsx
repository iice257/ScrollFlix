// The three screens of a turn once the globe has landed: the guess, the
// crowd's vote, and the reveal. On a phone they are bottom sheets, so the
// thumb never has to leave the lower half of the screen.

import { ArrowRight, Check, Film, Minus, Plus, Star, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { playCue } from '../../../../audio/sound-engine'
import { cn } from '../../../../utils/tw'
import { overlayScrollbarRef } from '../../../ui/use-overlay-scrollbar'
import {
  type PartyState,
  type VoteSlot,
  currentPlayerIndex,
  currentRound,
  voteSlots,
} from './party-logic'
import {
  Dot,
  EndButton,
  MODE_LABELS,
  type PartyMovieInfo,
  Poster,
  ROUND_PROMPTS,
  colorOf,
  useCountUp,
} from './party-parts'

const THIS_YEAR = new Date().getFullYear()
const DECADES = Array.from({ length: 13 }, (_, at) => 1900 + at * 10)
const RATING_STEPS = 0.5

const Sheet = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <section className='party-layer is-sheet' aria-label={label}>
    <div className='party-backdrop is-soft' aria-hidden='true' />
    <div className='party-card party-sheet' ref={overlayScrollbarRef}>
      <span className='party-grip' aria-hidden='true' />
      {children}
    </div>
  </section>
)

const LandedHeader = ({
  state,
  movie,
  title,
  prompt,
}: {
  state: PartyState
  movie: PartyMovieInfo | undefined
  title: string
  prompt: string
}) => {
  const index = currentPlayerIndex(state)
  const name = state.players[index]?.name ?? ''
  return (
    <header className='party-landed'>
      <Poster src={movie?.posterUrl} title={title} className='is-small' />
      <div>
        <span className='party-eyebrow'>
          <i style={{ background: colorOf(index) }} />
          {name} · Round {currentRound(state)} of {state.rounds}
        </span>
        <h2>{title}</h2>
        <p>{prompt}</p>
      </div>
    </header>
  )
}

// ------------------------------------------------------------------ guess

type GuessProps = {
  state: PartyState
  movie: PartyMovieInfo | undefined
  onLock: (value: number) => void
  onEnd: () => void
}

const YearPicker = ({
  value,
  onChange,
}: {
  value: number
  onChange: (year: number) => void
}) => {
  const decade = Math.floor(value / 10) * 10
  const railRef = useRef<HTMLFieldSetElement | null>(null)
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const first = useRef(true)
  // Keep the chosen decade centred in the rail. Setting scrollLeft by hand
  // (not scrollIntoView) so the sheet itself never scrolls with it. The
  // rail jumps on open and glides after that.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-centre when the decade changes
  useEffect(() => {
    const rail = railRef.current
    const chip = activeRef.current
    if (!rail || !chip) return
    const left = chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2
    rail.scrollTo({ left, behavior: first.current ? 'auto' : 'smooth' })
    first.current = false
  }, [decade])
  return (
    <div className='party-year'>
      <div className='party-stepper'>
        <button
          type='button'
          aria-label='One year earlier'
          disabled={value <= 1900}
          onClick={() => onChange(value - 1)}
        >
          <Minus aria-hidden='true' />
        </button>
        <output aria-live='polite' aria-label='Year'>
          {value}
        </output>
        <button
          type='button'
          aria-label='One year later'
          disabled={value >= THIS_YEAR}
          onClick={() => onChange(value + 1)}
        >
          <Plus aria-hidden='true' />
        </button>
      </div>
      <fieldset className='party-decades' aria-label='Decade' ref={railRef}>
        {DECADES.filter((item) => item <= THIS_YEAR).map((item) => (
          <button
            type='button'
            key={item}
            ref={item === decade ? activeRef : undefined}
            aria-pressed={item === decade}
            className={cn(item === decade && 'is-active')}
            onClick={() => onChange(Math.min(THIS_YEAR, item + 5))}
          >
            {item}s
          </button>
        ))}
      </fieldset>
      <fieldset className='party-years' aria-label='Year'>
        {Array.from({ length: 10 }, (_, at) => decade + at).map((year) => (
          <button
            type='button'
            key={year}
            disabled={year > THIS_YEAR}
            aria-pressed={year === value}
            className={cn(year === value && 'is-active')}
            onClick={() => onChange(year)}
          >
            {String(year).slice(2)}
          </button>
        ))}
      </fieldset>
    </div>
  )
}

const RatingPicker = ({
  value,
  onChange,
}: {
  value: number
  onChange: (rating: number) => void
}) => (
  <div className='party-rating'>
    <output aria-live='polite' aria-label='Rating'>
      <Star aria-hidden='true' />
      {value.toFixed(1)}
    </output>
    <input
      type='range'
      min={1}
      max={10}
      step={RATING_STEPS}
      value={value}
      aria-label='Rating out of 10'
      style={{ '--fill': `${((value - 1) / 9) * 100}%` } as never}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    <div className='party-rating-scale' aria-hidden='true'>
      <span>1</span>
      <span>5</span>
      <span>10</span>
    </div>
  </div>
)

export const PartyGuess = ({ state, movie, onLock, onEnd }: GuessProps) => {
  const current = state.current
  const [year, setYear] = useState(2005)
  const [rating, setRating] = useState(6.5)
  if (!current) return null
  const isYear = current.mode === 'year'

  return (
    <Sheet label='Make your guess'>
      <LandedHeader
        state={state}
        movie={movie}
        title={current.film.title}
        prompt={ROUND_PROMPTS[current.mode]}
      />
      {isYear ? (
        <YearPicker value={year} onChange={setYear} />
      ) : (
        <RatingPicker value={rating} onChange={setRating} />
      )}
      <button
        type='button'
        className='party-start'
        onClick={() => {
          playCue('confirm')
          onLock(isYear ? year : rating)
        }}
      >
        Lock it in
        <ArrowRight aria-hidden='true' />
      </button>
      <EndButton onEnd={onEnd} />
    </Sheet>
  )
}

// ------------------------------------------------------------------- vote

type VoteProps = {
  state: PartyState
  movieOf: (movieId: string) => PartyMovieInfo | undefined
  onSubmit: (yes: boolean[]) => void
  onEnd: () => void
}

type VoteGroup = {
  key: string
  slots: { slot: VoteSlot; at: number }[]
}

export const PartyVote = ({ state, movieOf, onSubmit, onEnd }: VoteProps) => {
  const slots = useMemo(() => voteSlots(state), [state])
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const local = Boolean(state.current)
  const count = state.players.length

  const groups = useMemo(() => {
    const byLanding = new Map<string, VoteGroup>()
    slots.forEach((slot, at) => {
      const key = String(slot.pickIndex ?? 'now')
      const group = byLanding.get(key) ?? { key, slots: [] }
      group.slots.push({ slot, at })
      byLanding.set(key, group)
    })
    return [...byLanding.values()]
  }, [slots])

  const landing = (group: VoteGroup) => {
    const first = group.slots[0].slot
    if (first.pickIndex === null && state.current) {
      return {
        title: state.current.film.title,
        movie: movieOf(state.current.film.id),
        owner: first.owner,
      }
    }
    const order = first.pickIndex ?? 0
    const pick = state.players[order % count]?.picks[Math.floor(order / count)]
    return {
      title: pick?.title ?? 'A film',
      movie: pick ? movieOf(pick.movieId) : undefined,
      owner: first.owner,
    }
  }

  const answered = slots.every((_, at) => answers[String(at)] !== undefined)
  const voter = slots[0]?.voter ?? 0
  const heading = local
    ? `${state.players[currentPlayerIndex(state)]?.name} landed on`
    : `${state.players[voter]?.name}, before you flick`

  return (
    <Sheet label='Vote'>
      <header className='party-vote-head'>
        <span className='party-eyebrow'>
          <i
            style={{
              background: colorOf(local ? currentPlayerIndex(state) : voter),
            }}
          />
          {local ? MODE_LABELS.crowd : 'Votes owed'}
        </span>
        <h2>
          {local
            ? (state.current?.film.title ?? '')
            : slots.length === 1
              ? 'Would you watch this?'
              : 'Would you watch these?'}
        </h2>
        <p>{local ? 'Would you watch it? Each of you decides.' : heading}</p>
      </header>

      <div className='party-vote-list' ref={overlayScrollbarRef}>
        {groups.map((group) => {
          const info = landing(group)
          return (
            <section className='party-vote' key={group.key}>
              <div className='party-vote-film'>
                <Poster
                  src={info.movie?.posterUrl}
                  title={info.title}
                  className='is-small'
                />
                <div>
                  <strong>{info.title}</strong>
                  <small>
                    {local
                      ? [info.movie?.year, info.movie?.rating]
                          .filter(Boolean)
                          .join(' · ')
                      : `Landed by ${state.players[info.owner]?.name}`}
                  </small>
                </div>
              </div>
              {group.slots.map(({ slot, at }) => {
                const answer = answers[String(at)]
                const name = state.players[slot.voter]?.name ?? ''
                return (
                  <div
                    className='party-ballot'
                    key={`${group.key}-${slot.voter}`}
                  >
                    {local ? (
                      <span className='party-ballot-who'>
                        <Dot index={slot.voter} name={name} size='sm' />
                        {name}
                      </span>
                    ) : null}
                    <fieldset
                      className='party-choice'
                      aria-label={`${name}: would you watch ${info.title}?`}
                    >
                      <button
                        type='button'
                        aria-pressed={answer === true}
                        className={cn(answer === true && 'is-yes')}
                        onClick={() =>
                          setAnswers((now) => ({ ...now, [String(at)]: true }))
                        }
                      >
                        <Check aria-hidden='true' />
                        Would watch
                      </button>
                      <button
                        type='button'
                        aria-pressed={answer === false}
                        className={cn(answer === false && 'is-no')}
                        onClick={() =>
                          setAnswers((now) => ({ ...now, [String(at)]: false }))
                        }
                      >
                        <X aria-hidden='true' />
                        Pass
                      </button>
                    </fieldset>
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>

      <button
        type='button'
        className='party-start'
        disabled={!answered}
        onClick={() => {
          playCue('confirm')
          onSubmit(slots.map((_, at) => answers[String(at)] === true))
        }}
      >
        {local ? 'Reveal' : 'Done voting'}
        <ArrowRight aria-hidden='true' />
      </button>
      <EndButton onEnd={onEnd} />
    </Sheet>
  )
}

// ----------------------------------------------------------------- reveal

type RevealProps = {
  state: PartyState
  movie: PartyMovieInfo | undefined
  // "Pass to Bo", "Results" and so on.
  nextLabel: string
  onNext: () => void
  onOpenFilm: () => void
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`

export const PartyReveal = ({
  state,
  movie,
  nextLabel,
  onNext,
  onOpenFilm,
}: RevealProps) => {
  const last = state.last
  const shown = useCountUp(last?.score ?? 0)
  const bullseye =
    last !== null &&
    last.mode !== 'crowd' &&
    ((last.mode === 'year' && last.guess === last.year) ||
      (last.mode === 'rating' && last.guess === last.rating))

  useEffect(() => {
    if (!last) return
    playCue('landing')
    if (bullseye || (last.mode === 'crowd' && last.score >= 100))
      window.setTimeout(() => playCue('heart'), 700)
  }, [last, bullseye])

  if (!last) return null
  const player = state.players[last.player]
  const waiting =
    last.mode === 'crowd' && last.votes?.voted === 0 && state.online

  let you: string | null = null
  let actual: string | null = null
  let verdict = ''
  if (last.mode === 'year' && last.guess !== undefined && last.year) {
    you = String(last.guess)
    actual = String(last.year)
    const off = Math.abs(last.guess - last.year)
    verdict = off === 0 ? 'Bullseye' : `${plural(off, 'year')} off`
  } else if (
    last.mode === 'rating' &&
    last.guess !== undefined &&
    last.rating
  ) {
    you = last.guess.toFixed(1)
    actual = last.rating.toFixed(1)
    const off = Math.abs(last.guess - last.rating)
    verdict = off === 0 ? 'Bullseye' : `${off.toFixed(1)} off`
  } else if (last.mode === 'crowd' && last.votes) {
    const yes = [...Array(state.players.length).keys()].filter(
      (at) => last.votes && (last.votes.yes >> at) & 1,
    ).length
    verdict = waiting
      ? 'Votes come in on each turn'
      : `${yes} of ${state.players.length - 1} would watch`
  }

  return (
    <section className='party-layer is-sheet' aria-label='Result'>
      <div className='party-backdrop is-soft' aria-hidden='true' />
      <div
        className='party-card party-sheet party-reveal'
        ref={overlayScrollbarRef}
      >
        <span className='party-grip' aria-hidden='true' />
        <div className='party-reveal-film'>
          <Poster src={movie?.posterUrl} title={last.title} />
          <div>
            <span className='party-eyebrow'>
              <i style={{ background: colorOf(last.player) }} />
              {player?.name} · {MODE_LABELS[last.mode]}
            </span>
            <h2>{last.title}</h2>
            <p>
              {[last.year, last.rating ? `★ ${last.rating.toFixed(1)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        <div className={cn('party-score', bullseye && 'is-bullseye')}>
          <b aria-live='polite'>{waiting ? '—' : `+${shown}`}</b>
          {verdict ? (
            <span className={cn('party-verdict', bullseye && 'is-bullseye')}>
              {bullseye ? <Star aria-hidden='true' /> : null}
              {verdict}
            </span>
          ) : null}
        </div>

        {you && actual ? (
          <dl className='party-compare'>
            <div>
              <dt>{player?.name} said</dt>
              <dd>{you}</dd>
            </div>
            <div>
              <dt>It was</dt>
              <dd>{actual}</dd>
            </div>
          </dl>
        ) : null}

        <div className='party-actions'>
          <button type='button' className='party-start' onClick={onNext}>
            {nextLabel}
            <ArrowRight aria-hidden='true' />
          </button>
          <button
            type='button'
            className='party-ghost is-icon'
            aria-label={`Open ${last.title}`}
            onClick={onOpenFilm}
          >
            <Film aria-hidden='true' />
            Open film
          </button>
        </div>
      </div>
    </section>
  )
}
