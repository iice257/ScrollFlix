import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import analysis from './sound-analysis.json'
import { type Manifest, variantsOf } from './sound-bank'
import { CUES, CUE_SPECS, groupsOf } from './sound-cues'
import plan from './sound-plan.json'

const root = process.cwd()
const manifest = JSON.parse(
  readFileSync(join(root, 'public/media/sfx/sprite.json'), 'utf8'),
) as Manifest

type Clip = {
  role: string
  lufs: number
  truePeakDb: number
  durationMs: number
  centroidHz: number
  attackMs: number
  limited: boolean
  lowShare: number
}
const clips = analysis.clips as unknown as Record<string, Clip>

const roles = plan.roles as Record<
  string,
  {
    lufs: number
    maxMs: number
    minCentroidHz?: number
    maxAttackMs?: number
    gate?: boolean
  }
>
const groups = plan.groups as Record<string, string>
const groupOf = (name: string) => name.replace(/\d+$/, '')
const roleOf = (name: string) => roles[groups[groupOf(name)]]

describe('manifest completeness', () => {
  it('belongs to the sprite that was measured', () => {
    const bytes = readFileSync(join(root, 'public/media/sfx/sprite.mp3'))
    expect(createHash('sha1').update(bytes).digest('hex')).toBe(
      analysis.spriteSha1,
    )
  })

  it('has a measurement for every clip and a clip for every measurement', () => {
    expect(Object.keys(clips).sort()).toEqual(Object.keys(manifest).sort())
  })

  it('puts every clip in a group the plan knows', () => {
    for (const name of Object.keys(manifest)) {
      expect(groups[groupOf(name)], name).toBeDefined()
      expect(roleOf(name), name).toBeDefined()
    }
  })

  it('keeps every clip inside the sprite, in order, without overlaps', () => {
    const entries = Object.values(manifest).sort((a, b) => a[0] - b[0])
    for (const [i, [start, length]] of entries.entries()) {
      expect(start).toBeGreaterThan(0)
      expect(length).toBeGreaterThan(0.02)
      if (i > 0) {
        expect(start).toBeGreaterThan(entries[i - 1][0] + entries[i - 1][1])
      }
    }
  })

  it('gives every cue layer a group with clips in it', () => {
    for (const cue of CUES) {
      for (const group of groupsOf(cue)) {
        expect(
          variantsOf(manifest, group).length,
          `${cue} -> ${group}`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it.each([
    ['hover', 5],
    ['tap', 5],
    ['spin', 3],
  ])(
    'has enough variants of %s to feel varied (%i or more)',
    (group, count) => {
      expect(variantsOf(manifest, group).length).toBeGreaterThanOrEqual(count)
    },
  )

  it('speaks with clicks only: hover, tap and spin', () => {
    const used = new Set(CUES.flatMap((cue) => groupsOf(cue)))
    expect([...used].sort()).toEqual(['hover', 'spin', 'tap'])
  })

  it('ships one jingle for each path and nothing else', () => {
    const names = Object.keys(manifest)
    for (const tier of ['frost', 'amethyst', 'jade', 'gold']) {
      expect(variantsOf(manifest, tier), tier).toHaveLength(1)
    }
    expect(names).toHaveLength(
      variantsOf(manifest, 'hover').length +
        variantsOf(manifest, 'tap').length +
        variantsOf(manifest, 'spin').length +
        4,
    )
  })

  it('gives every body layer at least two clips to rotate through', () => {
    for (const cue of CUES) {
      for (const layer of CUE_SPECS[cue].layers) {
        if (layer.role !== 'body') continue
        expect(
          variantsOf(manifest, layer.group).length,
          `${cue} -> ${layer.group}`,
        ).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('loudness plan', () => {
  it('has the click ladder: hover softest, then tap', () => {
    expect(roles.hover.lufs).toBe(-34)
    expect(roles.tap.lufs).toBe(-28)
    expect(roles.hover.lufs).toBeLessThan(roles.tap.lufs)
  })

  it('steps up from frost to gold so gold is plainly the bigger reveal', () => {
    const [frost, amethyst, jade, gold] = [
      'frost',
      'amethyst',
      'jade',
      'gold',
    ].map((t) => roles[t].lufs)
    expect(frost).toBeLessThan(amethyst)
    expect(amethyst).toBeLessThan(jade)
    expect(jade).toBeLessThan(gold)
    expect(gold - frost).toBeGreaterThanOrEqual(4)
    expect(roles.gold.maxMs).toBeGreaterThanOrEqual(2 * roles.frost.maxMs)
  })

  it('has every shipped clip on its role target', () => {
    for (const [name, m] of Object.entries(clips)) {
      const target = roleOf(name).lufs
      // A peaky click that needed the limiter may land a little under.
      const under = m.limited ? 2 : plan.toleranceLu
      expect(m.lufs, name).toBeGreaterThanOrEqual(target - under)
      expect(m.lufs, name).toBeLessThanOrEqual(target + plan.toleranceLu)
    }
  })

  it('keeps every clip under the true-peak ceiling', () => {
    for (const [name, m] of Object.entries(clips)) {
      expect(m.truePeakDb, name).toBeLessThanOrEqual(plan.truePeakCeilingDb)
    }
  })

  it('keeps every clip no longer than its role allows', () => {
    for (const [name, m] of Object.entries(clips)) {
      expect(m.durationMs, name).toBeLessThanOrEqual(roleOf(name).maxMs)
    }
  })

  it('keeps hover, tap and spin bright and quick, the precision cues', () => {
    for (const [name, m] of Object.entries(clips)) {
      const role = roleOf(name)
      if (!role.gate) continue
      expect(m.centroidHz, name).toBeGreaterThanOrEqual(role.minCentroidHz ?? 0)
      expect(m.attackMs, name).toBeLessThanOrEqual(role.maxAttackMs ?? 1e9)
    }
  })

  it('is level within a group: variants sit within a few LU of each other', () => {
    const byGroup = new Map<string, number[]>()
    for (const [name, m] of Object.entries(clips)) {
      const key = groupOf(name)
      byGroup.set(key, [...(byGroup.get(key) ?? []), m.lufs])
    }
    for (const [group, levels] of byGroup) {
      expect(
        Math.max(...levels) - Math.min(...levels),
        group,
      ).toBeLessThanOrEqual(3.2)
    }
  })

  it('shows gold bigger than frost in the shipped jingles too', () => {
    const level = (tier: string) => {
      const names = variantsOf(manifest, tier)
      return names.reduce((sum, n) => sum + clips[n].lufs, 0) / names.length
    }
    expect(level('gold') - level('frost')).toBeGreaterThanOrEqual(4)
    expect(level('frost')).toBeLessThan(level('amethyst'))
    expect(level('amethyst')).toBeLessThan(level('jade'))
    expect(level('jade')).toBeLessThan(level('gold'))
  })
})

describe('lab candidates', () => {
  type Candidate = {
    kind: string
    tier?: string
    durationMs: number
    lufs: number
    lowShare: number
    notes?: unknown[]
    noteCheck?: { found: boolean; cents: number | null }[]
  }
  const lab = JSON.parse(
    readFileSync(join(root, 'app/sound-lab/candidates-analysis.json'), 'utf8'),
  ) as { spriteSha1: string; clips: Record<string, Candidate> }
  const jingles = Object.entries(lab.clips).filter(
    ([, c]) => c.kind === 'jingle',
  )
  const ofTier = (tier: string) =>
    jingles.filter(([, c]) => c.tier === tier).map(([, c]) => c)

  it('belong to the sprite that was measured', () => {
    const bytes = readFileSync(
      join(root, 'app/sound-lab/assets/candidates.mp3'),
    )
    expect(createHash('sha1').update(bytes).digest('hex')).toBe(lab.spriteSha1)
  })

  it('reports note content for each, and the notes are really in the audio', () => {
    for (const [name, c] of jingles) {
      expect(c.notes?.length, name).toBeGreaterThan(0)
      const checks = c.noteCheck ?? []
      const found = checks.filter((n) => n.found).length
      expect(found / Math.max(1, checks.length), name).toBeGreaterThanOrEqual(
        0.75,
      )
      for (const n of checks) {
        if (n.found && n.cents !== null) {
          expect(Math.abs(n.cents), name).toBeLessThan(40)
        }
      }
    }
  })

  it('makes every gold candidate bigger than every frost one', () => {
    for (const gold of ofTier('gold')) {
      for (const frost of ofTier('frost')) {
        expect(gold.durationMs).toBeGreaterThanOrEqual(2 * frost.durationMs)
        expect(gold.lufs - frost.lufs).toBeGreaterThanOrEqual(4)
      }
    }
  })
})
