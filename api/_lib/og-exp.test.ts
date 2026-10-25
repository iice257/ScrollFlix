// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs'
import { ImageResponse } from '@vercel/og'
import { it } from 'vitest'
import { filmCard, scaled } from './og-cards.js'
import { interFonts } from './og-fonts.js'
import { MARK_DATA_URI } from './og-mark.js'

const S =
  'C:/Users/0/AppData/Local/Temp/claude/C--Users-0-Documents-Projects-Github-ScrollFlix/a067aaa1-674b-4148-976a-5ffe823184b9/scratchpad'
const poster = `data:image/jpeg;base64,${readFileSync(`${S}/p603.jpg`).toString('base64')}`
const film = {
  title: 'The Matrix',
  year: '1999',
  rating: 8.2,
  posterPath: null,
  overview:
    'Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.',
}
it('sizes', async () => {
  for (const k of [1, 0.75, 0.667, 0.5]) {
    const w = Math.round(1200 * k)
    const hgt = Math.round(630 * k)
    const res = new ImageResponse(
      scaled(filmCard(film, poster, MARK_DATA_URI), k) as never,
      { width: w, height: hgt, fonts: interFonts() },
    )
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(`${S}/exp-${k}.png`, buf)
    console.log('scale', k, buf.length)
  }
}, 60000)
