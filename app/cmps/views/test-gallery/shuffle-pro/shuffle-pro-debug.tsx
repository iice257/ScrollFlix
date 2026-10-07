import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ShuffleProController } from './shuffle-pro-controller'
import { TIER_LABELS, type Tier } from './shuffle-pro-logic'
import { shuffleProStore } from './shuffle-pro-store'

export const SHUFFLE_PRO_DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('shuffle-pro-debug')

const TIERS: Tier[] = ['frost', 'amethyst', 'jade', 'gold']

type Props = {
  controller: ShuffleProController
  reducedMotionOverride: { current: boolean | null }
}

// Dev-only (?shuffle-pro-debug): starts any path on demand and shows live
// numbers, since a 5-second hold is awkward to perform under automation.
export const ShuffleProDebugPanel = ({
  controller,
  reducedMotionOverride,
}: Props) => {
  const [state, setState] = useState(() => controller.debugState())
  const [reduced, setReduced] = useState(false)
  const found = useSyncExternalStore(
    shuffleProStore.subscribe,
    shuffleProStore.get,
    shuffleProStore.get,
  )

  useEffect(() => {
    controller.setStatsEnabled(true)
    const timer = window.setInterval(
      () => setState(controller.debugState()),
      150,
    )
    return () => {
      window.clearInterval(timer)
      controller.setStatsEnabled(false)
    }
  }, [controller])

  const toggleReduced = () => {
    const next = !reduced
    reducedMotionOverride.current = next
    setReduced(next)
  }

  return (
    <aside className='warp-sp-debug' aria-label='Shuffle Pro debug'>
      <strong>Shuffle Pro debug</strong>
      <div className='warp-sp-debug-row'>
        {TIERS.map((tier) => (
          <button
            type='button'
            key={tier}
            onClick={() => controller.startExact(tier)}
          >
            {TIER_LABELS[tier]}
            {found.found[tier] ? ` ×${found.found[tier]?.count}` : ''}
          </button>
        ))}
      </div>
      <div className='warp-sp-debug-row'>
        <button type='button' onClick={() => controller.debugForcePeak()}>
          Force peak
        </button>
        <button type='button' onClick={() => controller.debugForceRelease()}>
          Release
        </button>
        <button type='button' onClick={() => controller.skip()}>
          Skip
        </button>
        <button type='button' onClick={() => controller.abort()}>
          Abort
        </button>
      </div>
      <div className='warp-sp-debug-row'>
        <button type='button' onClick={toggleReduced}>
          Reduced motion: {reduced ? 'on' : 'off'}
        </button>
        <button type='button' onClick={() => shuffleProStore.reset()}>
          Reset found paths
        </button>
      </div>
      <dl>
        <dt>phase</dt>
        <dd data-testid='sp-phase'>{state.phase}</dd>
        <dt>tier</dt>
        <dd>{state.tier ?? '-'}</dd>
        <dt>ω (rad/s)</dt>
        <dd data-testid='sp-omega'>{state.omega.toFixed(2)}</dd>
        <dt>frame avg / p95</dt>
        <dd data-testid='sp-frame'>
          {state.frame.average.toFixed(1)} / {state.frame.p95.toFixed(1)} ms
        </dd>
        <dt>sky quality</dt>
        <dd data-testid='sp-quality'>{state.sky.qualityLevel}</dd>
        <dt>camera z / pull / kick</dt>
        <dd data-testid='sp-camera'>
          {state.sky.cameraZ.toFixed(2)} / {state.sky.pull.toFixed(2)} /{' '}
          {state.sky.kick.toFixed(2)}
        </dd>
        <dt>sky draws</dt>
        <dd data-testid='sp-draws'>{state.sky.drawCount}</dd>
        <dt>streak / big spins</dt>
        <dd>
          {state.streak.streak} / {state.streak.bigSpinRun}
        </dd>
      </dl>
    </aside>
  )
}
