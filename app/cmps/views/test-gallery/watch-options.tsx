import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  type WatchOptions,
  groupByKind,
  loadWatchOptions,
  providerLogoUrl,
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
// is offered. Each row opens the service's own search for the title; the
// footer opens the full JustWatch page for the film.
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
          Not listed on any streaming service in{' '}
          {regionName(options.region) ?? options.region} yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.kind} className='warp-watch-group'>
            <h3>{group.label}</h3>
            <ul>
              {group.providers.map((provider) => {
                const href = provider.url ?? options.link
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
                      />
                    ) : (
                      <span className='warp-watch-logo-blank' aria-hidden />
                    )}
                    <span>{provider.name}</span>
                    {href ? (
                      <ExternalLink aria-hidden='true' size={14} />
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
        {options.link ? ' · ' : null}
        Availability in {regionName(options.region) ?? options.region} from
        JustWatch
      </p>
    </div>
  )
}
