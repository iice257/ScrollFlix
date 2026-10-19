// Small pieces shared by the audition panels.

import type { CuePlayback } from '../audio/sound-engine'
import type { Lab } from './lab-engine'
import type { Verdicts } from './lab-verdicts'

export type Vote = 'keep' | 'replace' | 'quiet' | 'loud'

export type PanelProps = {
  // Starts the audio on first use (it must happen inside a click) and returns it.
  ensure: () => Promise<Lab>
  lab: Lab | null
  verdicts: Verdicts
  vote: (id: string, vote: Vote) => void
}

export const num = (value: number | null | undefined, digits = 1) => {
  if (value === null || value === undefined) return '–'
  if (!Number.isFinite(value)) return value < 0 ? '-∞' : '∞'
  return value.toFixed(digits)
}

export const signed = (value: number, digits = 1) => {
  const text = value.toFixed(digits)
  // No "-0.0": a value that rounds to nothing is shown as nothing.
  if (Number(text) === 0) return (0).toFixed(digits)
  return value > 0 ? `+${text}` : text
}

const VOTES: { vote: Vote; label: string; title: string }[] = [
  { vote: 'keep', label: 'Keep', title: 'Keep this one' },
  { vote: 'replace', label: 'Replace', title: 'Find something else for this' },
  { vote: 'quiet', label: 'Too quiet', title: 'Needs to be louder' },
  { vote: 'loud', label: 'Too loud', title: 'Needs to be quieter' },
]

export function Votes({
  id,
  verdicts,
  vote,
}: {
  id: string
  verdicts: Verdicts
  vote: (id: string, vote: Vote) => void
}) {
  const current = verdicts[id]
  const pressed = (v: Vote) =>
    v === 'keep' || v === 'replace'
      ? current?.decision === v
      : current?.level === v
  return (
    <fieldset className='lab-votes' aria-label={`Verdict for ${id}`}>
      {VOTES.map(({ vote: v, label, title }) => (
        <button
          key={v}
          type='button'
          className='lab-vote'
          data-vote={v}
          aria-pressed={pressed(v)}
          title={title}
          onClick={() => vote(id, v)}
        >
          {label}
        </button>
      ))}
    </fieldset>
  )
}

export function PlayIcon() {
  return (
    <svg viewBox='0 0 16 16' width='14' height='14' aria-hidden='true'>
      <path
        d='M5 3.2v9.6a.6.6 0 0 0 .92.5l7.4-4.8a.6.6 0 0 0 0-1L5.92 2.7A.6.6 0 0 0 5 3.2Z'
        fill='currentColor'
      />
    </svg>
  )
}

const semis = (rate: number) => 12 * Math.log2(rate)

// One line per click: what was picked, leaned by how much, how loud, which side.
export function PlaybackLines({ plays }: { plays: CuePlayback[] }) {
  if (plays.length === 0) return null
  return (
    <ol className='lab-readout'>
      {plays.map((play, i) => (
        <li key={`${play.cue}-${i}-${play.layers.map((l) => l.clip).join()}`}>
          <span className='lab-readout-n'>{plays.length > 1 ? i + 1 : ''}</span>
          <span className='lab-readout-layers'>
            {play.layers.length === 0 ? (
              <span className='lab-readout-layer'>synth voice only</span>
            ) : (
              play.layers.map((layer) => (
                <span
                  key={`${layer.group}-${layer.clip}`}
                  className='lab-readout-layer'
                >
                  <b>{layer.clip}</b>
                  <span>{signed(semis(layer.rate), 2)} st</span>
                  <span>{signed(layer.gainDb)} dB</span>
                  <span>
                    {layer.pan === 0
                      ? 'C'
                      : `${layer.pan < 0 ? 'L' : 'R'}${Math.abs(layer.pan).toFixed(2)}`}
                  </span>
                </span>
              ))
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
