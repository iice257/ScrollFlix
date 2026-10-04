// Generates app/light-theme.css from app/styles.css.
//
// Every colour-bearing declaration in the gallery's styles is re-emitted under
// .warp-shell[data-theme="light"] with neutrals mapped onto a warm light ramp:
// the darkest dark-mode colour becomes cream-beige and white becomes deep ink,
// keeping each colour's opacity so hierarchy carries over. Shadows stay warm,
// soft shadows; saturated colours (like the red Clear) are left unchanged.
//
// Re-run after changing colours in styles.css: npm run theme:light
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourcePath = `${root}app/styles.css`
const outputPath = `${root}app/light-theme.css`
const THEME = '[data-theme="light"]'

// Light ramp: index 0 (white in dark mode) -> ink, 1 (black) -> cream-beige.
const INK = [33, 26, 16]
const CREAM = [247, 240, 225]
const SHADOW = [110, 78, 34]
const PAPER = [255, 252, 245]
const COLOR_PROPS =
  /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|fill|stroke|caret-color|text-decoration-color|--[\w-]+)$/

const mix = (t) => INK.map((ink, i) => Math.round(ink + (CREAM[i] - ink) * t))
const fmt = ([r, g, b], alpha) =>
  alpha === undefined || alpha === 1
    ? `rgb(${r} ${g} ${b})`
    : `rgb(${r} ${g} ${b} / ${+alpha.toFixed(3)})`

const parseHex = (hex) => {
  const h = hex.slice(1)
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16))
}

// The dock's pills are already light-on-dark in dark mode, so they keep their
// lightness and only pick up the warm tint instead of being inverted.
const KEEP_LIGHTNESS =
  /warp-(mode-toggle|main-nav|filter-button|filter-actions|filter-count|sort-button|info-button|title-card|shuffle-button|grid-icon|list-icon)/

// Map one colour; `shadow` keeps darkness for shadows instead of inverting,
// and `keep` tints without inverting.
const mapColor = ([r, g, b], alpha, shadow, keep) => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const saturation = max === 0 ? 0 : (max - min) / max
  if (saturation > 0.25) return fmt([r, g, b], alpha) // accents stay
  const lightness = (r + g + b) / 3 / 255
  if (shadow && lightness < 0.5) return fmt(SHADOW, (alpha ?? 1) * 0.42)
  if (keep) return lightness > 0.98 ? fmt(PAPER, alpha) : fmt(mix(lightness), alpha)
  return fmt(mix(1 - lightness), alpha)
}

const mapValue = (value, shadow, keep) =>
  value
    .replace(
      /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)/g,
      (_, r, g, b, a) => {
        const alpha =
          a === undefined
            ? undefined
            : a.endsWith('%')
              ? Number.parseFloat(a) / 100
              : Number.parseFloat(a)
        return mapColor([+r, +g, +b], alpha, shadow, keep)
      },
    )
    .replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi, (hex) =>
      mapColor(parseHex(hex), undefined, shadow, keep),
    )
    .replace(/\bwhite\b/g, keep ? fmt(PAPER) : fmt(INK))
    .replace(/\bblack\b/g, keep ? fmt(INK) : fmt(CREAM))

const hasColor = (value) => /rgba?\(|#[0-9a-f]{3,6}\b|\bwhite\b|\bblack\b/i.test(value)

// Put the theme attribute on the shell itself when a selector starts there,
// otherwise scope the selector under the themed shell.
const themeSelector = (selector) => {
  const s = selector.trim()
  const shell = s.match(/^(\.warp-shell|\.phantom-test-shell)/)
  // A selector that already chooses a theme must not be nested under a
  // second, contradictory [data-theme="light"] condition.
  if (shell && /\[data-theme\s*=/.test(s)) return s
  if (shell) return `${shell[1]}${THEME}${s.slice(shell[1].length)}`
  return `.warp-shell${THEME} ${s}`
}

// Comments are dropped first so their text never leaks into a selector.
const css = (await readFile(sourcePath, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
const out = []
let i = 0
const stack = [] // open at-rules we are inside
const pendingAt = [] // at-rule headers not yet emitted for the current block

const blockEnd = (open) => {
  let depth = 0
  for (let j = open; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1
    else if (css[j] === '}') {
      depth -= 1
      if (depth === 0) return j
    }
  }
  return css.length - 1
}

const walk = (start, end, atContext) => {
  let pos = start
  while (pos < end) {
    const open = css.indexOf('{', pos)
    if (open < 0 || open >= end) return
    const boundary = Math.max(
      css.lastIndexOf('}', open - 1),
      css.lastIndexOf(';', open - 1),
      css.lastIndexOf('{', open - 1),
    )
    const prelude = css.slice(Math.max(boundary + 1, pos), open).trim()
    const close = blockEnd(open)
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|layer)/.test(prelude) && !/^@layer [\w-]+;/.test(prelude)) {
        const context = prelude.startsWith('@layer') ? atContext : [...atContext, prelude]
        walk(open + 1, close, context)
      }
      // Keyframes and other at-rules are left to the base stylesheet.
      pos = close + 1
      continue
    }
    const body = css.slice(open + 1, close)
    const selectors = prelude.split(',').map((part) => part.trim())
    const relevant = selectors.filter(
      (sel) => /warp|phantom/.test(sel) && !/\[data-theme\s*=\s*["']dark["']\s*\]/.test(sel),
    )
    for (const keep of [false, true]) {
      const group = relevant.filter((sel) => KEEP_LIGHTNESS.test(sel) === keep)
      const declarations = []
      for (const match of body.matchAll(/(^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) {
        const prop = match[2]
        const value = match[3].trim()
        if (!COLOR_PROPS.test(prop) || !hasColor(value)) continue
        const mapped = mapValue(value, prop === 'box-shadow', keep).replace(/\s+/g, ' ').trim()
        declarations.push(`${prop}: ${mapped};`)
      }
      if (!declarations.length || !group.length) continue
      out.push({
        context: atContext,
        rule: `${group.map(themeSelector).join(',\n')} {\n${declarations
          .map((d) => `  ${d}`)
          .join('\n')}\n}`,
      })
    }
    pos = close + 1
  }
}

walk(0, css.length, [])

// Hand-tuned surfaces: the warm beige stage with a faint gold edge.
const stage = `
/* Stage: tan beige with a cream centre glow and a faint gold edge. */
.warp-shell${THEME},
.phantom-test-shell${THEME} {
  /* Dock pills: warm tan glass, a shade deeper than the stage. */
  --warp-pill-bg: rgb(234 222 196 / 0.88);
  color-scheme: light;
}

.warp-shell${THEME} .warp-wall,
.warp-shell${THEME} .warp-infinite-menu {
  background:
    radial-gradient(circle at 50% 46%, rgb(253 248 236) 0%, rgb(244 235 216) 42%, rgb(230 214 182) 100%);
}

.warp-shell${THEME}::before {
  background:
    radial-gradient(ellipse at center, transparent 46%, rgb(214 186 128 / 0.22) 76%, rgb(196 160 96 / 0.42) 100%),
    linear-gradient(to bottom, rgb(255 250 238 / 0.2), transparent 18%, transparent 80%, rgb(214 186 128 / 0.25));
}

.warp-shell${THEME} .warp-infinite-sheen {
  background:
    radial-gradient(ellipse at center, transparent 30%, rgb(240 228 204 / 0.25) 66%, rgb(232 216 184) 100%),
    linear-gradient(to right, rgb(232 216 184), transparent 14%, transparent 86%, rgb(232 216 184) 100%),
    linear-gradient(to bottom, rgb(244 235 216 / 0.4), transparent 22%, transparent 74%, rgb(236 222 192 / 0.6));
}

.warp-shell${THEME} .warp-mark svg {
  fill: rgb(247 240 225);
}

.warp-shell${THEME} .warp-details-backdrop {
  /* Keep the gallery visible beneath the blur instead of washing it out. */
  background: rgb(17 31 52 / 0.42);
}

/* Shuffle Pro deliberately keeps its night-sky treatment in light mode. */
.warp-shell${THEME}[data-shuffle-pro-phase="transition"] .warp-wall,
.warp-shell${THEME}[data-shuffle-pro-phase="transition"] .warp-infinite-menu {
  background:
    radial-gradient(ellipse at 50% 54%, rgb(28 91 165 / 0.36), transparent 62%),
    linear-gradient(155deg, #041127, #0b2450 54%, #030d20);
}

.warp-shell${THEME}[data-shuffle-pro-phase="transition"] .warp-wall::after {
  content: '';
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
  opacity: 1;
  background:
    radial-gradient(2px 2px at 12% 24%, rgb(220 240 255 / 0.98) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 73% 17%, rgb(220 240 255 / 0.9) 50%, transparent 100%),
    radial-gradient(2px 2px at 88% 63%, rgb(220 240 255 / 0.95) 50%, transparent 100%),
    radial-gradient(1.5px 1.5px at 37% 79%, rgb(220 240 255 / 0.86) 50%, transparent 100%),
    radial-gradient(1px 1px at 59% 36%, rgb(220 240 255 / 0.82) 50%, transparent 100%),
    radial-gradient(ellipse at 50% 55%, rgb(8 37 79 / 0.22), transparent 70%),
    linear-gradient(155deg, rgb(4 15 34 / 0.42), rgb(6 24 49 / 0.28) 58%, rgb(3 13 29 / 0.42));
  background-size: auto, auto, auto, auto, auto, auto, 100% 100%;
  animation: shuffle-pro-overlay-stars 3.6s ease-in-out infinite alternate;
}

.warp-shell${THEME}[data-shuffle-pro-variant="rare"][data-shuffle-pro-phase="transition"] .warp-wall,
.warp-shell${THEME}[data-shuffle-pro-variant="rare"][data-shuffle-pro-phase="transition"] .warp-infinite-menu {
  background:
    radial-gradient(ellipse 5px 11px at 31% 28%, rgb(230 207 255 / 0.17) 45%, transparent 100%),
    radial-gradient(ellipse 5px 11px at 69% 73%, rgb(230 207 255 / 0.14) 45%, transparent 100%),
    radial-gradient(ellipse at 24% 36%, rgb(198 158 255 / 0.16), transparent 34%),
    radial-gradient(ellipse at 77% 65%, rgb(231 183 255 / 0.12), transparent 38%),
    radial-gradient(1px 1px at 67% 43%, rgb(243 224 255 / 0.56) 50%, transparent 100%),
    radial-gradient(1px 1px at 18% 22%, rgb(243 224 255 / 0.72) 50%, transparent 100%),
    radial-gradient(1px 1px at 81% 31%, rgb(243 224 255 / 0.62) 50%, transparent 100%),
    linear-gradient(145deg, #171126, #251939 62%, #171126);
}

.warp-shell${THEME}[data-shuffle-pro-variant="max"][data-shuffle-pro-phase="transition"] .warp-wall,
.warp-shell${THEME}[data-shuffle-pro-variant="max"][data-shuffle-pro-phase="transition"] .warp-infinite-menu {
  background:
    radial-gradient(ellipse at 50% 38%, rgb(72 202 151 / 0.22), transparent 38%),
    radial-gradient(ellipse at 50% 74%, rgb(59 173 133 / 0.15), transparent 58%),
    radial-gradient(1px 1px at 18% 24%, rgb(222 255 240 / 0.78) 50%, transparent 100%),
    radial-gradient(1px 1px at 74% 43%, rgb(222 255 240 / 0.7) 50%, transparent 100%),
    linear-gradient(150deg, #071d18, #10382b 58%, #071d18);
}

.warp-shell${THEME} .warp-shuffle-pro-announcement {
  border-color: rgb(164 198 238 / 0.42);
  background: rgb(8 27 54 / 0.86);
  color: #eaf5ff;
}

.warp-shell${THEME}[data-shuffle-pro-phase="transition"] .warp-shuffle-pro-announcement {
  color: #eaf5ff;
}

.warp-shell${THEME} .warp-shuffle-pro-announcement[data-premium-variant="rare"],
.warp-shell${THEME}[data-shuffle-pro-variant="rare"] .warp-shuffle-pro-announcement {
  border-color: rgb(220 191 255 / 0.42);
  background: rgb(35 23 52 / 0.84);
  color: #f3eaff;
}

.warp-shell${THEME}[data-shuffle-pro-variant="max"] .warp-shuffle-pro-announcement {
  border-color: rgb(174 244 220 / 0.48);
  background: rgb(9 42 31 / 0.88);
  color: #e8fff5;
}

.warp-shell${THEME} .warp-details-card.is-premium {
  border-color: rgb(135 196 255 / 0.68);
  box-shadow: 0 0 0 1px rgb(135 196 255 / 0.2), 0 24px 90px rgb(22 95 164 / 0.24), 0 40px 140px rgb(0 0 0 / 0.72);
}

.warp-shell${THEME} .warp-details-card.is-premium[data-premium-variant="rare"] {
  border-color: rgb(205 171 255 / 0.7);
  box-shadow: 0 0 0 1px rgb(205 171 255 / 0.2), 0 24px 90px rgb(134 91 176 / 0.22), 0 40px 140px rgb(0 0 0 / 0.72);
}

.warp-shell${THEME} .warp-details-card.is-premium[data-premium-variant="max"] {
  border-color: rgb(174 244 220 / 0.72);
  box-shadow: 0 0 0 1px rgb(174 244 220 / 0.22), 0 24px 90px rgb(22 140 104 / 0.25), 0 40px 140px rgb(0 0 0 / 0.72);
}

.warp-shell${THEME} .warp-details-premium-badge {
  border-color: rgb(156 205 255 / 0.42);
  background: rgb(35 74 112 / 0.34);
  color: #e5f3ff;
}

.warp-shell${THEME} .warp-details-premium-badge > span {
  color: #a9d8ff;
}

.warp-shell${THEME} .warp-details-card[data-premium-variant="rare"] .warp-details-premium-badge {
  border-color: rgb(217 190 255 / 0.42);
  background: rgb(92 63 121 / 0.3);
  color: #f2eaff;
}

.warp-shell${THEME} .warp-details-card[data-premium-variant="rare"] .warp-details-premium-badge > span {
  color: #dfc4ff;
}

.warp-shell${THEME} .warp-details-card[data-premium-variant="max"] .warp-details-premium-badge {
  border-color: rgb(174 244 220 / 0.5);
  background: rgb(36 113 87 / 0.36);
  color: #e8fff5;
}

.warp-shell${THEME} .warp-details-card[data-premium-variant="max"] .warp-details-premium-badge > span {
  color: #aef4dc;
}

/* Keep interactive controls distinct against the warm light surface. */
.warp-shell${THEME} .warp-mode-toggle button,
.warp-shell${THEME} .warp-main-nav button,
.warp-shell${THEME} .warp-filter-button,
.warp-shell${THEME} .warp-filter-clear,
.warp-shell${THEME} .warp-filters-clear,
.warp-shell${THEME} .warp-sort-button,
.warp-shell${THEME} .warp-shuffle-button,
.warp-shell${THEME} .warp-info-button,
.warp-shell${THEME} .warp-theme-switch button,
.warp-shell${THEME} .warp-details-next,
.warp-shell${THEME} .warp-details-watch,
.warp-shell${THEME} .warp-details-close,
.warp-shell${THEME} .warp-details-genres button,
.warp-shell${THEME} .warp-fullscreen-button,
.warp-shell${THEME} .warp-filter-panel button,
.warp-shell${THEME} .warp-fs-chip {
  border: 1px solid rgb(0 0 0 / 0.8);
}
`

const grouped = []
let current = null
for (const { context, rule } of out) {
  const key = context.join(' ')
  if (!current || current.key !== key) {
    current = { key, context, rules: [] }
    grouped.push(current)
  }
  current.rules.push(rule)
}

const body = grouped
  .map(({ context, rules }) => {
    const inner = rules.join('\n\n')
    return context.reduceRight(
      (acc, at) => `${at} {\n${acc.replace(/^/gm, '  ')}\n}`,
      inner,
    )
  })
  .join('\n\n')

await writeFile(
  outputPath,
  `/* Generated by scripts/generate-light-theme.mjs from styles.css. Do not edit
   by hand; change styles.css and run: npm run theme:light */\n\n${body}\n${stage}`.replace(
    /[ \t]+(?=\r?$)/gm,
    '',
  ),
)
console.log(`light theme: ${out.length} rules -> app/light-theme.css`)
