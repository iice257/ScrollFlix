// The audition page's audio. It plays through the same pieces as the site: the
// same cue renderer, the same reveal chain, the same limiter and master gain.
// Only the sources differ: it can also play the held-back clips and candidate
// jingles from the lab sprite, and it can render any of it offline to measure
// what comes out of the master.

import {
  type Bank,
  type Manifest,
  loadBank,
  playClip,
  playClipFrom,
  registerBank,
} from '../audio/sound-bank'
import {
  type AudioOut,
  type Cue,
  type CueOptions,
  type CuePlayback,
  createMasterChain,
  renderCue,
  resetCueState,
  volumeToGain,
} from '../audio/sound-engine'
import { setPointerX } from '../audio/sound-pointer'
import type { Tier } from '../cmps/views/test-gallery/shuffle-pro/shuffle-pro-logic'
import {
  type JingleClip,
  scheduleReveal,
} from '../cmps/views/test-gallery/shuffle-pro/shuffle-pro-music'
import candidateManifest from './assets/candidates.json'
import candidatesUrl from './assets/candidates.mp3?url'
import {
  LAB_SAMPLE_RATE,
  integratedLufs,
  lastSoundSeconds,
  samplePeakDb,
} from './lab-loudness'
import {
  type SequenceStep,
  buildSequence,
  sequenceSeconds,
} from './lab-sequence'

export type Lab = {
  ctx: AudioContext
  audio: AudioOut
  master: GainNode
  volume: number
  // The shipped sprite, and the lab sprite of held-back clips and candidates.
  prod: Bank
  cand: Bank
}

let starting: Promise<Lab> | null = null
let current: Lab | null = null

const loadCandidates = async (ctx: BaseAudioContext): Promise<Bank> => {
  const bytes = await fetch(candidatesUrl).then((r) => r.arrayBuffer())
  return {
    buffer: await ctx.decodeAudioData(bytes),
    manifest: candidateManifest as unknown as Manifest,
  }
}

// Starts the audio. Call from a click.
export const startLab = (volume: number): Promise<Lab> => {
  starting ??= (async () => {
    const ctx = new AudioContext()
    const chain = createMasterChain(ctx, volume)
    const [prod, cand] = await Promise.all([
      loadBank(ctx),
      loadCandidates(ctx),
      ctx.state === 'suspended' ? ctx.resume() : Promise.resolve(),
    ]).then(([p, c]) => [p, c] as const)
    if (!prod) throw new Error('The shipped sprite did not load')
    registerBank(ctx, prod)
    resetCueState()
    const lab: Lab = {
      ctx,
      audio: { ctx, out: chain.input },
      master: chain.master,
      volume,
      prod,
      cand,
    }
    current = lab
    if (import.meta.env.DEV) {
      ;(window as unknown as { __soundLab?: Lab }).__soundLab = lab
    }
    return lab
  })().catch((error) => {
    starting = null
    throw error
  })
  return starting
}

export const labIfStarted = () => current

export const setLabVolume = (lab: Lab, volume: number) => {
  lab.volume = volume
  lab.master.gain.setTargetAtTime(
    volumeToGain(volume),
    lab.ctx.currentTime,
    0.03,
  )
}

// ----------------------------------------------------------------- playing

// A clip as it is stored, with no variation: for judging the recording itself.
export const playClipRaw = (
  lab: Lab,
  set: 'shipped' | 'candidate',
  name: string,
) =>
  set === 'candidate'
    ? playClipFrom(lab.ctx, lab.cand, lab.audio.out, name)
    : playClip(lab.ctx, lab.audio.out, name)

export const playCueOnce = (
  lab: Lab,
  cue: Cue,
  options: CueOptions = {},
): CuePlayback => renderCue(lab.audio, cue, options, performance.now())

const GAP_MS: Partial<Record<Cue, number>> = {
  hover: 210,
  tap: 380,
  spinTick: 90,
  trailPoint: 420,
}

// A cue played n times in a row, spaced like a person would, so the variety
// (different clips, pitches, levels, sides) can be heard and read at once. The
// pointer sweeps left to right across the run.
export const playCueRun = (lab: Lab, cue: Cue, times = 8): CuePlayback[] => {
  const gap = GAP_MS[cue] ?? 650
  const base = performance.now()
  return Array.from({ length: times }, (_, i) => {
    setPointerX(times > 1 ? 0.12 + (0.76 * i) / (times - 1) : 0.5)
    return renderCue(
      lab.audio,
      cue,
      { strength: i / (times - 1), atSec: (i * gap) / 1000 },
      base + i * gap,
    )
  })
}

export const jingleClip = (bank: Bank, name: string): JingleClip | null => {
  const entry = bank.manifest[name]
  return entry
    ? { name, buffer: bank.buffer, start: entry[0], length: entry[1] }
    : null
}

// The reveal exactly as the site plays it: the jingle through its reverb and
// echo with the sparkle cascade over it. `choice` names a shipped jingle, a
// candidate, or nothing for the site's own rotation.
export const playReveal = (
  lab: Lab,
  tier: Tier,
  choice?: { set: 'shipped' | 'candidate'; name: string },
  at = 0,
) => {
  const clip = choice
    ? jingleClip(choice.set === 'candidate' ? lab.cand : lab.prod, choice.name)
    : null
  return scheduleReveal(lab.audio, tier, lab.prod, {
    at,
    clip: clip ?? undefined,
  })
}

export type RevealChoice = { set: 'shipped' | 'candidate'; name: string } | null

const scheduleSequence = (
  audio: AudioOut,
  prod: Bank,
  cand: Bank,
  steps: SequenceStep[],
  choice: RevealChoice,
  baseMs: number,
) => {
  for (const step of steps) {
    const { action } = step
    if (action.kind === 'cue') {
      if (action.pointerX !== undefined) setPointerX(action.pointerX)
      renderCue(
        audio,
        action.cue,
        { ...action.options, atSec: step.atMs / 1000 },
        baseMs + step.atMs,
      )
    } else {
      const picked = choice
        ? jingleClip(choice.set === 'candidate' ? cand : prod, choice.name)
        : null
      scheduleReveal(audio, action.tier, prod, {
        at: step.atMs / 1000,
        clip: picked ?? undefined,
      })
    }
  }
}

export const playSequence = (
  lab: Lab,
  tier: Tier,
  choice: RevealChoice = null,
) => {
  const steps = buildSequence(tier)
  resetCueState()
  scheduleSequence(
    lab.audio,
    lab.prod,
    lab.cand,
    steps,
    choice,
    performance.now(),
  )
  return steps
}

// ---------------------------------------------------------------- measuring

export type Rendered = {
  channels: Float32Array[]
  lufs: number
  peakDb: number
  endSeconds: number
}

// Renders whatever `schedule` plays into an offline copy of the same chain,
// at the lab's current master volume, and measures the result.
export const renderOffline = async (
  lab: Lab,
  seconds: number,
  schedule: (audio: AudioOut, prod: Bank, cand: Bank) => void,
): Promise<Rendered> => {
  const off = new OfflineAudioContext(
    2,
    Math.ceil(seconds * LAB_SAMPLE_RATE),
    LAB_SAMPLE_RATE,
  )
  registerBank(off, lab.prod)
  const chain = createMasterChain(off, lab.volume)
  schedule({ ctx: off, out: chain.input }, lab.prod, lab.cand)
  const buffer = await off.startRendering()
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)]
  return {
    channels,
    lufs: integratedLufs(channels),
    peakDb: samplePeakDb(channels),
    endSeconds: lastSoundSeconds(channels),
  }
}

export type CueMeasure = {
  cue: Cue
  runs: number
  lufs: number | null
  lufsSpread: number
  peakDb: number | null
  seconds: number
}

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// What a cue comes out at: several plays, each rendered alone through the
// master chain, then the median level (the plays differ a little by design).
export const measureCue = async (
  lab: Lab,
  cue: Cue,
  runs = 5,
): Promise<CueMeasure> => {
  const levels: number[] = []
  const peaks: number[] = []
  let seconds = 0
  let silent = false
  for (let run = 0; run < runs; run += 1) {
    setPointerX(0.5)
    resetCueState()
    let synth = false
    const out = await renderOffline(lab, 4, (audio) => {
      synth = renderCue(audio, cue, { strength: 1 }, 100_000 * (run + 1)).synth
    })
    if (synth || !Number.isFinite(out.lufs)) {
      silent = true
      break
    }
    levels.push(out.lufs)
    peaks.push(out.peakDb)
    seconds = Math.max(seconds, out.endSeconds)
  }
  return {
    cue,
    runs,
    lufs: silent ? null : median(levels),
    lufsSpread: silent ? 0 : Math.max(...levels) - Math.min(...levels),
    peakDb: silent ? null : Math.max(...peaks),
    seconds,
  }
}

export const renderSequence = async (
  lab: Lab,
  tier: Tier,
  choice: RevealChoice,
) => {
  const steps = buildSequence(tier)
  resetCueState()
  return renderOffline(lab, sequenceSeconds(steps), (audio, prod, cand) =>
    scheduleSequence(audio, prod, cand, steps, choice, 100_000),
  )
}
