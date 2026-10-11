import { Lock, Share2 } from 'lucide-react'
import { useId, useSyncExternalStore } from 'react'
import { TIER_LABELS, type Tier, hasUnlockedGold } from './shuffle-pro-logic'
import { shuffleProStore } from './shuffle-pro-store'
import { PALETTES } from './sky-pass'
import { GEM_BODY, GEM_FACETS, GEM_SHINE, GEM_TOP } from './tier-art'

const SHELF_ORDER: Tier[] = ['frost', 'amethyst', 'jade', 'gold']

const css = ([r, g, b]: [number, number, number]) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`

// A cut gem, filled with the path's colours once found and drawn as a dim
// outline until then.
export const Gem = ({ tier, found }: { tier: Tier; found: boolean }) => {
  const id = useId()
  const palette = PALETTES[tier]
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

// The collection shelf: one slot per path. Undiscovered slots never spoil a
// name; Gold stays behind a faint lock until the other three are found.
export const ShuffleProShelf = ({ title = true, onShare }: ShelfProps) => {
  const data = useSyncExternalStore(
    shuffleProStore.subscribe,
    shuffleProStore.get,
    shuffleProStore.get,
  )
  const goldUnlocked = hasUnlockedGold(data.found)

  return (
    <section className='sp-shelf' aria-label='Easter egg collection'>
      {title ? <h3 className='sp-shelf-title'>Easter egg</h3> : null}
      <ul className='sp-shelf-slots'>
        {SHELF_ORDER.map((tier) => {
          const entry = data.found[tier]
          const locked = tier === 'gold' && !goldUnlocked && !entry
          return (
            <li
              key={tier}
              className='sp-shelf-slot'
              data-tier={tier}
              data-found={entry ? 'true' : 'false'}
              data-locked={locked ? 'true' : undefined}
            >
              <span className='sp-shelf-gem'>
                <Gem tier={tier} found={Boolean(entry)} />
                {entry ? null : locked ? (
                  <Lock className='sp-shelf-lock' aria-hidden='true' />
                ) : (
                  <span className='sp-shelf-mark' aria-hidden='true'>
                    ?
                  </span>
                )}
              </span>
              {entry ? (
                <span className='sp-shelf-name'>
                  {TIER_LABELS[tier]}
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
      {onShare && data.totalRuns > 0 ? (
        <button type='button' className='sp-shelf-share' onClick={onShare}>
          <Share2 aria-hidden='true' />
          Share your run
        </button>
      ) : null}
    </section>
  )
}
