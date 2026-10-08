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

/* Keep instructional tooltips on the same neutral charcoal surface in both themes. */
.warp-shell${THEME} .warp-details-tip {
  border-color: rgb(255 255 255 / 0.14);
  background: rgb(28 28 28 / 0.98);
  color: #fff;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
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
.warp-shell${THEME} .warp-saved-button,
.warp-shell${THEME} .warp-details-heart,
.warp-shell${THEME} .warp-theme-switch button,
.warp-shell${THEME} .warp-details-next,
.warp-shell${THEME} .warp-details-watch,
.warp-shell${THEME} .warp-details-close,
.warp-shell${THEME} .warp-details-genres button,
.warp-shell${THEME} .warp-immersive-corner,
.warp-shell${THEME} .warp-immersive-exit,
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
