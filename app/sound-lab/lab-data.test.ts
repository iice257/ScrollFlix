import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clipRows } from './lab-data'
import { buildSequence, sequenceSeconds } from './lab-sequence'
import { encodeWav } from './lab-wav'

const root = process.cwd()
const readJson = (path: string) =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>

describe('lab clip list', () => {
  const rows = clipRows()
  const named = (set: string) => rows.filter((r) => r.set === set)

  it('lists every clip in the shipped sprite, once', () => {
    const shipped = named('shipped').map((r) => r.name)
    expect(shipped.sort()).toEqual(
      Object.keys(readJson('public/media/sfx/sprite.json')).sort(),
    )
  })

  it('lists every clip in the lab sprite, as held back or as a candidate', () => {
    const lab = Object.keys(readJson('app/sound-lab/assets/candidates.json'))
    const listed = [...named('held-back'), ...named('candidate')].map(
      (r) => r.name,
    )
    expect(listed.sort()).toEqual(lab.sort())
  })

  it('gives every row a loudness target from the plan and a distance from it', () => {
    for (const row of rows) {
      expect(Number.isFinite(row.targetLufs), row.name).toBe(true)
      expect(row.deltaLu).toBeCloseTo(row.lufs - row.targetLufs, 6)
    }
  })

  it('says why each held-back clip was held back', () => {
    const held = named('held-back')
    expect(held.length).toBeGreaterThan(0)
    for (const row of held)
      expect(row.flags.length, row.name).toBeGreaterThan(0)
  })

  it('has note content for every candidate jingle', () => {
    const jingles = named('candidate')
    expect(jingles.length).toBeGreaterThanOrEqual(8)
    for (const row of jingles) {
      expect(row.notes?.length, row.name).toBeGreaterThan(0)
      expect(row.notesFound?.found, row.name).toBeGreaterThan(0)
    }
  })
})

describe('lab sequence', () => {
  const steps = buildSequence('gold')

  it('goes hover, tap, open, heart, path stars, landing, reveal, in time order', () => {
    const labels = steps.map((s) => s.label.replace(/ \d+$/, ''))
    const order = ['Hover', 'Tap', 'Open', 'Heart', 'Path star', 'Landing']
    const firsts = order.map((label) => labels.indexOf(label))
    expect(firsts.every((at) => at >= 0)).toBe(true)
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b))
    const times = steps.map((s) => s.atMs)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(steps.at(-1)?.action).toEqual({ kind: 'reveal', tier: 'gold' })
    expect(labels.filter((l) => l === 'Path star')).toHaveLength(5)
  })

  it('gives each path star a larger strength than the one before', () => {
    const stars = steps.filter(
      (s) => s.action.kind === 'cue' && s.action.cue === 'trailPoint',
    )
    const strengths = stars.map((s) =>
      s.action.kind === 'cue' ? (s.action.options?.strength ?? -1) : -1,
    )
    expect(strengths).toEqual([...strengths].sort((a, b) => a - b))
    expect(new Set(strengths).size).toBe(5)
  })

  it('leaves room after the reveal for its tail', () => {
    expect(sequenceSeconds(steps)).toBeGreaterThan(
      (steps.at(-1)?.atMs ?? 0) / 1000 + 5,
    )
  })
})

describe('wav export', () => {
  it('writes a 16-bit stereo header and the right number of bytes', () => {
    const left = new Float32Array([0, 0.5, -0.5, 1])
    const wav = encodeWav([left, left], 48000)
    const view = new DataView(wav)
    const tag = (at: number) =>
      String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(at + i)))
    expect(tag(0)).toBe('RIFF')
    expect(tag(8)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(2)
    expect(view.getUint32(24, true)).toBe(48000)
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2)
    expect(wav.byteLength).toBe(44 + 16)
    expect(view.getInt16(44 + 4, true)).toBeCloseTo(0.5 * 0x7fff, -1)
  })
})
