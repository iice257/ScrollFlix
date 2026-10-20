// What every cue is made of: one small click, tuned for what it is for.
//
// The whole interface speaks with a single family of clicks (the hover, tap and
// spin clips in the sprite, see sound-bank.ts). A cue picks a family, then
// leans it: higher for opening and saving, lower for closing and landing,
// softer for hovering. Nothing is layered, so nothing competes with the
// reveal jingles, which are the only music on the site.
//
//   hover     the softest click, as the pointer crosses a control
//   tap       the press: the same click, a little firmer
//   the rest  tap, tuned: up for open, save and confirm; down for close,
//             grab and settle
//
// Two cues are not clicks: shuffleStart and landing have no layers on purpose,
// so they play their synthesised voices (a soft whoosh as the globe sets off,
// a low thump as it lands). The spinTick clips stay in the sprite, but nothing
// plays them: the turning globe is silent apart from those two.

import type { SoundCategory } from './sound-settings'
import type { Humanize } from './sound-variety'

export type Cue =
  | 'shuffleStart'
  | 'landing'
  | 'heart'
  | 'moodPick'
  | 'moodGo'
  | 'confirm'
  | 'hover'
  | 'tap'
  | 'grab'
  | 'open'
  | 'close'
  | 'settle'
  | 'trailPoint'
  | 'spinTick'

export type LayerRole = 'body'

export type Layer = {
  role: LayerRole
  group: string
  gainDb?: number
  // Fixed lean on the clip's own pitch, in semitones.
  semis?: number
}

export type CueSpec = {
  category: SoundCategory
  minIntervalMs: number
  // Random change per play: pitch in semitones, level in dB.
  humanize: Humanize
  // Where it sits in the stereo field.
  pan: 'pointer' | 'center'
  layers: Layer[]
  // Strength 0..1 interpolates level (and pitch) between the two ends.
  strength?: { gainDb: [number, number]; semis?: [number, number] }
  // Skips the shared voice cap (it fires too often to be counted).
  uncounted?: boolean
}

const hum = (semis: number, gainDb: number): Humanize => ({ semis, gainDb })

// A cue that is the tap click, leaned and nudged.
const tapClick = (semis: number, gainDb = 0): Layer[] => [
  { role: 'body', group: 'tap', semis, gainDb },
]

export const CUE_SPECS: Record<Cue, CueSpec> = {
  hover: {
    category: 'ui',
    minIntervalMs: 55,
    humanize: hum(0.35, 1.5),
    pan: 'pointer',
    layers: [{ role: 'body', group: 'hover' }],
  },
  tap: {
    category: 'ui',
    minIntervalMs: 45,
    humanize: hum(0.5, 1.2),
    pan: 'pointer',
    layers: tapClick(0),
  },
  open: {
    category: 'ui',
    minIntervalMs: 160,
    humanize: hum(0.3, 1),
    pan: 'pointer',
    layers: tapClick(2.5, 1),
  },
  close: {
    category: 'ui',
    minIntervalMs: 160,
    humanize: hum(0.3, 1),
    pan: 'pointer',
    layers: tapClick(-3),
  },
  heart: {
    category: 'ui',
    minIntervalMs: 120,
    humanize: hum(0.25, 1),
    pan: 'pointer',
    layers: tapClick(5, 2),
  },
  confirm: {
    category: 'ui',
    minIntervalMs: 90,
    humanize: hum(0.4, 1),
    pan: 'pointer',
    layers: tapClick(3.5, 1),
  },
  grab: {
    category: 'ui',
    minIntervalMs: 120,
    humanize: hum(0.6, 1.5),
    pan: 'pointer',
    layers: tapClick(-4, 1),
  },
  // Choosing a mood world: the click climbs with the world's place in the row.
  moodPick: {
    category: 'ui',
    minIntervalMs: 70,
    humanize: hum(0, 1),
    pan: 'pointer',
    strength: { gainDb: [0, 0], semis: [-2, 5] },
    layers: tapClick(0),
  },
  moodGo: {
    category: 'ui',
    minIntervalMs: 300,
    humanize: hum(0.2, 0.8),
    pan: 'center',
    layers: tapClick(7, 2),
  },
  // The globe sets off for a random film: the soft synthesised whoosh.
  shuffleStart: {
    category: 'shuffle',
    minIntervalMs: 200,
    humanize: hum(0.2, 0.8),
    pan: 'center',
    layers: [],
  },
  // The globe settles on a film: the soft synthesised low thump.
  landing: {
    category: 'shuffle',
    minIntervalMs: 200,
    humanize: hum(0.4, 1),
    pan: 'center',
    layers: [],
  },
  // A drag or flick comes to rest; a harder one lands lower and firmer.
  settle: {
    category: 'shuffle',
    minIntervalMs: 160,
    humanize: hum(0.5, 1),
    pan: 'pointer',
    strength: { gainDb: [-9, 0], semis: [-2, -6] },
    layers: tapClick(0),
  },
  // A star joins the path: the click steps up the further along the path is.
  trailPoint: {
    category: 'shuffle',
    minIntervalMs: 90,
    humanize: hum(0, 0.8),
    pan: 'pointer',
    strength: { gainDb: [0, 0], semis: [0, 7] },
    layers: tapClick(1),
  },
  // One detent of the turning globe. Level and pitch come from its speed.
  spinTick: {
    category: 'ui',
    minIntervalMs: 28,
    humanize: hum(0.25, 0.6),
    pan: 'pointer',
    uncounted: true,
    layers: [{ role: 'body', group: 'spin' }],
  },
}

export const CUES = Object.keys(CUE_SPECS) as Cue[]

// Every clip group a cue can ask for.
export const groupsOf = (cue: Cue) =>
  Array.from(new Set(CUE_SPECS[cue].layers.map((layer) => layer.group)))
