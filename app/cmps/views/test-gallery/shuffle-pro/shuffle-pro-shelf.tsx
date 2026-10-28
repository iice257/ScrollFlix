import { Share2 } from 'lucide-react'
import { useId, useSyncExternalStore } from 'react'
import { MOOD_PATH_SWATCHES, paletteFromAccents } from './mood-run'
import { shelfSlots } from './shelf-slots'
import {
  MOOD_PATHS,
  MOOD_PATH_LABELS,
  type MoodPath,
  TIER_LABELS,
  type Tier,
} from './shuffle-pro-logic'
import { type ShuffleProData, shuffleProStore } from './shuffle-pro-store'
import { PALETTES, type Palette } from './sky-pass'
import { GEM_BODY, GEM_FACETS, GEM_SHINE, GEM_TOP } from './tier-art'

const css = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`

// A cut gem, filled with the path's colours once found and drawn as a dim
// outline until then.
export const Gem = ({
  tier,
  found,
  palette: custom,
}: {
  tier: Tier
  found: boolean
  // A mood run's own colours, in place of the path's.
  palette?: Palette
}) => {
  const id = useId()
  const palette = custom ?? PALETTES[tier]
  return (
    <svg className='sp-gem' viewBox='0 0 48 48' aria-hidden='true'>
      <defs>
        <linearGradient id={`${id}-a`} x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0' stopColor={css(palette.c0)} />
          <stop offset='0.55' stopColor={css(palette.c1)} />
          <stop offset='1' stopColor={css(palette.c2)} />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1='0' y1='1' x2='1' y2='0'>
          <stop offset='0' stopColor={css(palette.c2)} />
          <stop offset='1' stopColor={css(palette.c1)} />
        </linearGradient>
      </defs>
      <path
        className='sp-gem-body'
        d={GEM_BODY}
        style={{ fill: found ? `url(#${id}-a)` : 'none' }}
      />
      {found ? (
        <>
          <path d={GEM_TOP} style={{ fill: `url(#${id}-b)` }} opacity='0.55' />
          <path d={GEM_FACETS} />
          <path className='sp-gem-shine' d={GEM_SHINE} />
        </>
      ) : null}
    </svg>
  )
}

type ShelfProps = {
  // Show the section title (the maximized About page has its own heading).
  title?: boolean
  // Opens the share sheet for the run recap; shown once there has been a run.
  onShare?: () => void
}

// The collection shelf: three seats, taken in the order the eggs were found,
// with a "+N" tile once there are more. An empty seat never spoils a name.
export const ShuffleProShelf = ({ title = true, onShare }: ShelfProps) => {
  const data = useSyncExternalStore(
    shuffleProStore.subscribe,
    shuffleProStore.get,
    shuffleProStore.get,
  )
  const { shown, empty, more } = shelfSlots(data.found)

  return (
    <section className='sp-shelf' aria-label='Easter eggs'>
      {title ? <h3 className='sp-shelf-title'>Easter eggs</h3> : null}
      <ul className='sp-shelf-slots'>
        {shown.map(({ tier, entry }) => (
          <li
            key={tier}
            className='sp-shelf-slot'
            data-tier={tier}
            data-found='true'
          >
            <span className='sp-shelf-gem'>
              <Gem tier={tier} found />
            </span>
            <span className='sp-shelf-name'>
              {TIER_LABELS[tier]}
              <small>×{entry.count}</small>
            </span>
          </li>
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
            key={`empty-${index}`}
            className='sp-shelf-slot'
            data-tier='frost'
            data-found='false'
          >
            <span className='sp-shelf-gem'>
              <Gem tier='frost' found={false} />
              <span className='sp-shelf-mark' aria-hidden='true'>
                ?
              </span>
            </span>
            <span className='sp-shelf-name is-hidden'>
              <span className='sr-only'>Not found yet</span>
              <span aria-hidden='true'>?</span>
            </span>
          </li>
        ))}
        {more > 0 ? (
          <li className='sp-shelf-slot' data-found='true' data-more='true'>
            <span className='sp-shelf-gem'>
              <span className='sp-shelf-more'>+{more}</span>
            </span>
            <span className='sp-shelf-name'>
              <span className='sr-only'>{more} more found</span>
              <span aria-hidden='true'>more</span>
            </span>
          </li>
        ) : null}
      </ul>
      {MOOD_PATHS.some((path) => data.moodPaths[path]) ? (
        <MoodPathsRow moodPaths={data.moodPaths} />
      ) : null}
      {onShare && data.totalRuns > 0 ? (
        <button type='button' className='sp-shelf-share' onClick={onShare}>
          <Share2 aria-hidden='true' />
          Share your run
        </button>
      ) : null}
    </section>
  )
}

const MOOD_SHELF_LOOK: Record<MoodPath, Tier> = {
  resonance: 'amethyst',
  eclipse: 'jade',
  wanderer: 'frost',
}

// The bonus paths only the mood page starts. The row appears once one has been
// found; the rest stay as question marks, and nothing says how to find them.
const MoodPathsRow = ({
  moodPaths,
}: {
  moodPaths: ShuffleProData['moodPaths']
}) => (
  <ul className='sp-shelf-slots sp-shelf-mood' aria-label='Mood paths'>
    {MOOD_PATHS.map((path) => {
      const entry = moodPaths[path]
      return (
        <li
          key={path}
          className='sp-shelf-slot'
          data-tier={MOOD_SHELF_LOOK[path]}
          data-mood-path={path}
          data-found={entry ? 'true' : 'false'}
        >
          <span className='sp-shelf-gem'>
            <Gem
              tier={MOOD_SHELF_LOOK[path]}
              palette={paletteFromAccents(MOOD_PATH_SWATCHES[path])}
              found={Boolean(entry)}
            />
            {entry ? null : (
              <span className='sp-shelf-mark' aria-hidden='true'>
                ?
              </span>
            )}
          </span>
          {entry ? (
            <span className='sp-shelf-name'>
              {MOOD_PATH_LABELS[path]}
              <small>×{entry.count}</small>
            </span>
          ) : (
            <span className='sp-shelf-name is-hidden'>
              <span className='sr-only'>Not found yet</span>
              <span aria-hidden='true'>?</span>
            </span>
          )}
        </li>
      )
    })}
  </ul>
)
