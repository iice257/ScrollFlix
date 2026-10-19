import { describe, expect, it } from 'vitest'

import {
  buildNowPlayingMeta,
  shouldShowNowPlaying,
  usesNowPlayingBar,
} from './now-playing'

const phone = {
  isMobile: true,
  immersive: false,
  partyActive: false,
  mode: 'wall' as const,
}

const showing = {
  ...phone,
  hasFilm: true,
  galleryReady: true,
  detailsOpen: false,
  runActive: false,
  overlayOpen: false,
}

describe('usesNowPlayingBar', () => {
  it('applies to a plain shuffle on a phone-width globe', () => {
    expect(usesNowPlayingBar(phone)).toBe(true)
  })

  it('leaves wide layouts alone, so the card still opens', () => {
    expect(usesNowPlayingBar({ ...phone, isMobile: false })).toBe(false)
  })

  it('keeps the card for full screen, the party game and other views', () => {
    expect(usesNowPlayingBar({ ...phone, immersive: true })).toBe(false)
    expect(usesNowPlayingBar({ ...phone, partyActive: true })).toBe(false)
    expect(usesNowPlayingBar({ ...phone, mode: 'list' })).toBe(false)
    expect(usesNowPlayingBar({ ...phone, mode: 'filters' })).toBe(false)
  })
})

describe('shouldShowNowPlaying', () => {
  it('shows once a film has landed on the phone globe', () => {
    expect(shouldShowNowPlaying(showing)).toBe(true)
  })

  it('needs a film and a ready globe', () => {
    expect(shouldShowNowPlaying({ ...showing, hasFilm: false })).toBe(false)
    expect(shouldShowNowPlaying({ ...showing, galleryReady: false })).toBe(
      false,
    )
  })

  it('steps aside for the card, a run, or any panel', () => {
    expect(shouldShowNowPlaying({ ...showing, detailsOpen: true })).toBe(false)
    expect(shouldShowNowPlaying({ ...showing, runActive: true })).toBe(false)
    expect(shouldShowNowPlaying({ ...showing, overlayOpen: true })).toBe(false)
  })

  it('goes away when the layout is no longer a phone or the view changes', () => {
    expect(shouldShowNowPlaying({ ...showing, isMobile: false })).toBe(false)
    expect(shouldShowNowPlaying({ ...showing, mode: 'list' })).toBe(false)
  })
})

describe('buildNowPlayingMeta', () => {
  it('joins year, rating and runtime', () => {
    expect(
      buildNowPlayingMeta({ year: '2019', rating: '7.8', runtime: '2h 4m' }),
    ).toBe('2019 · ★ 7.8 · 2h 4m')
  })

  it('skips what the film does not have', () => {
    expect(
      buildNowPlayingMeta({ year: '----', rating: 'N/A', runtime: null }),
    ).toBe('★ N/A')
    expect(
      buildNowPlayingMeta({ year: '1995', rating: '', runtime: '90m' }),
    ).toBe('1995 · 90m')
  })
})
