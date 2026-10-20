import { ArrowRight, Check, X } from 'lucide-react'
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { playCue } from '../../../../audio/sound-engine'
import { cn } from '../../../../utils/tw'
import './mood-page.css'
import { MoodScene } from './mood-art'
import {
  hasSeenBlendHint,
  hasSeenEclipseHint,
  markBlendHintSeen,
  markEclipseHintSeen,
} from './mood-hint'
import { LEAN_LAYERS, leanTranslate, stagePosition } from './mood-lean'
import { readLandings } from './mood-memory'
import { eclipseNudge, previewMoodRun, resonanceOpen } from './mood-run-plan'
import { type MoodPick, notePick } from './mood-runs'
import {
  type BlendHint,
  MOOD_TIMES,
  MOOD_WORLDS,
  type MoodFilter,
  type MoodTimeId,
  advanceBlendHint,
  describeBlend,
  describeFit,
  nextPanelIndex,
  toggleMood,
} from './mood-worlds'

type MoodPageProps = {
  motionPhase: 'enter' | 'exit'
  initialMoods: MoodFilter[]
  initialTime: MoodTimeId
  // The world the saved films lean towards, if they say anything yet.
  tasteLead: MoodFilter | null
  // How many films a mix would show. Only used to say when nothing fits.
  countFor: (moods: MoodFilter[], time: MoodTimeId) => number
  onClose: () => void
  // `picks` is every world chosen this visit and when, for the bonus runs.
  onConfirm: (
    moods: MoodFilter[],
    time: MoodTimeId,
    picks: readonly MoodPick[],
  ) => void
}

const DEFAULT_OPEN: MoodFilter = 'dark'

// The mood page: six illustrated worlds side by side. Choose one, or blend
// two, say how long you have, and the globe lands on something that fits.
const MoodPage = ({
  motionPhase,
  initialMoods,
  initialTime,
  tasteLead,
  countFor,
  onClose,
  onConfirm,
}: MoodPageProps) => {
  const [selected, setSelected] = useState<MoodFilter[]>(initialMoods)
  const [time, setTime] = useState<MoodTimeId>(initialTime)
  const [openId, setOpenId] = useState<MoodFilter>(
    initialMoods[initialMoods.length - 1] ?? tasteLead ?? DEFAULT_OPEN,
  )
  // The tip about blending two worlds shows once, the first time exactly one
  // is chosen, and never again once it has been shown.
  const [hint, setHint] = useState<BlendHint>(() =>
    hasSeenBlendHint() ? 'done' : 'pending',
  )
  // Worlds chosen this visit, with times, for the bonus runs.
  const [picks, setPicks] = useState<MoodPick[]>([])
  const [landings] = useState(readLandings)
  const [eclipseHintSeen] = useState(hasSeenEclipseHint)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef(0)
  const rectRef = useRef<DOMRect | null>(null)
  const layersRef = useRef<
    Array<{ el: SVGElement; reachX: number; reachY: number }>
  >([])

  // The stage is measured when it changes size and when the pointer arrives,
  // not on every pointer frame, and the depth layers are found once.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      rectRef.current = stage.getBoundingClientRect()
    }
    measure()
    layersRef.current = LEAN_LAYERS.flatMap(({ selector, reachX, reachY }) =>
      Array.from(stage.querySelectorAll<SVGElement>(selector), (el) => ({
        el,
        reachX,
        reachY,
      })),
    )
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  // On a phone the worlds sit in a scrolling strip: only the ones in view
  // keep animating (see mood-page.css).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const panel = entry.target as HTMLElement
          panel.dataset.offscreen = entry.isIntersecting ? 'false' : 'true'
        }
      },
      { root: stage },
    )
    for (const panel of stage.querySelectorAll('.mood-panel')) {
      observer.observe(panel)
    }
    return () => observer.disconnect()
  }, [])

  // The scenes lean toward the pointer a little; each depth layer more.
  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === 'touch') return
    window.cancelAnimationFrame(frameRef.current)
    const { clientX, clientY } = event
    frameRef.current = window.requestAnimationFrame(() => {
      const rect = rectRef.current
      if (!rect) return
      const x = stagePosition(clientX, rect.left, rect.width)
      const y = stagePosition(clientY, rect.top, rect.height)
      for (const { el, reachX, reachY } of layersRef.current) {
        el.style.translate = leanTranslate(reachX, reachY, x, y)
      }
    })
  }, [])
  const handlePointerEnter = useCallback(() => {
    rectRef.current = stageRef.current?.getBoundingClientRect() ?? null
  }, [])
  useEffect(() => () => window.cancelAnimationFrame(frameRef.current), [])

  const chosenCount = selected.length
  useEffect(() => {
    setHint((current) => advanceBlendHint(current, chosenCount))
  }, [chosenCount])
  useEffect(() => {
    if (hint === 'showing') markBlendHintSeen()
  }, [hint])

  // Left and right step through the worlds, Home and End jump to the ends.
  // Focusing a world opens it, so the arrows browse them like the mouse does.
  const handleStageKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const panels = Array.from(
        event.currentTarget.querySelectorAll<HTMLButtonElement>('.mood-panel'),
      )
      const current = panels.findIndex(
        (panel) => panel === document.activeElement,
      )
      if (current < 0) return
      const next = nextPanelIndex(current, event.key, panels.length)
      if (next === null) return
      event.preventDefault()
      panels[next]?.focus()
    },
    [],
  )

  const lead = selected[selected.length - 1]
  const accent =
    MOOD_WORLDS.find((world) => world.id === lead)?.accent ?? '#ffffff'
  const matches = useMemo(
    () => (selected.length ? countFor(selected, time) : null),
    [countFor, selected, time],
  )
  const nothingFits = matches === 0
  const canGo = selected.length > 0 && !nothingFits

  // Quiet signs that a landing will earn a bonus run: no words, just light.
  const humming = resonanceOpen(selected)
  const armed = useMemo(
    () =>
      canGo &&
      previewMoodRun(
        {
          selected,
          time,
          filmCount: matches ?? 0,
          picks,
        },
        landings,
      ) !== null,
    [canGo, selected, time, matches, landings, picks],
  )
  const nudge = eclipseHintSeen ? null : eclipseNudge(selected, landings)
  useEffect(() => {
    if (nudge) markEclipseHintSeen()
  }, [nudge])

  return (
    <section
      className='mood-page'
      data-motion={motionPhase}
      aria-label='Choose your mood'
      style={{ '--mood-accent': accent } as CSSProperties}
    >
      <header className='mood-head'>
        <div>
          <p className='mood-kicker'>Pick your mood</p>
          <h1>How are you feeling?</h1>
          <p className='mood-sub'>
            Choose one, or blend two. We will land you on a film that fits.
          </p>
        </div>
        <button
          type='button'
          className='mood-close'
          aria-label='Close the mood page'
          onClick={onClose}
        >
          <X aria-hidden='true' />
        </button>
      </header>

      <div
        ref={stageRef}
        className='mood-stage'
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onKeyDown={handleStageKeyDown}
      >
        {MOOD_WORLDS.map((world, index) => {
          const position = selected.indexOf(world.id)
          const isSelected = position >= 0
          return (
            <button
              type='button'
              key={world.id}
              className={cn(
                'mood-panel',
                openId === world.id && 'is-open',
                isSelected && 'is-selected',
              )}
              data-hum={humming && isSelected ? 'true' : undefined}
              style={
                {
                  '--panel-accent': world.accent,
                  '--i': index,
                } as CSSProperties
              }
              aria-pressed={isSelected}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') setOpenId(world.id)
              }}
              onFocus={() => setOpenId(world.id)}
              onClick={() => {
                setOpenId(world.id)
                if (!isSelected) {
                  playCue('moodPick', index / (MOOD_WORLDS.length - 1))
                }
                if (!isSelected) {
                  const at = performance.now()
                  setPicks((current) => notePick(current, world.id, at))
                }
                setSelected((current) => toggleMood(current, world.id))
              }}
            >
              <MoodScene id={world.id} />
              <span className='mood-scrim' aria-hidden='true' />
              <span className='mood-tick' aria-hidden='true'>
                {isSelected ? (
                  selected.length > 1 ? (
                    <b>{position + 1}</b>
                  ) : (
                    <Check strokeWidth={3.4} />
                  )
                ) : null}
              </span>
              <span className='mood-label'>
                <span className='mood-index' aria-hidden='true'>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className='mood-name'>{world.name}</span>
                {tasteLead === world.id ? (
                  <span className='mood-for-you'>For you</span>
                ) : null}
                <span className='mood-promise'>{world.promise}</span>
              </span>
              <span className='mood-name-v' aria-hidden='true'>
                {world.name}
              </span>
            </button>
          )
        })}
      </div>

      <footer className='mood-foot'>
        <fieldset className='mood-times'>
          <legend>How long have you got?</legend>
          <div>
            {MOOD_TIMES.map((option) => (
              <button
                type='button'
                key={option.id}
                className={cn('mood-time', time === option.id && 'is-active')}
                aria-pressed={time === option.id}
                onClick={() => setTime(option.id)}
              >
                <span>{option.label}</span>
                <small>{option.hint}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <div className='mood-go'>
          <output className='mood-blend'>
            <span className='mood-blend-names'>
              {nothingFits
                ? 'Nothing fits that mix. Try a longer time.'
                : selected.length
                  ? describeBlend(selected)
                  : 'Choose a world to begin'}
            </span>
            {matches !== null && !nothingFits ? (
              <span className='mood-fit'>{describeFit(matches)}</span>
            ) : null}
            {hint === 'showing' && selected.length === 1 ? (
              <span className='mood-hint'>
                Tip: pick a second world to blend the two.
              </span>
            ) : nudge ? (
              <span className='mood-hint'>
                You keep coming back to{' '}
                {MOOD_WORLDS.find((world) => world.id === nudge)?.name}.
              </span>
            ) : null}
          </output>
          <button
            type='button'
            className='mood-cta'
            data-armed={armed ? 'true' : undefined}
            disabled={!canGo}
            onClick={() => {
              playCue('moodGo')
              onConfirm(selected, time, picks)
            }}
          >
            <span>Land on a film</span>
            <ArrowRight aria-hidden='true' />
          </button>
        </div>
      </footer>
    </section>
  )
}

export default MoodPage
