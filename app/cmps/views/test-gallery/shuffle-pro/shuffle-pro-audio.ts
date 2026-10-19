// The Shuffle Pro Easter egg sounds: a wheel of clicks, like a roulette wheel.
//
//   wheel    one click per slice of rotation as the globe spins up, thinning
//            out and fading as it slows to rest, so the landing is a wheel
//            running down
//   click    the last tick of the wheel as the card opens: lower and firmer
//            than the rest (gold a little lower still)
//
// The clicks are the same spin and tap clips the interface uses, from the
// sprite. The reveal jingle (shuffle-pro-music.ts) is the only music.
//
// They follow the "Easter egg sounds" switch, not the master sound switch, so
// they stay audible by default. The AudioContext itself lives in the shared
// engine and is only created inside a real user gesture.

import {
  type Bank,
  getBank,
  loadBank,
  pickVariant,
  playClip,
} from '../../../../audio/sound-bank'
import { getAudio } from '../../../../audio/sound-engine'
import { soundStore } from '../../../../audio/sound-settings'
import {
  SPIN_MIN_SPEED,
  createSpinTicker,
  dbToGain,
  semisToRate,
} from '../../../../audio/sound-variety'
import { type Tier, landingOmega } from './shuffle-pro-logic'

export { unlockAudio } from '../../../../audio/sound-engine'

// The spin clips are levelled for a pointer's detent. A wheel is the sound of
// the moment, so its clicks sit this much higher.
export const WHEEL_BOOST_DB = 8
const COAST_FRAME_MS = 16

export type Wheel = {
  update: (omega: number, omegaMax: number, sky?: number) => void
  // Lets go of the spin: the clicks carry on, slowing the way the globe does,
  // for at most `ms`.
  fadeOut: (ms: number) => void
  stop: () => void
}

const eggsOn = () => soundStore.get().eggs

// Returns null when the Easter egg sounds are off or audio was never unlocked.
export const createWheel = (_tier: Tier = 'frost'): Wheel | null => {
  if (!eggsOn()) return null
  const audio = getAudio()
  if (!audio) return null
  const { ctx, out } = audio
  void loadBank(ctx)

  const ticker = createSpinTicker()
  let lastAt = performance.now()
  let lastOmega = 0
  let coastTimer = 0
  let stopped = false

  const click = (omega: number, dtMs: number) => {
    const bank: Bank | null = getBank(ctx)
    if (!bank) return
    for (const tick of ticker.update(omega, dtMs)) {
      const clip = pickVariant(bank.manifest, 'spin')
      if (!clip) return
      playClip(ctx, out, clip, {
        gain: dbToGain(tick.gainDb + WHEEL_BOOST_DB),
        rate: tick.rate,
        pan: 0,
      })
    }
  }

  const stop = () => {
    stopped = true
    window.clearInterval(coastTimer)
  }

  return {
    update: (omega) => {
      if (stopped) return
      const now = performance.now()
      click(omega, now - lastAt)
      lastAt = now
      lastOmega = omega
    },
    fadeOut: (ms) => {
      if (stopped) return
      const releasedAt = performance.now()
      lastAt = releasedAt
      window.clearInterval(coastTimer)
      coastTimer = window.setInterval(() => {
        const now = performance.now()
        const omega = landingOmega(lastOmega, now - releasedAt)
        if (now - releasedAt > ms || omega < SPIN_MIN_SPEED) {
          stop()
          return
        }
        click(omega, now - lastAt)
        lastAt = now
      }, COAST_FRAME_MS)
    },
    stop,
  }
}

// The landing, as the card opens: the last click of the wheel.
export const playLandingClick = (tier: Tier) => {
  if (!eggsOn()) return
  const audio = getAudio()
  if (!audio) return
  try {
    const bank = getBank(audio.ctx)
    const clip = bank ? pickVariant(bank.manifest, 'tap') : null
    if (!clip) return
    const gold = tier === 'gold'
    playClip(audio.ctx, audio.out, clip, {
      gain: dbToGain(gold ? 5 : 3),
      rate: semisToRate(gold ? -8 : -6),
      pan: 0,
    })
  } catch {
    // Sound must never break the run.
  }
}
