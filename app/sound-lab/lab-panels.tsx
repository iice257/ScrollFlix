// The audition page's panels: the sequence, the cues, every clip, the reveals
// and the verdicts so far.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CUES, CUE_SPECS } from '../audio/sound-cues'
import type { Cue, CuePlayback } from '../audio/sound-engine'
import type { Tier } from '../cmps/views/test-gallery/shuffle-pro/shuffle-pro-logic'
import { type ClipRow, type ClipSet, clipRows, planFor } from './lab-data'
import {
  type CueMeasure,
  type RevealChoice,
  measureCue,
  playClipRaw,
  playCueOnce,
  playCueRun,
  playReveal,
  playSequence,
  renderSequence,
} from './lab-engine'
import { SEQUENCE_TAIL_SECONDS, TIERS, buildSequence } from './lab-sequence'
import {
  type PanelProps,
  PlayIcon,
  PlaybackLines,
  Votes,
  num,
  signed,
} from './lab-ui'
import { exportVerdicts } from './lab-verdicts'
import { encodeWav } from './lab-wav'

const TIER_LABEL: Record<Tier, string> = {
  frost: 'Frost',
  amethyst: 'Amethyst',
  jade: 'Jade',
  gold: 'Gold',
}

const download = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------- sequence

const choiceKey = (choice: RevealChoice) =>
  choice ? `${choice.set}:${choice.name}` : 'auto'

export function SequencePanel({ ensure }: PanelProps) {
  const [tier, setTier] = useState<Tier>('gold')
  const [choice, setChoice] = useState<RevealChoice>(null)
  const [active, setActive] = useState(-1)
  const [rendered, setRendered] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const timers = useRef<number[]>([])
  const rows = useMemo(() => clipRows(), [])
  const steps = useMemo(() => buildSequence(tier), [tier])
  const jingles = rows.filter((r) => r.role === tier && r.set !== 'held-back')

  useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t)
    },
    [],
  )

  const pick = (nextTier: Tier) => {
    setTier(nextTier)
    setChoice(null)
  }

  const play = async () => {
    const lab = await ensure()
    for (const t of timers.current) window.clearTimeout(t)
    const played = playSequence(lab, tier, choice)
    timers.current = played.map((step, i) =>
      window.setTimeout(() => setActive(i), step.atMs),
    )
    timers.current.push(
      window.setTimeout(
        () => setActive(-1),
        played[played.length - 1].atMs + SEQUENCE_TAIL_SECONDS * 1000,
      ),
    )
  }

  const render = async (save: boolean) => {
    const lab = await ensure()
    setBusy(true)
    try {
      const out = await renderSequence(lab, tier, choice)
      setRendered(
        `${TIER_LABEL[tier]}: ${num(out.lufs)} LUFS, peak ${num(out.peakDb)} dBFS, sound ends at ${num(out.endSeconds, 2)} s, at ${Math.round(lab.volume * 100)}% volume`,
      )
      if (save) {
        const wav = encodeWav(out.channels, 48000)
        download(
          `scrollflix-sequence-${tier}.wav`,
          new Blob([wav], { type: 'audio/wav' }),
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const ladder = async () => {
    const lab = await ensure()
    TIERS.forEach((t, i) => playReveal(lab, t, undefined, i * 5.2))
  }

  return (
    <section className='lab-section'>
      <header className='lab-section-head'>
        <h2>A visit, start to finish</h2>
        <p>
          Hover, press, open, save, build a path, land, reveal. One listen shows
          whether the cues belong to the same family and whether the reveal is
          the biggest moment.
        </p>
      </header>

      <div className='lab-controls'>
        <div className='lab-segment' role='tablist' aria-label='Reveal tier'>
          {TIERS.map((t) => (
            <button
              key={t}
              type='button'
              role='tab'
              aria-selected={tier === t}
              data-tier={t}
              onClick={() => pick(t)}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
        <label className='lab-select'>
          <span>Jingle</span>
          <select
            value={choiceKey(choice)}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'auto') return setChoice(null)
              const [set, name] = value.split(':')
              setChoice({ set: set as 'shipped' | 'candidate', name })
            }}
          >
            <option value='auto'>As the site plays it (rotation)</option>
            {jingles.map((row) => (
              <option
                key={row.name}
                value={`${row.set === 'candidate' ? 'candidate' : 'shipped'}:${row.name}`}
              >
                {row.name}
                {row.set === 'candidate' ? ' (candidate)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className='lab-actions'>
        <button type='button' className='lab-primary' onClick={play}>
          <PlayIcon /> Play sequence
        </button>
        <button type='button' className='lab-ghost' onClick={ladder}>
          Frost to gold, four reveals
        </button>
        <button
          type='button'
          className='lab-ghost'
          disabled={busy}
          onClick={() => render(false)}
        >
          Measure
        </button>
        <button
          type='button'
          className='lab-ghost'
          disabled={busy}
          onClick={() => render(true)}
        >
          Render to WAV
        </button>
      </div>
      {rendered && <p className='lab-note'>{rendered}</p>}

      <ol className='lab-timeline'>
        {steps.map((step, i) => (
          <li key={`${step.atMs}-${step.label}`} data-active={active === i}>
            <time>{(step.atMs / 1000).toFixed(2)} s</time>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// -------------------------------------------------------------------- cues

const CUE_NOTES: Record<Cue, string> = {
  hover: 'The softest click, under the pointer.',
  tap: 'The press: the same click, a little firmer.',
  grab: 'Taking hold of the globe: the tap click, lower.',
  open: 'A card arrives: the tap click, leaned up.',
  close: 'The card leaves: the tap click, leaned down.',
  settle: 'A drag or flick comes to rest: lower and firmer the harder it was.',
  heart: 'A film is saved: the tap click, up a fifth and a touch louder.',
  confirm: 'A small yes: the tap click, up.',
  trailPoint: 'A film joins the path: the click steps up along the path.',
  moodPick: 'Choosing a mood world: the click climbs along the row.',
  moodGo: 'Landing on a film from the mood page: the tap click, high.',
  landing: 'The globe settles on a film: a soft low thump (synthesised).',
  shuffleStart:
    'The globe sets off for a random film: a soft whoosh (synthesised).',
  spinTick: 'The globe’s detents. Not played by the site any more.',
}

const CUE_ROLE: Partial<Record<Cue, string>> = {
  hover: 'hover',
  tap: 'tap',
  grab: 'tap',
  open: 'tap',
  close: 'tap',
  settle: 'tap',
  heart: 'tap',
  confirm: 'tap',
  trailPoint: 'tap',
  spinTick: 'spin',
}

export function CuesPanel({ ensure, verdicts, vote }: PanelProps) {
  const [plays, setPlays] = useState<Partial<Record<Cue, CuePlayback[]>>>({})
  const [measures, setMeasures] = useState<Partial<Record<Cue, CueMeasure>>>({})
  const [measuring, setMeasuring] = useState(false)

  const once = async (cue: Cue) => {
    const lab = await ensure()
    setPlays((p) => ({ ...p, [cue]: [playCueOnce(lab, cue, { strength: 1 })] }))
  }
  const run = async (cue: Cue) => {
    const lab = await ensure()
    setPlays((p) => ({ ...p, [cue]: playCueRun(lab, cue, 8) }))
  }
  const measure = async (cues: Cue[]) => {
    const lab = await ensure()
    setMeasuring(true)
    try {
      for (const cue of cues) {
        const result = await measureCue(lab, cue)
        setMeasures((m) => ({ ...m, [cue]: result }))
      }
    } finally {
      setMeasuring(false)
    }
  }

  return (
    <section className='lab-section'>
      <header className='lab-section-head'>
        <h2>Cues</h2>
        <p>
          Each is what the site plays, with its variety on. “×8” plays it eight
          times in a row with the pointer sweeping left to right, and lists what
          each play chose: the clip, the pitch shift, the level, the side.
        </p>
      </header>
      <div className='lab-actions'>
        <button
          type='button'
          className='lab-ghost'
          disabled={measuring}
          onClick={() =>
            measure(CUES.filter((c) => CUE_SPECS[c].layers.length > 0))
          }
        >
          {measuring ? 'Measuring…' : 'Measure all cues'}
        </button>
        <span className='lab-note'>
          Five plays each, rendered through the same limiter and master volume.
        </span>
      </div>

      <ul className='lab-list'>
        {CUES.map((cue) => {
          const spec = CUE_SPECS[cue]
          const m = measures[cue]
          const role = CUE_ROLE[cue]
          const target = role ? planFor(role)?.lufs : undefined
          const recorded = spec.layers.length > 0
          return (
            <li key={cue} className='lab-item'>
              <div className='lab-item-main'>
                <div className='lab-item-title'>
                  <h3>{cue}</h3>
                  <span className='lab-tag'>{spec.category}</span>
                  {!recorded && (
                    <span className='lab-tag lab-tag-warn'>synth only</span>
                  )}
                </div>
                <p>{CUE_NOTES[cue]}</p>
                {recorded && (
                  <p className='lab-layers'>
                    {spec.layers
                      .map(
                        (l) =>
                          `${l.group}${l.semis ? ` ${l.semis > 0 ? '+' : ''}${l.semis} st` : ''}`,
                      )
                      .join('   +   ')}
                  </p>
                )}
                {m && (
                  <p className='lab-measure'>
                    {m.lufs === null
                      ? 'No recorded layers to measure.'
                      : `Measured ${num(m.lufs)} LUFS (spread ${num(m.lufsSpread)} LU), peak ${num(m.peakDb)} dBFS, ends ${num(m.seconds, 2)} s.`}
                    {target !== undefined &&
                      m.lufs !== null &&
                      ` Body clip target ${num(target, 0)}.`}
                  </p>
                )}
                {plays[cue] && <PlaybackLines plays={plays[cue] ?? []} />}
              </div>
              <div className='lab-item-side'>
                <div className='lab-row-actions'>
                  <button
                    type='button'
                    className='lab-primary lab-small'
                    disabled={!recorded}
                    onClick={() => once(cue)}
                  >
                    <PlayIcon /> Play
                  </button>
                  <button
                    type='button'
                    className='lab-ghost lab-small'
                    disabled={!recorded}
                    onClick={() => run(cue)}
                  >
                    ×8
                  </button>
                  <button
                    type='button'
                    className='lab-ghost lab-small'
                    disabled={!recorded || measuring}
                    onClick={() => measure([cue])}
                  >
                    Measure
                  </button>
                </div>
                <Votes id={`cue:${cue}`} verdicts={verdicts} vote={vote} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ------------------------------------------------------------------- clips

const SET_LABEL: Record<ClipSet, string> = {
  shipped: 'Shipped',
  'held-back': 'Held back',
  candidate: 'Candidate',
}

const flagTone = (row: ClipRow) =>
  row.flags.length === 0 ? 'ok' : row.set === 'held-back' ? 'held' : 'advisory'

function ClipLine({
  row,
  onPlay,
  onReveal,
  verdicts,
  vote,
}: {
  row: ClipRow
  onPlay: (row: ClipRow) => void
  onReveal?: (row: ClipRow) => void
} & Pick<PanelProps, 'verdicts' | 'vote'>) {
  return (
    <div className='lab-clip' data-set={row.set} data-tone={flagTone(row)}>
      <button
        type='button'
        className='lab-play'
        onClick={() => onPlay(row)}
        aria-label={`Play ${row.name}`}
      >
        <PlayIcon />
      </button>
      <div className='lab-clip-name'>
        <b>{row.name}</b>
        <span className='lab-tag' data-set={row.set}>
          {SET_LABEL[row.set]}
        </span>
        {row.desc && row.set === 'candidate' && <em>{row.desc}</em>}
      </div>
      <dl className='lab-metrics'>
        <div>
          <dt>Length</dt>
          <dd>{Math.round(row.durationMs)} ms</dd>
        </div>
        <div>
          <dt>Loudness</dt>
          <dd>
            {num(row.lufs)} <small>({signed(row.deltaLu)})</small>
          </dd>
        </div>
        <div>
          <dt>Peak</dt>
          <dd>{num(row.truePeakDb)}</dd>
        </div>
        <div>
          <dt>Bright</dt>
          <dd>{Math.round(row.centroidHz)} Hz</dd>
        </div>
        <div>
          <dt>Attack</dt>
          <dd>{num(row.attackMs)} ms</dd>
        </div>
      </dl>
      {row.flags.length > 0 && (
        <p className='lab-flags'>{row.flags.join(' · ')}</p>
      )}
      {onReveal && (
        <button
          type='button'
          className='lab-ghost lab-small'
          onClick={() => onReveal(row)}
        >
          As reveal
        </button>
      )}
      <Votes id={row.name} verdicts={verdicts} vote={vote} />
    </div>
  )
}

const playRow = async (ensure: PanelProps['ensure'], row: ClipRow) => {
  const lab = await ensure()
  playClipRaw(lab, row.set === 'shipped' ? 'shipped' : 'candidate', row.name)
}

type Filter = 'all' | ClipSet | 'flagged'

export function ClipsPanel({ ensure, verdicts, vote }: PanelProps) {
  const rows = useMemo(() => clipRows(), [])
  const [filter, setFilter] = useState<Filter>('all')
  const visible = rows.filter((row) =>
    filter === 'all'
      ? true
      : filter === 'flagged'
        ? row.flags.length > 0
        : row.set === filter,
  )
  const roles = [...new Set(visible.map((r) => r.role))]
  const counts: Record<Filter, number> = {
    all: rows.length,
    shipped: rows.filter((r) => r.set === 'shipped').length,
    'held-back': rows.filter((r) => r.set === 'held-back').length,
    candidate: rows.filter((r) => r.set === 'candidate').length,
    flagged: rows.filter((r) => r.flags.length > 0).length,
  }
  const filters: [Filter, string][] = [
    ['all', 'All'],
    ['shipped', 'Shipped'],
    ['held-back', 'Held back'],
    ['candidate', 'Candidates'],
    ['flagged', 'Flagged'],
  ]
  return (
    <section className='lab-section'>
      <header className='lab-section-head'>
        <h2>Every clip</h2>
        <p>
          Played as recorded, with no variation. Loudness is integrated LUFS and
          the number in brackets is the distance from the plan’s target for its
          role; peak is true peak in dBFS. “Held back” clips failed the build’s
          gate for brightness or attack and are not in the shipped sprite.
        </p>
      </header>
      <div className='lab-segment' role='tablist' aria-label='Filter clips'>
        {filters.map(([key, label]) => (
          <button
            key={key}
            type='button'
            role='tab'
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
          >
            {label} <small>{counts[key]}</small>
          </button>
        ))}
      </div>
      {roles.map((role) => {
        const target = planFor(role)
        return (
          <div key={role} className='lab-group'>
            <h3>
              {role}
              {target && (
                <small>
                  target {target.lufs} LUFS · up to {target.maxMs} ms
                </small>
              )}
            </h3>
            <ul className='lab-clips'>
              {visible
                .filter((r) => r.role === role)
                .map((row) => (
                  <li key={row.name}>
                    <ClipLine
                      row={row}
                      onPlay={(r) => playRow(ensure, r)}
                      verdicts={verdicts}
                      vote={vote}
                    />
                  </li>
                ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

// ----------------------------------------------------------------- reveals

export function RevealsPanel({ ensure, verdicts, vote }: PanelProps) {
  const rows = useMemo(() => clipRows(), [])
  const ladder = async () => {
    const lab = await ensure()
    TIERS.forEach((t, i) => playReveal(lab, t, undefined, i * 5.2))
  }
  const asReveal = async (row: ClipRow) => {
    const lab = await ensure()
    playReveal(lab, row.role as Tier, {
      set: row.set === 'candidate' ? 'candidate' : 'shipped',
      name: row.name,
    })
  }
  return (
    <section className='lab-section'>
      <header className='lab-section-head'>
        <h2>Reveal jingles</h2>
        <p>
          Four tiers, each a step bigger than the last. “As reveal” plays the
          jingle through the site’s reverb and echo with its sparkle cascade, as
          it lands in Shuffle Pro. Candidates are rendered offline from the
          scripts in <code>scripts/sound</code>; the notes under each name are
          what was written, and the count is how many were found in the audio.
        </p>
      </header>
      <div className='lab-actions'>
        <button type='button' className='lab-primary' onClick={ladder}>
          <PlayIcon /> Frost to gold, four reveals
        </button>
      </div>
      {TIERS.map((tier) => {
        const target = planFor(tier)
        const tierRows = rows.filter(
          (r) => r.role === tier && r.set !== 'held-back',
        )
        return (
          <div key={tier} className='lab-group' data-tier={tier}>
            <h3>
              {TIER_LABEL[tier]}
              {target && (
                <small>
                  target {target.lufs} LUFS · up to {target.maxMs} ms
                </small>
              )}
            </h3>
            <ul className='lab-clips'>
              {tierRows.map((row) => (
                <li key={row.name} className='lab-reveal'>
                  <ClipLine
                    row={row}
                    onPlay={(r) => playRow(ensure, r)}
                    onReveal={asReveal}
                    verdicts={verdicts}
                    vote={vote}
                  />
                  {row.notes && (
                    <p className='lab-chips'>
                      {row.notes.map((n) => (
                        <span
                          key={`${n.t}-${n.midi}`}
                          title={`${n.t.toFixed(2)} s`}
                        >
                          {n.note}
                        </span>
                      ))}
                      {row.notesFound && (
                        <small>
                          {row.notesFound.found}/{row.notesFound.of} found in
                          the audio
                        </small>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

// ---------------------------------------------------------------- verdicts

export function VerdictsPanel({
  verdicts,
  clear,
}: Pick<PanelProps, 'verdicts'> & { clear: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const out = exportVerdicts(verdicts)
  const json = JSON.stringify(out, null, 2)
  const total = Object.keys(verdicts).length
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked; the download still works.
    }
  }
  const groups: [string, string[]][] = [
    ['Keep', out.keep],
    ['Replace', out.replace],
    ['Too quiet', out.tooQuiet],
    ['Too loud', out.tooLoud],
  ]
  return (
    <section className='lab-section'>
      <header className='lab-section-head'>
        <h2>Verdicts</h2>
        <p>
          Saved in this browser as you press them. Export when you are done and
          the build can apply them: replaced clips drop out, level notes become
          trims.
        </p>
      </header>
      <div className='lab-actions'>
        <button
          type='button'
          className='lab-primary'
          disabled={total === 0}
          onClick={() =>
            download(
              'scrollflix-sound-verdicts.json',
              new Blob([json], { type: 'application/json' }),
            )
          }
        >
          Download JSON
        </button>
        <button
          type='button'
          className='lab-ghost'
          disabled={total === 0}
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <button
          type='button'
          className='lab-ghost'
          disabled={total === 0}
          onClick={() => {
            if (!confirm) return setConfirm(true)
            clear()
            setConfirm(false)
          }}
          onBlur={() => setConfirm(false)}
        >
          {confirm ? 'Press again to clear all' : 'Clear all'}
        </button>
      </div>
      {total === 0 ? (
        <p className='lab-empty'>
          Nothing yet. Press Keep, Replace, Too quiet or Too loud on any cue or
          clip.
        </p>
      ) : (
        <div className='lab-verdict-groups'>
          {groups.map(([label, ids]) => (
            <div key={label}>
              <h3>
                {label} <small>{ids.length}</small>
              </h3>
              <p className='lab-chips'>
                {ids.length === 0 ? (
                  <small>none</small>
                ) : (
                  ids.map((id) => <span key={id}>{id}</span>)
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
