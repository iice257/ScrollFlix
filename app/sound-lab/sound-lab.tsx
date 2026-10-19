// The sound audition page, at /sound-lab in development only. Everything the
// site can say is here to play, measure and judge; verdicts are kept in the
// browser and exported as JSON. See main.tsx for how it is kept out of builds.

import { useCallback, useEffect, useState } from 'react'
import { soundStore } from '../audio/sound-settings'
import { type Lab, setLabVolume, startLab } from './lab-engine'
import {
  ClipsPanel,
  CuesPanel,
  RevealsPanel,
  SequencePanel,
  VerdictsPanel,
} from './lab-panels'
import type { Vote } from './lab-ui'
import {
  type Verdicts,
  loadVerdicts,
  saveVerdicts,
  setDecision,
  setLevel,
} from './lab-verdicts'
import './sound-lab.css'

const TABS = [
  ['sequence', 'Sequence'],
  ['cues', 'Cues'],
  ['clips', 'Clips'],
  ['reveals', 'Reveals'],
  ['verdicts', 'Verdicts'],
] as const
type Tab = (typeof TABS)[number][0]

const TAB_KEY = 'scrollflix.sound-lab.tab'

const initialTab = (): Tab => {
  try {
    const saved = localStorage.getItem(TAB_KEY)
    if (TABS.some(([key]) => key === saved)) return saved as Tab
  } catch {
    // Storage can be blocked.
  }
  return 'sequence'
}

export function SoundLab() {
  const [lab, setLab] = useState<Lab | null>(null)
  const [error, setError] = useState('')
  const [volume, setVolume] = useState(() => soundStore.get().volume)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [verdicts, setVerdicts] = useState<Verdicts>(loadVerdicts)

  useEffect(() => saveVerdicts(verdicts), [verdicts])
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      // Storage can be blocked.
    }
  }, [tab])

  const ensure = useCallback(async () => {
    try {
      const started = await startLab(volume)
      if (started.ctx.state !== 'running') await started.ctx.resume()
      setLab(started)
      setError('')
      return started
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Audio failed')
      throw failure
    }
  }, [volume])

  const changeVolume = (next: number) => {
    setVolume(next)
    if (lab) setLabVolume(lab, next)
  }

  const vote = useCallback((id: string, kind: Vote) => {
    setVerdicts((current) =>
      kind === 'keep' || kind === 'replace'
        ? setDecision(current, id, kind)
        : setLevel(current, id, kind),
    )
  }, [])

  const panel = { ensure, lab, verdicts, vote }
  const counted = Object.keys(verdicts).length

  return (
    <div className='lab'>
      <header className='lab-top'>
        <div className='lab-brand'>
          <h1>Sound lab</h1>
          <p>Development only. Nothing on this page ships.</p>
        </div>
        <div className='lab-master'>
          <button
            type='button'
            className='lab-power'
            data-on={lab?.ctx.state === 'running'}
            onClick={() => void ensure().catch(() => {})}
          >
            <span aria-hidden='true' />
            {lab?.ctx.state === 'running' ? 'Audio on' : 'Start audio'}
          </button>
          <label className='lab-volume'>
            <span>Master</span>
            <input
              type='range'
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
            <output>{Math.round(volume * 100)}%</output>
          </label>
        </div>
      </header>

      <nav className='lab-tabs' role='tablist' aria-label='Sections'>
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type='button'
            role='tab'
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
            {key === 'verdicts' && counted > 0 && <small>{counted}</small>}
          </button>
        ))}
      </nav>

      {error && (
        <p className='lab-error' role='alert'>
          {error}
        </p>
      )}

      <main className='lab-main'>
        {tab === 'sequence' && <SequencePanel {...panel} />}
        {tab === 'cues' && <CuesPanel {...panel} />}
        {tab === 'clips' && <ClipsPanel {...panel} />}
        {tab === 'reveals' && <RevealsPanel {...panel} />}
        {tab === 'verdicts' && (
          <VerdictsPanel verdicts={verdicts} clear={() => setVerdicts({})} />
        )}
      </main>
    </div>
  )
}
