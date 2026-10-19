// Everything the audition page lists, from the build's measurements: the clips
// in the shipped sprite, the clips the objective gate held back, and the
// candidate jingles. One flat row per clip, with its loudness target from the
// plan so the page can show how far each one sits from it.

import analysis from '../audio/sound-analysis.json'
import plan from '../audio/sound-plan.json'
import candidates from './candidates-analysis.json'

export type ClipSet = 'shipped' | 'held-back' | 'candidate'

export type ClipRow = {
  name: string
  set: ClipSet
  group: string
  role: string
  durationMs: number
  lufs: number
  truePeakDb: number
  centroidHz: number
  attackMs: number
  flags: string[]
  targetLufs: number
  deltaLu: number
  source: string
  // Candidate jingles say what they play.
  desc?: string
  tier?: string
  notes?: { t: number; note: string; midi: number }[]
  notesFound?: { found: number; of: number }
}

type Measured = {
  durationMs: number
  lufs: number
  truePeakDb: number
  centroidHz: number
  attackMs: number
  flags: string[]
  source: string
  role: string
  kind?: string
  desc?: string
  tier?: string
  notes?: { t: number; note: string; midi: number }[]
  noteCheck?: { found: boolean }[]
}

const roles = plan.roles as Record<string, { lufs: number }>
const groups = plan.groups as Record<string, string>

export const groupOfClip = (name: string) =>
  name.replace(/\d+$/, '').replace(/-[a-z]$/, '')

// The order a person meets them in.
export const ROLE_ORDER = [
  'hover',
  'tap',
  'spin',
  'grab',
  'open',
  'close',
  'heart',
  'settle',
  'star',
  'confirm',
  'sparkle',
  'frost',
  'amethyst',
  'jade',
  'gold',
]

const rowOf = (name: string, m: Measured, set: ClipSet): ClipRow => {
  const group = groupOfClip(name)
  const role = m.role ?? groups[group] ?? group
  const targetLufs = roles[role]?.lufs ?? Number.NaN
  return {
    name,
    set,
    group,
    role,
    durationMs: m.durationMs,
    lufs: m.lufs,
    truePeakDb: m.truePeakDb,
    centroidHz: m.centroidHz,
    attackMs: m.attackMs,
    flags: m.flags ?? [],
    targetLufs,
    deltaLu: m.lufs - targetLufs,
    source: m.source,
    desc: m.desc,
    tier: m.tier,
    notes: m.notes,
    notesFound: m.noteCheck
      ? {
          found: m.noteCheck.filter((n) => n.found).length,
          of: m.noteCheck.length,
        }
      : undefined,
  }
}

export const clipRows = (): ClipRow[] => {
  const rows: ClipRow[] = []
  for (const [name, m] of Object.entries(analysis.clips)) {
    rows.push(rowOf(name, m as unknown as Measured, 'shipped'))
  }
  for (const [name, m] of Object.entries(candidates.clips)) {
    const measured = m as unknown as Measured
    rows.push(
      rowOf(
        name,
        measured,
        measured.kind === 'jingle' ? 'candidate' : 'held-back',
      ),
    )
  }
  const order = (row: ClipRow) => {
    const at = ROLE_ORDER.indexOf(row.role)
    return at === -1 ? ROLE_ORDER.length : at
  }
  return rows.sort(
    (a, b) =>
      order(a) - order(b) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  )
}

export const planFor = (role: string) =>
  (plan.roles as Record<string, { lufs: number; maxMs: number }>)[role]
