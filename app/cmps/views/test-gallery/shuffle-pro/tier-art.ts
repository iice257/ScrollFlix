// Vector art shared by the page (as SVG) and the share artwork (as Path2D),
// so a path looks the same in the app and in what gets shared.

import type { Tier } from './shuffle-pro-logic'

export type ArtPath = {
  d: string
  // Filled shapes have no stroke; the rest are drawn as lines.
  fill?: boolean
  opacity?: number
  width?: number
}

// The corner flourish for each path, drawn for the top-left corner of a
// 64x64 box and mirrored into the other three.
export const CORNER_ART: Record<Tier, ArtPath[]> = {
  frost: [
    { d: 'M5 5L42 42' },
    { d: 'M20 20V7M20 20H7' },
    { d: 'M30 30V15M30 30H15', opacity: 0.8 },
    { d: 'M12 12L25 9M12 12L9 25', opacity: 0.7 },
    { d: 'M42 42l3-3 3 3-3 3z', fill: true },
    { d: 'M7 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', fill: true },
  ],
  amethyst: [
    { d: 'M4 44C4 22 22 4 44 4' },
    { d: 'M4 34C4 18 18 4 34 4', opacity: 0.6 },
    {
      d: 'M30 14L32.4 21.6 40 24 32.4 26.4 30 34 27.6 26.4 20 24 27.6 21.6Z',
      fill: true,
    },
    { d: 'M8 8C16 10 22 16 24 24 16 22 10 16 8 8Z', fill: true, opacity: 0.55 },
  ],
  jade: [
    { d: 'M4 46C4 24 24 4 46 4' },
    { d: 'M4 34C4 18 18 4 34 4', opacity: 0.6 },
    {
      d: 'M12 12C21 12 26 18 26 27 17 27 12 21 12 12Z',
      fill: true,
      opacity: 0.8,
    },
    { d: 'M12 12L22 22', opacity: 0.7 },
    { d: 'M38 14m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0', fill: true },
  ],
  gold: [
    { d: 'M4 60V30C4 15 15 4 30 4H60' },
    { d: 'M12 60V34C12 22 22 12 34 12H60', opacity: 0.7 },
    { d: 'M4 4C14 6 20 12 22 22 12 20 6 14 4 4Z', fill: true, opacity: 0.85 },
    { d: 'M30 30m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0', fill: true },
    { d: 'M30 22V26M30 34V38M22 30H26M34 30H38', width: 1 },
  ],
}

// A cut gem in a 48x48 box: the outline, and the inner facet lines.
export const GEM_BODY = 'M14 7h20l10 12-20 22L4 19z'
export const GEM_TOP = 'M4 19h40L34 7H14z'
export const GEM_FACETS =
  'M24 19l-10-12M24 19l10-12M24 19v22M4 19l20 22M44 19L24 41'
export const GEM_SHINE = 'M16 10l5 8'
