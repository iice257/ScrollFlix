// The recorded sounds: every clip lives in one MP3 sprite (public/media/sfx),
// fetched once when audio is unlocked and decoded into a single buffer. A group
// (hover, tap, heart, ...) holds several variants (hover1, hover7, ...); each
// play takes the next one from a shuffle bag, so repeating an action cycles
// through all of them before any comes round again. Tuned groups (note,
// sparkle) also carry the pitch of each clip, so a cue can ask for a note.
// See public/media/sfx/LICENSE.txt for where the clips are from, and
// scripts/sound/ for how the sprite is built and measured.

import { type Bag, createBag } from './sound-variety'

const SPRITE_URL = '/media/sfx/sprite.mp3'
const MANIFEST_URL = '/media/sfx/sprite.json'

// [start s, length s, where it came from, pitch as a MIDI number (tuned clips)]
export type ManifestEntry = [
  start: number,
  length: number,
  source: string,
  pitch?: number,
]
export type Manifest = Record<string, ManifestEntry>

export type Bank = { buffer: AudioBuffer; manifest: Manifest }

let prefetched: Promise<{
  bytes: ArrayBuffer
  manifest: Manifest
} | null> | null = null
const banks = new WeakMap<BaseAudioContext, Promise<Bank | null>>()
const ready = new WeakMap<BaseAudioContext, Bank>()

// Starts fetching the sprite. Needs no audio context, so it can begin early.
export const prefetchBank = () => {
  prefetched ??= Promise.all([
    fetch(SPRITE_URL).then((response) =>
      response.ok ? response.arrayBuffer() : null,
    ),
    fetch(MANIFEST_URL).then((response) =>
      response.ok ? (response.json() as Promise<Manifest>) : null,
    ),
  ])
    .then(([bytes, manifest]) =>
      bytes && manifest ? { bytes, manifest } : null,
    )
    .catch(() => null)
  return prefetched
}

// Decodes the sprite for a context. Safe to call again; it resolves to null
// if the files could not be loaded.
export const loadBank = (ctx: BaseAudioContext) => {
  let bank = banks.get(ctx)
  if (!bank) {
    bank = prefetchBank().then(async (files) => {
      if (!files) return null
      try {
        const buffer = await ctx.decodeAudioData(files.bytes.slice(0))
        const loaded = { buffer, manifest: files.manifest }
        ready.set(ctx, loaded)
        return loaded
      } catch {
        return null
      }
    })
    banks.set(ctx, bank)
  }
  return bank
}

// Lets another context (an offline one rendering to a file, say) use sounds
// that are already decoded.
export const registerBank = (ctx: BaseAudioContext, bank: Bank) => {
  ready.set(ctx, bank)
  banks.set(ctx, Promise.resolve(bank))
}

export const bankReady = (ctx: BaseAudioContext) => ready.has(ctx)

export const getBank = (ctx: BaseAudioContext) => ready.get(ctx) ?? null

// ------------------------------------------------------------------ variants

// The clips of a group, in number order: hover1, hover5, hover7, ... Numbers
// need not be contiguous, so a clip can be taken out without renumbering.
export const variantsOf = (manifest: Manifest, group: string) => {
  const pattern = new RegExp(`^${group}(\\d+)$`)
  return Object.keys(manifest)
    .map((name) => ({ name, n: Number(pattern.exec(name)?.[1]) }))
    .filter((item) => Number.isFinite(item.n))
    .sort((a, b) => a.n - b.n)
    .map((item) => item.name)
}

const bags = new Map<string, Bag>()
let bagRandom: () => number = Math.random

const bagFor = (key: string) => {
  let bag = bags.get(key)
  if (!bag) {
    bag = createBag(() => bagRandom())
    bags.set(key, bag)
  }
  return bag
}

// Tests start from a clean slate and may fix the dice.
export const resetBanks = (random: () => number = Math.random) => {
  bags.clear()
  bagRandom = random
}

// The next variant of a group: all of them once, in a fresh order each round,
// never the same clip twice running.
export const pickVariant = (manifest: Manifest, group: string) => {
  const names = variantsOf(manifest, group)
  if (names.length === 0) return null
  return names[bagFor(group).next(names.length)]
}

// ------------------------------------------------------------------- playing

const rooms = new WeakMap<
  BaseAudioContext,
  { input: GainNode; wet: ConvolverNode }
>()

// One small shared room that clips can send into for a softer tail.
const roomFor = (ctx: BaseAudioContext, out: AudioNode) => {
  const existing = rooms.get(ctx)
  if (existing) return existing.input
  const length = Math.floor(ctx.sampleRate * 1.4)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3
    }
  }
  const input = ctx.createGain()
  const wet = ctx.createConvolver()
  wet.buffer = impulse
  input.connect(wet).connect(out)
  rooms.set(ctx, { input, wet })
  return input
}

export type ClipOptions = {
  gain?: number
  // Playback speed, so 1.059 is a semitone up.
  rate?: number
  // -1 left, 1 right.
  pan?: number
  // How much goes to the room, 0..1.
  reverb?: number
  // Seconds from now.
  when?: number
}

export type ClipPlay = {
  name: string
  rate: number
  gain: number
  pan: number
  when: number
}

// Plays one named clip of a given bank. The audition page uses this to play
// candidates from a bank of their own; the site goes through playClip.
export const playClipFrom = (
  ctx: BaseAudioContext,
  bank: Bank,
  out: AudioNode,
  name: string,
  options: ClipOptions = {},
): ClipPlay | null => {
  const entry = bank.manifest[name]
  if (!entry) return null
  const [start, length] = entry
  const rate = options.rate ?? 1
  const gainValue = options.gain ?? 1
  const pan = Math.max(-1, Math.min(1, options.pan ?? 0))
  const when = options.when ?? 0
  const source = ctx.createBufferSource()
  source.buffer = bank.buffer
  source.playbackRate.value = rate
  const gain = ctx.createGain()
  gain.gain.value = gainValue
  let tail: AudioNode = gain
  source.connect(gain)
  const nodes: AudioNode[] = [source, gain]
  if (pan) {
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    gain.connect(panner)
    tail = panner
    nodes.push(panner)
  }
  tail.connect(out)
  if (options.reverb) {
    const send = ctx.createGain()
    send.gain.value = options.reverb
    tail.connect(send).connect(roomFor(ctx, out))
    nodes.push(send)
  }
  source.onended = () => {
    for (const node of nodes) node.disconnect()
  }
  source.start(ctx.currentTime + when, start, length / rate + 0.01)
  return { name, rate, gain: gainValue, pan, when }
}

// Plays one named clip of the context's own bank. Returns what it played, or
// null if the bank is not loaded yet or has no such clip.
export const playClip = (
  ctx: BaseAudioContext,
  out: AudioNode,
  name: string,
  options: ClipOptions = {},
): ClipPlay | null => {
  const bank = ready.get(ctx)
  return bank ? playClipFrom(ctx, bank, out, name, options) : null
}
