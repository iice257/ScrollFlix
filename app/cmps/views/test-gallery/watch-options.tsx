import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  type WatchOptions,
  type WatchProvider,
  badgeSummary,
  getCachedWatchOptions,
  groupByKind,
  loadWatchOptions,
  providerLogoUrl,
  tmdbIdOfMovie,
} from './watch-providers'

type WatchOptionsListProps = {
  movieId: string
  title: string
}

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; options: WatchOptions }

const regionName = (region: string) => {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(region)
  } catch {
    return region
  }
}

// Where the film is on right now in the visitor's country, grouped by how it
// is offered, from JustWatch's listings (through TMDB). Each row opens the
// service's own search for the title, or the film's TMDB watch page when we
// have no search link for that service. With no listing, nothing is claimed:
// no service, no country.
export const WatchOptionsList = ({ movieId, title }: WatchOptionsListProps) => {
  const [state, setState] = useState<State>({ status: 'loading' })
  // biome-ignore lint/correctness/useExhaustiveDependencies: the id is the trigger
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    loadWatchOptions(movieId, title)
      .then((options) => {
        if (!cancelled) setState({ status: 'ready', options })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [movieId])

  if (state.status === 'loading') {
    return (
      <div className='warp-watch-body' aria-busy='true'>
        <div className='warp-watch-skeleton' />
        <div className='warp-watch-skeleton' />
        <div className='warp-watch-skeleton' />
      </div>
    )
  }

  if (state.status === 'failed') {
    return (
      <output className='warp-watch-note'>
        Couldn't load streaming options right now. Try again in a moment.
      </output>
    )
  }

  const { options } = state
  const groups = groupByKind(options.providers)

  return (
    <div className='warp-watch-body'>
      {groups.length === 0 ? (
        <p className='warp-watch-note'>
          No verified streaming listings for this film.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.kind} className='warp-watch-group'>
            <h3>{group.label}</h3>
            <ul>
              {group.providers.map((provider) => {
                const href = provider.url ?? options.link
                // What the link opens: the service's search, or the film's
                // watch page on TMDB.
                const opens = provider.url ? 'Search' : 'Listing'
                const row = (
                  <>
                    {provider.logoPath ? (
                      <img
                        src={providerLogoUrl(provider.logoPath)}
                        alt=''
                        width={32}
                        height={32}
                        loading='lazy'
                        decoding='async'
                        crossOrigin='anonymous'
                      />
                    ) : (
                      <span className='warp-watch-logo-blank' aria-hidden />
                    )}
                    <span>{provider.name}</span>
                    {href ? (
                      <>
                        <small className='warp-watch-opens'>{opens}</small>
                        <ExternalLink aria-hidden='true' size={14} />
                      </>
                    ) : null}
                  </>
                )
                return (
                  <li key={provider.id}>
                    {href ? (
                      <a
                        href={href}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='warp-watch-row'
                      >
                        {row}
                      </a>
                    ) : (
                      <span className='warp-watch-row'>{row}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
      <p className='warp-watch-credit'>
        {options.link ? (
          <a href={options.link} target='_blank' rel='noopener noreferrer'>
            See all options
          </a>
        ) : null}
        {options.link && groups.length ? ' · ' : null}
        {groups.length
          ? `Listings for ${regionName(options.region) ?? options.region} from JustWatch`
          : null}
      </p>
    </div>
  )
}

// How long the card waits before asking for its badges, so its poster loads
// first.
const BADGE_DELAY_MS = 700

const preloadLogo = (url: string) =>
  new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      image.decode().then(resolve, resolve)
    }
    image.onerror = reject
    image.src = url
  })

// The services the card's Watch button shows for a film: confirmed listings
// in the visitor's country, with a link (see badgeProviders). Empty until
// known, and empty when nothing is confirmed: no badge is ever a guess.
export type WatchBadgeState = { providers: WatchProvider[]; more: number }
const NO_BADGES: WatchBadgeState = { providers: [], more: 0 }

export const useWatchBadges = (
  movieId: string,
  title: string,
): WatchBadgeState => {
  const [badges, setBadges] = useState<WatchBadgeState>(() => {
    const cached = getCachedWatchOptions(movieId)
    if (!cached) return NO_BADGES
    const { shown, more } = badgeSummary(cached)
    return { providers: shown, more }
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: the id is the trigger
  useEffect(() => {
    const cached = getCachedWatchOptions(movieId)
    if (cached) {
      const { shown, more } = badgeSummary(cached)
      setBadges({ providers: shown, more })
      return
    }
    setBadges(NO_BADGES)
    if (!tmdbIdOfMovie(movieId)) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      loadWatchOptions(movieId, title)
        .then((options) => {
          const { shown, more } = badgeSummary(options)
          // The badges appear together, once their logos are decoded: never
          // as empty slots, and the button changes width only once.
          return Promise.all(
            shown.map((provider) =>
              preloadLogo(providerLogoUrl(provider.logoPath ?? '')).then(
                () => provider,
                () => null,
              ),
            ),
          ).then((ready) => ({
            providers: ready.filter(
              (provider): provider is WatchProvider => provider !== null,
            ),
            more,
          }))
        })
        .then((next) => {
          if (!cancelled) setBadges(next)
        })
        .catch(() => {
          // No badges; the sheet tries again when opened.
        })
    }, BADGE_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [movieId])
  return badges
}

// Small logos of the services a film is confirmed on, overlapping.
export const WatchBadges = ({ providers, more }: WatchBadgeState) =>
  providers.length ? (
    <span className='warp-watch-badges' aria-hidden='true'>
      {providers.map((provider) =>
        provider.logoPath ? (
          <img
            key={provider.id}
            src={providerLogoUrl(provider.logoPath)}
            alt=''
            width={26}
            height={26}
            decoding='async'
            crossOrigin='anonymous'
          />
        ) : null,
      )}
      {more > 0 ? <b className='warp-watch-more'>+{more}</b> : null}
    </span>
  ) : null
