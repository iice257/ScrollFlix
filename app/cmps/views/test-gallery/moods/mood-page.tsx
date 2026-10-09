import { ArrowRight, Check, X } from 'lucide-react'
import {
  type CSSProperties,
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
  MOOD_TIMES,
  MOOD_WORLDS,
  type MoodFilter,
  type MoodTimeId,
  describeBlend,
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
  onConfirm: (moods: MoodFilter[], time: MoodTimeId) => void
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
  const stageRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef(0)

  // The scenes lean toward the pointer a little; each depth layer more.
  const handlePointerMove = useCallback((event: ReactPointerEvent) => {
    const stage = stageRef.current
    if (!stage || event.pointerType === 'touch') return
    window.cancelAnimationFrame(frameRef.current)
    const { clientX, clientY } = event
    frameRef.current = window.requestAnimationFrame(() => {
      const rect = stage.getBoundingClientRect()
      const x = ((clientX - rect.left) / rect.width - 0.5) * 2
      const y = ((clientY - rect.top) / rect.height - 0.5) * 2
      stage.style.setProperty('--mx', x.toFixed(3))
      stage.style.setProperty('--my', y.toFixed(3))
    })
  }, [])
  useEffect(() => () => window.cancelAnimationFrame(frameRef.current), [])

  const lead = selected[selected.length - 1]
  const accent =
    MOOD_WORLDS.find((world) => world.id === lead)?.accent ?? '#ffffff'
  const matches = useMemo(
    () => (selected.length ? countFor(selected, time) : null),
    [countFor, selected, time],
  )
  const nothingFits = matches === 0
  const canGo = selected.length > 0 && !nothingFits

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
        onPointerMove={handlePointerMove}
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
            {nothingFits
              ? 'Nothing fits that mix. Try a longer time.'
              : selected.length
                ? describeBlend(selected)
                : 'Choose a world to begin'}
          </output>
          <button
            type='button'
            className='mood-cta'
            disabled={!canGo}
            onClick={() => {
              playCue('moodGo')
              onConfirm(selected, time)
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
