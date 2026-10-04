// Builds a single tiny sprite of every local poster, used as a pixelated
// placeholder that loads almost instantly while the full thumbnails stream in.
// Re-run after the poster library changes: npm run media:sprite
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const CELL_WIDTH = 8
const CELL_HEIGHT = 12

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const posterDirectory = join(projectRoot, 'public', 'media', 'posters')
const spritePath = join(projectRoot, 'public', 'media', 'poster-sprite.jpg')
const manifestPath = join(projectRoot, 'public', 'media', 'poster-sprite.json')

const { ids } = JSON.parse(
  await readFile(join(posterDirectory, 'availability.json'), 'utf8'),
)
const columns = Math.ceil(Math.sqrt(ids.length * (CELL_HEIGHT / CELL_WIDTH)))
const rows = Math.ceil(ids.length / columns)

const cells = await Promise.all(
  ids.map(async (id, index) => ({
    input: await sharp(join(posterDirectory, `${id}.jpg`))
      .resize(CELL_WIDTH, CELL_HEIGHT, { fit: 'fill' })
      .toBuffer(),
    left: (index % columns) * CELL_WIDTH,
    top: Math.floor(index / columns) * CELL_HEIGHT,
  })),
)

await sharp({
  create: {
    width: columns * CELL_WIDTH,
    height: rows * CELL_HEIGHT,
    channels: 3,
    background: '#0a0a0a',
  },
})
  .composite(cells)
  .jpeg({ quality: 72, mozjpeg: true })
  .toFile(spritePath)

await writeFile(
  manifestPath,
  `${JSON.stringify({ cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT, columns, ids })}\n`,
)

const { size } = await import('node:fs').then((fs) => fs.statSync(spritePath))
console.log(
  `Poster sprite: ${ids.length} posters, ${columns}x${rows} cells, ${(size / 1024).toFixed(1)} KB`,
)
