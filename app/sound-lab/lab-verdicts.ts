// The owner's verdicts from the audition page: one decision (keep or replace)
// and one level note (too quiet or too loud) per cue or clip, kept in
// localStorage and exported as JSON for the build (scripts/sound).

export type Decision = 'keep' | 'replace'
export type LevelNote = 'quiet' | 'loud'

export type Verdict = { decision?: Decision; level?: LevelNote }
export type Verdicts = Record<string, Verdict>

export const VERDICT_KEY = 'scrollflix.sound-lab.verdicts.v1'

const tidy = (verdicts: Verdicts) =>
  Object.fromEntries(
    Object.entries(verdicts).filter(([, v]) => v.decision || v.level),
  )

// Pressing the button that is already on takes it off again; pressing the other
// decision (or level note) swaps. A decision and a level note go together.
export const setDecision = (
  verdicts: Verdicts,
  id: string,
  decision: Decision,
): Verdicts =>
  tidy({
    ...verdicts,
    [id]: {
      ...verdicts[id],
      decision: verdicts[id]?.decision === decision ? undefined : decision,
    },
  })

export const setLevel = (
  verdicts: Verdicts,
  id: string,
  level: LevelNote,
): Verdicts =>
  tidy({
    ...verdicts,
    [id]: {
      ...verdicts[id],
      level: verdicts[id]?.level === level ? undefined : level,
    },
  })

export const loadVerdicts = (): Verdicts => {
  try {
    const raw = localStorage.getItem(VERDICT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const clean: Verdicts = {}
    for (const [id, value] of Object.entries(parsed)) {
      const v = value as Verdict
      const decision =
        v?.decision === 'keep' || v?.decision === 'replace'
          ? v.decision
          : undefined
      const level =
        v?.level === 'quiet' || v?.level === 'loud' ? v.level : undefined
      if (decision || level) clean[id] = { decision, level }
    }
    return clean
  } catch {
    return {}
  }
}

export const saveVerdicts = (verdicts: Verdicts) => {
  try {
    localStorage.setItem(VERDICT_KEY, JSON.stringify(verdicts))
  } catch {
    // Storage can be blocked; the verdicts then live for this visit only.
  }
}

export type VerdictExport = {
  exportedAt: string
  keep: string[]
  replace: string[]
  tooQuiet: string[]
  tooLoud: string[]
  verdicts: Verdicts
}

// What the owner sends back: grouped lists, easy to read, plus the raw map.
export const exportVerdicts = (
  verdicts: Verdicts,
  now = new Date(),
): VerdictExport => {
  const ids = Object.keys(verdicts).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const where = (test: (v: Verdict) => boolean) =>
    ids.filter((id) => test(verdicts[id]))
  return {
    exportedAt: now.toISOString(),
    keep: where((v) => v.decision === 'keep'),
    replace: where((v) => v.decision === 'replace'),
    tooQuiet: where((v) => v.level === 'quiet'),
    tooLoud: where((v) => v.level === 'loud'),
    verdicts: Object.fromEntries(ids.map((id) => [id, verdicts[id]])),
  }
}
