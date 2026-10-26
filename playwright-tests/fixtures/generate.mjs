// Regenerates the visual-test fixtures: the mock catalogue and the posters.
//
//   node playwright-tests/fixtures/generate.mjs
//
// Output is checked in, so CI never runs this. Re-run it only when the fixture
// design changes, and then update the visual baselines too.
//
// Posters are deliberately loud: a 6px border, four differently coloured
// corner markers, a number, a diagonal cross and tick marks along every edge,
// so a cropped, shifted, stretched, flipped or overlapped poster is obvious in
// a screenshot diff. The last poster is square, to exercise the engine's
// handling of images that are not 2:3.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const POSTERS = 24
const FILMS = 120
const SQUARE = POSTERS // index of the non-2:3 poster

const names = [
  'Northern Static',
  'The Quiet Orchard',
  'Paper Lanterns',
  'Low Tide Harmony',
  'A Map of Small Fires',
  'Glass Meridian',
  'Saffron Hours',
  'The Long Intermission',
  'Wolves of Marigold',
  'Copper Weather',
  'Midnight Cartographer',
  'Velvet Frequency',
  'The Last Greenhouse',
  'Echo Parade',
  'Salt and Satellite',
  'Harbour of Unsent Letters',
  'Fable for Machines',
  'Tin Roof Summer',
  'The Understudy Moon',
  'Winter Kitchen',
  'Orbit of Moths',
  'Rivers Called Sunday',
  'Cinder Valley',
  'The Borrowed Coast',
]
const genres = ['Drama', 'Comedy', 'Thriller', 'Animation', 'Documentary']
const countries = ['United States', 'France', 'Japan', 'Brazil']

const posterPath = (i) => `fx${String(i + 1).padStart(2, '0')}`

const drawPoster = async (page, index) =>
  page.evaluate(
    ({ index, square }) => {
      const w = 342
      const h = square ? 342 : 513
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const c = canvas.getContext('2d')
      const hue = (index * 47) % 360
      const g = c.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, `hsl(${hue} 70% 38%)`)
      g.addColorStop(1, `hsl(${(hue + 50) % 360} 75% 18%)`)
      c.fillStyle = g
      c.fillRect(0, 0, w, h)
      // Diagonal cross.
      c.strokeStyle = 'rgba(255,255,255,0.35)'
      c.lineWidth = 2
      c.beginPath()
      c.moveTo(0, 0)
      c.lineTo(w, h)
      c.moveTo(w, 0)
      c.lineTo(0, h)
      c.stroke()
      // Tick marks along every edge, every 20px.
      c.strokeStyle = 'rgba(255,255,255,0.8)'
      c.lineWidth = 2
      for (let x = 20; x < w; x += 20) {
        c.beginPath()
        c.moveTo(x, 6)
        c.lineTo(x, x % 100 === 0 ? 26 : 16)
        c.moveTo(x, h - 6)
        c.lineTo(x, h - (x % 100 === 0 ? 26 : 16))
        c.stroke()
      }
      for (let y = 20; y < h; y += 20) {
        c.beginPath()
        c.moveTo(6, y)
        c.lineTo(y % 100 === 0 ? 26 : 16, y)
        c.moveTo(w - 6, y)
        c.lineTo(w - (y % 100 === 0 ? 26 : 16), y)
        c.stroke()
      }
      // Border: white outer, black inner.
      c.strokeStyle = '#fff'
      c.lineWidth = 6
      c.strokeRect(3, 3, w - 6, h - 6)
      c.strokeStyle = '#000'
      c.lineWidth = 3
      c.strokeRect(7.5, 7.5, w - 15, h - 15)
      // Corner markers: red, green, blue, yellow (TL, TR, BL, BR).
      const m = 44
      const corner = (x, y, colour) => {
        c.fillStyle = colour
        c.fillRect(x, y, m, m)
      }
      corner(10, 10, '#ff2a2a')
      corner(w - 10 - m, 10, '#2aff4d')
      corner(10, h - 10 - m, '#2a6bff')
      corner(w - 10 - m, h - 10 - m, '#ffe62a')
      // The number.
      c.fillStyle = '#fff'
      c.strokeStyle = '#000'
      c.lineWidth = 8
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.font = '700 150px Arial, Helvetica, sans-serif'
      const label = String(index + 1)
      c.strokeText(label, w / 2, h / 2)
      c.fillText(label, w / 2, h / 2)
      c.font = '700 22px Arial, Helvetica, sans-serif'
      c.lineWidth = 5
      const caption = square ? 'SQUARE 1:1' : '2:3 FIXTURE'
      c.strokeText(caption, w / 2, h - 70)
      c.fillText(caption, w / 2, h - 70)
      return canvas.toDataURL('image/jpeg', 0.88)
    },
    { index, square: index === SQUARE },
  )

const writePosters = async () => {
  const dir = join(here, 'posters')
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || undefined,
  })
  const page = await browser.newPage()
  for (let i = 0; i <= POSTERS; i++) {
    if (i > POSTERS) break
    const data = await drawPoster(page, i)
    writeFileSync(
      join(dir, `${posterPath(i)}.jpg`),
      Buffer.from(data.split(',')[1], 'base64'),
    )
  }
  await browser.close()
}

// Same seeded generator everywhere, so the catalogue never changes by accident.
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const writeCatalog = () => {
  const dir = join(here, 'catalog')
  mkdirSync(dir, { recursive: true })
  const random = mulberry32(257)
  const rows = []
  const texts = []
  for (let i = 0; i < FILMS; i++) {
    const poster = posterPath(i % (POSTERS + 1))
    const title =
      i < names.length ? names[i] : `${names[i % names.length]} ${i + 1}`
    const hue = ((i % (POSTERS + 1)) * 47) % 360
    rows.push([
      900000 + i,
      title,
      1990 + (i % 35),
      55 + Math.floor(random() * 40),
      [i % genres.length, (i + 2) % genres.length],
      i % countries.length,
      poster,
      '',
      // Average colour as hex, close to the poster's gradient.
      hslToHex(hue, 60, 28),
      200000 - i * 1500,
      Math.round((900 - i * 5) * 10) / 10,
      85 + (i % 60),
    ])
    texts.push([
      `Fixture film ${i + 1}. A deliberately plain overview, long enough to wrap onto a second line in the details card so the layout is exercised.`,
      `Tagline ${i + 1}`,
      `tt${String(9000000 + i)}`,
    ])
  }
  const manifest = {
    version: 3,
    count: FILMS,
    chunks: ['c0-fixture.json'],
    texts: ['t0-fixture.json'],
    chunkSize: 2000,
    textChunkSize: 2000,
    generatedAt: '2026-01-01T00:00:00.000Z',
    countries,
    genres,
  }
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
  writeFileSync(join(dir, 'c0-fixture.json'), `${JSON.stringify(rows)}\n`)
  writeFileSync(join(dir, 't0-fixture.json'), `${JSON.stringify(texts)}\n`)
}

function hslToHex(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const hex = (v) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  return `${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

writeCatalog()
await writePosters()
console.log('fixtures written')
