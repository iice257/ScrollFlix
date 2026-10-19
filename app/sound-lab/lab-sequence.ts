// The "what a visit sounds like" sequence the audition page plays: a few
// hovers, a press, a card opening, a heart, a path of stars, the globe landing
// and the reveal. Pure data so the live preview, the offline render and the
// tests all use the same timeline.

import type { Cue, CueOptions } from '../audio/sound-engine'
import type { Tier } from '../cmps/views/test-gallery/shuffle-pro/shuffle-pro-logic'

export type SequenceAction =
  | { kind: 'cue'; cue: Cue; options?: CueOptions; pointerX?: number }
  | { kind: 'reveal'; tier: Tier }

export type SequenceStep = {
  // Milliseconds from the start.
  atMs: number
  label: string
  action: SequenceAction
}

export const TIERS: Tier[] = ['frost', 'amethyst', 'jade', 'gold']

const STARS = 5

export const buildSequence = (tier: Tier): SequenceStep[] => {
  const steps: SequenceStep[] = []
  const cue = (
    atMs: number,
    label: string,
    name: Cue,
    options?: CueOptions,
    pointerX?: number,
  ) =>
    steps.push({
      atMs,
      label,
      action: { kind: 'cue', cue: name, options, pointerX },
    })

  cue(0, 'Hover', 'hover', undefined, 0.3)
  cue(190, 'Hover', 'hover', undefined, 0.42)
  cue(380, 'Hover', 'hover', undefined, 0.55)
  cue(1000, 'Tap', 'tap', undefined, 0.55)
  cue(1350, 'Open', 'open', undefined, 0.5)
  cue(2500, 'Heart', 'heart', undefined, 0.62)
  for (let index = 0; index < STARS; index += 1) {
    cue(
      3500 + index * 420,
      `Path star ${index + 1}`,
      'trailPoint',
      { strength: index / 7 },
      0.5,
    )
  }
  const landing = 3500 + STARS * 420 + 500
  cue(landing, 'Landing', 'landing', { strength: 1 })
  steps.push({
    atMs: landing + 350,
    label: `Reveal, ${tier}`,
    action: { kind: 'reveal', tier },
  })
  return steps
}

// Seconds of room after the last step for a reveal's tail to ring out.
export const SEQUENCE_TAIL_SECONDS = 6.5

export const sequenceSeconds = (steps: SequenceStep[]) =>
  Math.max(...steps.map((s) => s.atMs)) / 1000 + SEQUENCE_TAIL_SECONDS
