import type { ReactNode } from 'react'
import type { MoodFilter } from './mood-worlds'

// One illustrated scene per mood, drawn in SVG so it stays sharp and weighs
// next to nothing. Every scene is built from three depth layers (far, mid,
// near) that the page nudges with the pointer, and a few looping details.

const rng = (seed: number) => {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

type Item = { id: string }
const make = <T,>(count: number, build: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => ({
    id: `i${index}`,
    ...build(index),
  })) as Array<T & Item>

const Frame = ({ children }: { children: ReactNode }) => (
  <svg
    className='mood-scene'
    viewBox='0 0 400 600'
    preserveAspectRatio='xMidYMid slice'
    aria-hidden='true'
    focusable='false'
  >
    {children}
  </svg>
)

// ------------------------------------------------------------------- fast

const FastScene = () => {
  const random = rng(11)
  const speedLines = make(26, () => {
    const angle = random() * Math.PI * 2
    return {
      x: 200 + Math.cos(angle) * 620,
      y: 360 + Math.sin(angle) * 620,
      delay: random() * 1.6,
      width: 0.8 + random() * 1.6,
    }
  })
  const bars = make(8, (index) => ({ y: 298 + index * 8, h: 1 + index * 0.9 }))
  const dashes = make(7, (index) => {
    const t = ((index + 1) / 8) ** 1.7
    return { y: 360 + 240 * t, w: 2 + 13 * t, h: 5 + 30 * t }
  })
  return (
    <Frame>
      <defs>
        <linearGradient id='mf-sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#0b0407' />
          <stop offset='0.62' stopColor='#6a1c0b' />
          <stop offset='1' stopColor='#ff7a2f' />
        </linearGradient>
        <radialGradient id='mf-sun' cx='0.5' cy='0.5' r='0.5'>
          <stop offset='0' stopColor='#fff6cf' />
          <stop offset='0.5' stopColor='#ffb347' />
          <stop offset='1' stopColor='#ff4d1f' />
        </radialGradient>
        <clipPath id='mf-above'>
          <rect x='0' y='0' width='400' height='360' />
        </clipPath>
        <clipPath id='mf-disc'>
          <circle cx='200' cy='360' r='88' />
        </clipPath>
        <filter id='mf-blur' x='-20%' y='-20%' width='140%' height='140%'>
          <feGaussianBlur stdDeviation='3' />
        </filter>
      </defs>
      <rect width='400' height='600' fill='#0a0405' />
      <rect width='400' height='360' fill='url(#mf-sky)' />
      <g className='ms-far'>
        <g clipPath='url(#mf-above)'>
          <circle cx='200' cy='360' r='150' fill='#ff6a2b' opacity='0.18' />
          <circle cx='200' cy='360' r='88' fill='url(#mf-sun)' />
          <g clipPath='url(#mf-disc)'>
            {bars.map((bar) => (
              <rect
                key={bar.id}
                x='100'
                y={bar.y}
                width='200'
                height={bar.h}
                fill='#2a0d08'
              />
            ))}
          </g>
        </g>
      </g>
      <g className='ms-mid' opacity='0.55'>
        {speedLines.map((line) => (
          <line
            key={line.id}
            className='ms-streak'
            x1='200'
            y1='360'
            x2={line.x}
            y2={line.y}
            stroke='#ffd9a8'
            strokeWidth={line.width}
            style={{ animationDelay: `${line.delay}s` }}
          />
        ))}
      </g>
      <polygon points='200,360 -60,600 460,600' fill='#140809' />
      <g className='ms-near'>
        <line
          x1='200'
          y1='360'
          x2='-40'
          y2='600'
          stroke='#ff7a2f'
          strokeWidth='2'
          opacity='0.7'
        />
        <line
          x1='200'
          y1='360'
          x2='440'
          y2='600'
          stroke='#ff7a2f'
          strokeWidth='2'
          opacity='0.7'
        />
        {dashes.map((dash) => (
          <rect
            key={dash.id}
            x={200 - dash.w / 2}
            y={dash.y}
            width={dash.w}
            height={dash.h}
            fill='#ffd9a0'
            opacity='0.85'
          />
        ))}
        <path
          className='ms-trail'
          d='M200 360 Q112 470 24 600'
          stroke='#ff3b2f'
          strokeWidth='5'
          fill='none'
          filter='url(#mf-blur)'
        />
        <path
          className='is-late ms-trail'
          d='M200 360 Q288 470 376 600'
          stroke='#fff2d6'
          strokeWidth='4'
          fill='none'
          filter='url(#mf-blur)'
        />
      </g>
    </Frame>
  )
}

// ------------------------------------------------------------------- dark

const pines = (
  seed: number,
  baseY: number,
  count: number,
  minH: number,
  maxH: number,
) => {
  const random = rng(seed)
  let d = ''
  for (let index = 0; index < count; index += 1) {
    const x = (index / (count - 1)) * 440 - 20 + (random() - 0.5) * 18
    const h = minH + random() * (maxH - minH)
    const w = h * 0.34
    d += `M${x - w} ${baseY} L${x - w * 0.55} ${baseY - h * 0.38} L${x - w * 0.8} ${baseY - h * 0.38} L${x - w * 0.3} ${baseY - h * 0.72} L${x - w * 0.5} ${baseY - h * 0.72} L${x} ${baseY - h} L${x + w * 0.5} ${baseY - h * 0.72} L${x + w * 0.3} ${baseY - h * 0.72} L${x + w * 0.8} ${baseY - h * 0.38} L${x + w * 0.55} ${baseY - h * 0.38} L${x + w} ${baseY}Z `
  }
  return d
}

const DarkScene = () => {
  const random = rng(7)
  const stars = make(46, () => ({
    x: random() * 400,
    y: random() * 300,
    r: 0.5 + random() * 1.1,
    delay: random() * 4,
  }))
  return (
    <Frame>
      <defs>
        <linearGradient id='md-sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#04040c' />
          <stop offset='0.6' stopColor='#190d38' />
          <stop offset='1' stopColor='#4a1238' />
        </linearGradient>
        <radialGradient id='md-moon' cx='0.38' cy='0.35' r='0.7'>
          <stop offset='0' stopColor='#fff2e8' />
          <stop offset='0.6' stopColor='#eaa9a3' />
          <stop offset='1' stopColor='#b04a5a' />
        </radialGradient>
        <radialGradient id='md-glow' cx='0.5' cy='0.5' r='0.5'>
          <stop offset='0' stopColor='#ff8a7a' stopOpacity='0.45' />
          <stop offset='1' stopColor='#ff8a7a' stopOpacity='0' />
        </radialGradient>
        <radialGradient id='md-window' cx='0.5' cy='0.5' r='0.5'>
          <stop offset='0' stopColor='#ffd27a' stopOpacity='0.9' />
          <stop offset='1' stopColor='#ffd27a' stopOpacity='0' />
        </radialGradient>
        <filter id='md-fog' x='-30%' y='-60%' width='160%' height='220%'>
          <feGaussianBlur stdDeviation='16' />
        </filter>
      </defs>
      <rect width='400' height='600' fill='url(#md-sky)' />
      <g className='ms-far'>
        {stars.map((star) => (
          <circle
            key={star.id}
            className='ms-twinkle'
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill='#fff'
            style={{ animationDelay: `${star.delay}s` }}
          />
        ))}
        <circle cx='290' cy='150' r='130' fill='url(#md-glow)' />
        <circle cx='290' cy='150' r='50' fill='url(#md-moon)' />
        <circle cx='276' cy='138' r='9' fill='#b04a5a' opacity='0.45' />
        <circle cx='304' cy='162' r='6' fill='#b04a5a' opacity='0.4' />
        <circle cx='296' cy='128' r='4' fill='#b04a5a' opacity='0.35' />
      </g>
      <g className='ms-mid'>
        <path d='M0 430 Q100 385 210 415 T400 400 V600 H0Z' fill='#140a2b' />
        <path d={pines(3, 430, 15, 60, 110)} fill='#0e0722' />
        <g className='ms-fog-a'>
          <ellipse
            cx='120'
            cy='440'
            rx='190'
            ry='26'
            fill='#6a4aa8'
            opacity='0.35'
            filter='url(#md-fog)'
          />
        </g>
      </g>
      <g className='ms-near'>
        <path d='M0 500 Q120 470 240 495 T400 485 V600 H0Z' fill='#07040f' />
        <g transform='translate(88 452)'>
          <circle
            cx='24'
            cy='26'
            r='46'
            fill='url(#md-window)'
            className='ms-flicker'
          />
          <rect x='0' y='16' width='62' height='44' fill='#05030a' />
          <polygon points='-8,18 31,-8 70,18' fill='#05030a' />
          <rect
            x='18'
            y='26'
            width='13'
            height='14'
            fill='#ffcf70'
            className='ms-flicker'
          />
          <rect x='40' y='36' width='9' height='24' fill='#120a1f' />
        </g>
        <path d={pines(5, 520, 9, 130, 230)} fill='#040208' />
        <g className='ms-fog-b'>
          <ellipse
            cx='280'
            cy='530'
            rx='220'
            ry='30'
            fill='#8a6ac8'
            opacity='0.28'
            filter='url(#md-fog)'
          />
        </g>
      </g>
    </Frame>
  )
}

// ------------------------------------------------------------------ funny

const CONFETTI = ['#ff3d81', '#7c4dff', '#00d4ff', '#fff', '#ffd23f', '#2ee59d']

const FunnyScene = () => {
  const random = rng(23)
  const confetti = make(26, (index) => ({
    x: random() * 400,
    w: 6 + random() * 10,
    h: 4 + random() * 10,
    round: random() > 0.62,
    color: CONFETTI[index % CONFETTI.length],
    delay: -random() * 9,
    duration: 6 + random() * 5,
    spin: (random() > 0.5 ? 1 : -1) * (180 + random() * 360),
  }))
  const bokeh = make(7, () => ({
    x: random() * 400,
    y: random() * 600,
    r: 30 + random() * 70,
  }))
  return (
    <Frame>
      <defs>
        <linearGradient id='mh-sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#ffd84a' />
          <stop offset='0.55' stopColor='#ff8f3a' />
          <stop offset='1' stopColor='#ff3d81' />
        </linearGradient>
        <radialGradient id='mh-face' cx='0.38' cy='0.32' r='0.8'>
          <stop offset='0' stopColor='#fff6a8' />
          <stop offset='0.65' stopColor='#ffd23f' />
          <stop offset='1' stopColor='#ff9f1a' />
        </radialGradient>
        <clipPath id='mh-mouth'>
          <path d='M122 292 Q200 404 278 292 Q200 330 122 292Z' />
        </clipPath>
      </defs>
      <rect width='400' height='600' fill='url(#mh-sky)' />
      <g className='ms-far'>
        {bokeh.map((dot) => (
          <circle
            key={dot.id}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            fill='#fff'
            opacity='0.08'
          />
        ))}
      </g>
      <g className='ms-mid'>
        <ellipse
          cx='200'
          cy='418'
          rx='96'
          ry='13'
          fill='#7a1747'
          opacity='0.35'
        />
        <g className='ms-bob'>
          <circle cx='200' cy='270' r='130' fill='url(#mh-face)' />
          <ellipse
            cx='150'
            cy='196'
            rx='40'
            ry='18'
            fill='#fff'
            opacity='0.32'
            transform='rotate(-24 150 196)'
          />
          <circle cx='128' cy='306' r='20' fill='#ff6b6b' opacity='0.4' />
          <circle cx='272' cy='306' r='20' fill='#ff6b6b' opacity='0.4' />
          <ellipse
            className='ms-blink'
            cx='160'
            cy='236'
            rx='13'
            ry='23'
            fill='#3a1500'
          />
          <ellipse
            className='ms-blink'
            cx='240'
            cy='236'
            rx='13'
            ry='23'
            fill='#3a1500'
          />
          <path
            d='M122 292 Q200 404 278 292 Q200 330 122 292Z'
            fill='#3a1500'
          />
          <g clipPath='url(#mh-mouth)'>
            <ellipse cx='200' cy='372' rx='46' ry='30' fill='#ff5e7e' />
          </g>
          <path
            d='M132 210 Q160 192 186 206'
            stroke='#3a1500'
            strokeWidth='6'
            strokeLinecap='round'
            fill='none'
          />
          <path
            d='M214 206 Q240 192 268 210'
            stroke='#3a1500'
            strokeWidth='6'
            strokeLinecap='round'
            fill='none'
          />
        </g>
      </g>
      <g className='ms-near'>
        {confetti.map((piece) => (
          <g
            key={piece.id}
            className='ms-fall'
            style={
              {
                '--x': `${piece.x}px`,
                '--spin': `${piece.spin}deg`,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
              } as never
            }
          >
            {piece.round ? (
              <circle cx={piece.x} cy='0' r={piece.w / 2} fill={piece.color} />
            ) : (
              <rect
                x={piece.x}
                y='0'
                width={piece.w}
                height={piece.h}
                rx='1.5'
                fill={piece.color}
              />
            )}
          </g>
        ))}
      </g>
    </Frame>
  )
}

// --------------------------------------------------------------- romantic

const RomanticScene = () => {
  const random = rng(31)
  const petals = make(18, () => ({
    x: random() * 400,
    s: 0.7 + random() * 1.1,
    delay: -random() * 12,
    duration: 9 + random() * 6,
    tone: random() > 0.5 ? '#ffb3c6' : '#ff8fab',
    sway: 20 + random() * 40,
  }))
  const towers = make(11, (index) => ({
    x: index * 38 - 6,
    h: 40 + ((index * 53) % 70),
    w: 30 + ((index * 17) % 10),
    lit: (index * 7) % 3,
  }))
  return (
    <Frame>
      <defs>
        <linearGradient id='mr-sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#1b0730' />
          <stop offset='0.55' stopColor='#8a1650' />
          <stop offset='1' stopColor='#ff7a59' />
        </linearGradient>
        <radialGradient id='mr-glow' cx='0.5' cy='0.5' r='0.5'>
          <stop offset='0' stopColor='#ffb0c4' stopOpacity='0.5' />
          <stop offset='1' stopColor='#ffb0c4' stopOpacity='0' />
        </radialGradient>
        <clipPath id='mr-a'>
          <circle cx='164' cy='282' r='92' />
        </clipPath>
        <filter id='mr-soft' x='-20%' y='-20%' width='140%' height='140%'>
          <feGaussianBlur stdDeviation='4' />
        </filter>
      </defs>
      <rect width='400' height='600' fill='url(#mr-sky)' />
      <g className='ms-far'>
        <circle cx='200' cy='282' r='210' fill='url(#mr-glow)' />
      </g>
      <g className='ms-mid'>
        <g className='ms-rings'>
          <circle
            className='ms-ring-a'
            cx='164'
            cy='282'
            r='92'
            fill='#ff9db8'
            fillOpacity='0.14'
            stroke='#ffd6e0'
            strokeWidth='2.5'
          />
          <circle
            className='ms-ring-b'
            cx='236'
            cy='282'
            r='92'
            fill='#ff9db8'
            fillOpacity='0.14'
            stroke='#ffd6e0'
            strokeWidth='2.5'
          />
          <g clipPath='url(#mr-a)'>
            <circle
              className='ms-ring-b'
              cx='236'
              cy='282'
              r='92'
              fill='#ffe0ea'
              opacity='0.5'
              filter='url(#mr-soft)'
            />
          </g>
        </g>
      </g>
      <g className='ms-near'>
        {petals.map((petal) => (
          <g
            key={petal.id}
            className='ms-petal'
            style={
              {
                '--x': `${petal.x}px`,
                '--sway': `${petal.sway}px`,
                animationDelay: `${petal.delay}s`,
                animationDuration: `${petal.duration}s`,
              } as never
            }
          >
            <path
              d='M0 0 C6 -9 15 -3 0 13 C-15 -3 -6 -9 0 0Z'
              transform={`translate(${petal.x} 0) scale(${petal.s})`}
              fill={petal.tone}
              opacity='0.9'
            />
          </g>
        ))}
        {towers.map((tower) => (
          <g key={tower.id}>
            <rect
              x={tower.x}
              y={600 - tower.h}
              width={tower.w}
              height={tower.h}
              fill='#1a0620'
            />
            {tower.lit === 0 ? null : (
              <rect
                x={tower.x + 8}
                y={600 - tower.h + 12}
                width='5'
                height='6'
                fill='#ffd9a0'
                opacity='0.85'
              />
            )}
            {tower.lit === 1 ? (
              <rect
                x={tower.x + 18}
                y={600 - tower.h + 26}
                width='5'
                height='6'
                fill='#ffd9a0'
                opacity='0.6'
              />
            ) : null}
          </g>
        ))}
      </g>
    </Frame>
  )
}

// ------------------------------------------------------------------ weird

const WeirdScene = () => {
  const random = rng(41)
  const lashes = make(11, (index) => {
    const angle = Math.PI * (1.08 + (index / 10) * 0.84)
    const x = 200 + Math.cos(angle) * 128
    const y = 252 + Math.sin(angle) * 74
    return {
      x1: x,
      y1: y,
      x2: 200 + Math.cos(angle) * 152,
      y2: 252 + Math.sin(angle) * 96,
    }
  })
  const bits = make(9, (index) => ({
    x: 30 + random() * 340,
    y: 60 + random() * 470,
    s: 10 + random() * 16,
    kind: index % 3,
    delay: -random() * 6,
  }))
  return (
    <Frame>
      <defs>
        <linearGradient id='mw-sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#03101a' />
          <stop offset='0.5' stopColor='#0c3a4a' />
          <stop offset='1' stopColor='#5b1d9c' />
        </linearGradient>
        <radialGradient id='mw-eye' cx='0.5' cy='0.4' r='0.7'>
          <stop offset='0' stopColor='#f6fffb' />
          <stop offset='1' stopColor='#aef0de' />
        </radialGradient>
        <radialGradient id='mw-iris' cx='0.4' cy='0.35' r='0.75'>
          <stop offset='0' stopColor='#b4ffe6' />
          <stop offset='0.55' stopColor='#19b79a' />
          <stop offset='1' stopColor='#0a4a49' />
        </radialGradient>
        <radialGradient id='mw-aura' cx='0.5' cy='0.5' r='0.5'>
          <stop offset='0' stopColor='#5eead4' stopOpacity='0.35' />
          <stop offset='1' stopColor='#5eead4' stopOpacity='0' />
        </radialGradient>
        <clipPath id='mw-lid'>
          <path d='M62 252 Q200 130 338 252 Q200 374 62 252Z' />
        </clipPath>
      </defs>
      <rect width='400' height='600' fill='url(#mw-sky)' />
      <g className='ms-far'>
        <circle cx='200' cy='252' r='200' fill='url(#mw-aura)' />
        {bits.map((bit) => (
          <g
            key={bit.id}
            className='ms-float'
            style={{ animationDelay: `${bit.delay}s` }}
          >
            {bit.kind === 0 ? (
              <polygon
                points={`${bit.x},${bit.y - bit.s} ${bit.x + bit.s},${bit.y + bit.s} ${bit.x - bit.s},${bit.y + bit.s}`}
                fill='none'
                stroke='#c084fc'
                strokeWidth='2'
              />
            ) : bit.kind === 1 ? (
              <rect
                x={bit.x - bit.s / 2}
                y={bit.y - bit.s / 2}
                width={bit.s}
                height={bit.s}
                fill='none'
                stroke='#5eead4'
                strokeWidth='2'
                transform={`rotate(24 ${bit.x} ${bit.y})`}
              />
            ) : (
              <path
                d={`M${bit.x - bit.s} ${bit.y} q${bit.s / 2} ${-bit.s} ${bit.s} 0 t${bit.s} 0`}
                fill='none'
                stroke='#f0abfc'
                strokeWidth='2'
                strokeLinecap='round'
              />
            )}
          </g>
        ))}
      </g>
      <g className='ms-mid'>
        <g className='ms-orbit'>
          <ellipse
            cx='200'
            cy='252'
            rx='176'
            ry='54'
            fill='none'
            stroke='#5eead4'
            strokeOpacity='0.55'
            strokeWidth='1.5'
            transform='rotate(-16 200 252)'
          />
          <circle
            cx='376'
            cy='252'
            r='7'
            fill='#5eead4'
            transform='rotate(-16 200 252)'
          />
        </g>
        <g className='is-reverse ms-orbit'>
          <ellipse
            cx='200'
            cy='252'
            rx='150'
            ry='38'
            fill='none'
            stroke='#c084fc'
            strokeOpacity='0.55'
            strokeWidth='1.5'
            transform='rotate(22 200 252)'
          />
          <circle
            cx='50'
            cy='252'
            r='5'
            fill='#f0abfc'
            transform='rotate(22 200 252)'
          />
        </g>
        {lashes.map((lash) => (
          <line
            key={lash.id}
            x1={lash.x1}
            y1={lash.y1}
            x2={lash.x2}
            y2={lash.y2}
            stroke='#5eead4'
            strokeWidth='3'
            strokeLinecap='round'
            opacity='0.8'
          />
        ))}
        <path
          d='M62 252 Q200 130 338 252 Q200 374 62 252Z'
          fill='url(#mw-eye)'
        />
        <g clipPath='url(#mw-lid)'>
          <g className='ms-iris'>
            <circle cx='200' cy='252' r='54' fill='url(#mw-iris)' />
            <ellipse cx='200' cy='252' rx='12' ry='38' fill='#02100f' />
            <circle cx='182' cy='234' r='9' fill='#fff' opacity='0.85' />
          </g>
        </g>
        <path
          d='M62 252 Q200 130 338 252 Q200 374 62 252Z'
          fill='none'
          stroke='#5eead4'
          strokeWidth='3'
        />
      </g>
      <g className='ms-near'>
        <path
          d='M0 520 Q50 488 100 520 T200 520 T300 520 T400 520 V600 H0Z'
          fill='#07202a'
        />
        <path
          d='M0 552 Q50 524 100 552 T200 552 T300 552 T400 552 V600 H0Z'
          fill='#04141b'
        />
      </g>
    </Frame>
  )
}

// ------------------------------------------------------------------ great

const starPoints = (cx: number, cy: number, outer: number, inner: number) =>
  Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (index * Math.PI) / 5
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`
  }).join(' ')

const GreatScene = () => {
  const rays = make(28, (index) => {
    const a1 = (index / 28) * Math.PI * 2
    const a2 = a1 + (Math.PI * 2) / 56
    return {
      d: `M200 280 L${200 + Math.cos(a1) * 560} ${280 + Math.sin(a1) * 560} L${200 + Math.cos(a2) * 560} ${280 + Math.sin(a2) * 560}Z`,
    }
  })
  const leaves = make(9, (index) => {
    const angle = ((100 + (index / 8) * 150) * Math.PI) / 180
    return {
      x: 200 + Math.cos(angle) * 118,
      y: 290 + Math.sin(angle) * 118,
      rot: (angle * 180) / Math.PI + 90,
    }
  })
  const sparks = make(7, (index) => ({
    x: 40 + ((index * 61) % 320),
    y: 70 + ((index * 83) % 440),
    delay: -index * 0.7,
  }))
  return (
    <Frame>
      <defs>
        <linearGradient id='mg-sky' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stopColor='#100a02' />
          <stop offset='0.55' stopColor='#3d2a04' />
          <stop offset='1' stopColor='#8a6a0f' />
        </linearGradient>
        <linearGradient id='mg-gold' x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0' stopColor='#fff6c9' />
          <stop offset='0.5' stopColor='#f5c542' />
          <stop offset='1' stopColor='#b8860b' />
        </linearGradient>
        <radialGradient id='mg-glow' cx='0.5' cy='0.5' r='0.5'>
          <stop offset='0' stopColor='#ffe58a' stopOpacity='0.55' />
          <stop offset='1' stopColor='#ffe58a' stopOpacity='0' />
        </radialGradient>
      </defs>
      <rect width='400' height='600' fill='url(#mg-sky)' />
      <g className='ms-far'>
        <g className='ms-sunburst'>
          {rays.map((ray) => (
            <path key={ray.id} d={ray.d} fill='#ffd666' opacity='0.1' />
          ))}
        </g>
        <circle cx='200' cy='290' r='190' fill='url(#mg-glow)' />
      </g>
      <g className='ms-mid'>
        {[1, -1].map((side) => (
          <g
            key={side}
            transform={side === 1 ? undefined : 'translate(400 0) scale(-1 1)'}
          >
            {leaves.map((leaf) => (
              <ellipse
                key={leaf.id}
                cx='0'
                cy='0'
                rx='8'
                ry='19'
                fill='url(#mg-gold)'
                transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rot + 18})`}
                opacity='0.95'
              />
            ))}
          </g>
        ))}
        <g className='ms-star'>
          <polygon
            points={starPoints(200, 290, 66, 28)}
            fill='url(#mg-gold)'
            stroke='#fff2b0'
            strokeWidth='2'
            strokeLinejoin='round'
          />
          <polygon
            points={starPoints(200, 290, 66, 28)}
            fill='none'
            stroke='#fff'
            strokeWidth='1'
            opacity='0.5'
            transform='translate(-2 -2)'
          />
        </g>
      </g>
      <g className='ms-near'>
        {sparks.map((spark) => (
          <path
            key={spark.id}
            className='is-spark ms-twinkle'
            d={`M${spark.x} ${spark.y - 9} Q${spark.x} ${spark.y} ${spark.x + 9} ${spark.y} Q${spark.x} ${spark.y} ${spark.x} ${spark.y + 9} Q${spark.x} ${spark.y} ${spark.x - 9} ${spark.y} Q${spark.x} ${spark.y} ${spark.x} ${spark.y - 9}Z`}
            fill='#fff3b8'
            style={{ animationDelay: `${spark.delay}s` }}
          />
        ))}
        <path
          d='M0 560 Q200 520 400 560 V600 H0Z'
          fill='#1a1203'
          opacity='0.8'
        />
      </g>
    </Frame>
  )
}

const SCENES: Record<MoodFilter, () => ReactNode> = {
  fast: FastScene,
  dark: DarkScene,
  funny: FunnyScene,
  romantic: RomanticScene,
  weird: WeirdScene,
  highRated: GreatScene,
}

export const MoodScene = ({ id }: { id: MoodFilter }) => {
  const Scene = SCENES[id]
  return <Scene />
}
