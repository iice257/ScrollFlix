// Everything Pass the globe puts on screen, chosen by the game's phase. The
// page shell renders this one component and passes in how to find a film.

import { ArrowRight, Sparkles } from 'lucide-react'
import { Suspense, lazy, useState } from 'react'
import { createPortal } from 'react-dom'
import { shareLink } from '../share/share-link'
import {
  PartyBoard,
  PartyBroken,
  PartyHandoff,
  PartyPass,
  PartySettle,
  PartyTonight,
} from './party-finale-ui'
import {
  type PartyState,
  actorIndex,
  catchUpVoter,
  isFinished,
  partyReducer,
} from './party-logic'
import { Dot, type PartyMovieInfo } from './party-parts'
import { PartyGuess, PartyReveal, PartyVote } from './party-turn-ui'
import { PartyFinal, PartyHud, PartySetup } from './party-ui'
import type { PartyGame } from './use-party'

const ShareSheet = lazy(() => import('../share/share-sheet'))

type Props = {
  game: PartyGame
  movieOf: (movieId: string) => PartyMovieInfo | undefined
  // The film's own card is open (from "Open film").
  detailsOpen: boolean
  onOpenFilm: (movieId: string) => void
  onCloseDetails: () => void
}

// A small pill that stands in for a screen while the film's card is open.
const Dock = ({
  index,
  name,
  title,
  action,
  onClick,
}: {
  index: number
  name: string
  title: string
  action: string
  onClick: () => void
}) => (
  <aside className='party-hud' aria-label='Pass the globe'>
    <div className='party-pill'>
      <Dot index={index} name={name} />
      <span className='party-copy'>
        <strong>{title}</strong>
      </span>
      <button type='button' className='party-next' onClick={onClick}>
        {action}
        <ArrowRight aria-hidden='true' />
      </button>
    </div>
  </aside>
)

export const PartyLayer = ({
  game,
  movieOf,
  detailsOpen,
  onOpenFilm,
  onCloseDetails,
}: Props) => {
  const { party, me, handoff, linkError, dispatch } = game
  const online = party.online

  if (linkError) {
    return (
      <PartyBroken
        kind={linkError}
        onNew={() => {
          game.dismissLinkError()
          dispatch({ type: 'open' })
        }}
        onClose={game.dismissLinkError}
      />
    )
  }
  if (handoff) {
    return (
      <PartyHandoff
        handoff={handoff}
        onShare={() => void game.passOn(party)}
        onCopy={() => void game.copyHandoff()}
        onDone={game.close}
      />
    )
  }

  const board = (
    <PartyBoard state={party} onClaim={game.claim} onEnd={game.close} />
  )
  const pass = (
    <PartyPass
      state={party}
      onPass={() => void game.passOn(party)}
      onEnd={game.close}
    />
  )

  switch (party.phase) {
    case 'setup':
      return (
        <PartySetup
          onStart={(options) => {
            onCloseDetails()
            game.start({ type: 'start', ...options })
          }}
          onClose={game.close}
        />
      )
    case 'turn':
      if ((online && me === null) || isFinished(party)) return board
      return <PartyHud state={party} me={me} onEnd={game.close} />
    case 'guess': {
      const film = party.current?.film
      return (
        <PartyGuess
          state={party}
          movie={film ? movieOf(film.id) : undefined}
          onLock={(value) => dispatch({ type: 'guess', value })}
          onEnd={game.close}
        />
      )
    }
    case 'vote':
      return (
        <PartyVote
          state={party}
          movieOf={movieOf}
          onSubmit={(yes) => dispatch({ type: 'vote', yes })}
          onEnd={game.close}
        />
      )
    case 'result': {
      const last = party.last
      // The last votes of a link game: nothing to reveal, just pass it on.
      if (!last) return pass
      const after: PartyState = partyReducer(party, { type: 'next' })
      const upNext = after.players[actorIndex(after)]?.name ?? ''
      const label =
        after.phase === 'final' && !after.settle
          ? 'Results'
          : online && actorIndex(after) === me
            ? 'Continue'
            : `Pass to ${upNext}`
      if (detailsOpen) {
        return (
          <Dock
            index={last.player}
            name={party.players[last.player]?.name ?? ''}
            title={`${last.score} points`}
            action={label}
            onClick={game.next}
          />
        )
      }
      return (
        <PartyReveal
          state={party}
          movie={movieOf(last.movieId)}
          nextLabel={label}
          onNext={game.next}
          onOpenFilm={() => onOpenFilm(last.movieId)}
        />
      )
    }
    case 'final': {
      const actor = actorIndex(party)
      if (online && party.settle && me === null) return board
      if (
        online &&
        party.settle &&
        me !== actor &&
        catchUpVoter(party) === null
      )
        return pass
      const primary = party.settle
        ? {
            label: 'Tonight’s film',
            onClick: () => dispatch({ type: 'settle' }),
          }
        : null
      return (
        <PartyFinal
          state={party}
          primary={primary}
          onAgain={() => dispatch({ type: 'again' })}
          onDone={game.close}
          onShare={online ? () => void game.passOn(party) : undefined}
        />
      )
    }
    case 'settle': {
      const actor = actorIndex(party)
      if (online && me === null) return board
      if (online && me !== actor) return pass
      return (
        <PartySettle
          state={party}
          movieOf={movieOf}
          onVeto={game.veto}
          onPick={game.pick}
          onEnd={game.close}
        />
      )
    }
    case 'tonight':
      return (
        <Tonight
          game={game}
          movieOf={movieOf}
          detailsOpen={detailsOpen}
          onOpenFilm={onOpenFilm}
          onCloseDetails={onCloseDetails}
        />
      )
    default:
      return null
  }
}

const Tonight = ({
  game,
  movieOf,
  detailsOpen,
  onOpenFilm,
  onCloseDetails,
}: Omit<Props, 'game'> & { game: PartyGame }) => {
  const { party, dispatch } = game
  const [shareOpen, setShareOpen] = useState(false)
  const id = party.tonight
  if (!id) return null
  const movie = movieOf(id)

  if (detailsOpen) {
    return (
      <aside className='party-hud' aria-label='Tonight’s film'>
        <div className='party-pill'>
          <span className='party-badge is-gold is-mini' aria-hidden='true'>
            <Sparkles />
          </span>
          <span className='party-copy'>
            <strong>Tonight&rsquo;s film</strong>
          </span>
          <button type='button' className='party-next' onClick={onCloseDetails}>
            Back
            <ArrowRight aria-hidden='true' />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <>
      <PartyTonight
        state={party}
        movie={movie}
        onOpenFilm={() => onOpenFilm(id)}
        onShare={() => setShareOpen(true)}
        onSendGroup={party.online ? () => void game.passOn(party) : null}
        onAgain={() => dispatch({ type: 'again' })}
        onDone={game.close}
      />
      {shareOpen && movie
        ? createPortal(
            <Suspense fallback={null}>
              <ShareSheet
                input={{
                  title: movie.title,
                  year: movie.year,
                  detail: movie.rating ? `★ ${movie.rating}` : '',
                  tier: null,
                  posterUrl: movie.posterDetailUrl ?? movie.posterUrl ?? '',
                  foundTiers: [],
                }}
                link={shareLink(movie.id)}
                onClose={() => setShareOpen(false)}
              />
            </Suspense>,
            document.querySelector('.warp-shell') ?? document.body,
          )
        : null}
    </>
  )
}
