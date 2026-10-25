// Fetching and decoding one poster, shared by the worker and the main-thread
// fallback. The result is ready for texSubImage2D/3D: when a cell is asked
// for, it is already resized to the cell (with an edge-extended gutter).

export type PosterImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement

// A texture cell: the poster is resized to width x height, then `gutter`
// pixels of its edge colour are added on every side (stops mip and filter
// bleed between neighbouring atlas cells).
export type CellSpec = { width: number; height: number; gutter: number }

type DrawSource = ImageBitmap | HTMLImageElement

export type DecodeDeps = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  // Undefined on browsers without it; the Image path is used instead.
  createImageBitmap?: (
    blob: Blob,
    options?: ImageBitmapOptions,
  ) => Promise<ImageBitmap>
  loadImage: (url: string, signal?: AbortSignal) => Promise<HTMLImageElement>
  renderCell: (source: DrawSource, cell: CellSpec) => PosterImage
}

const sourceSize = (source: DrawSource) =>
  'naturalWidth' in source
    ? { w: source.naturalWidth, h: source.naturalHeight }
    : { w: source.width, h: source.height }

// Where a source of srcW x srcH is drawn inside a width x height cell: scaled
// to fit (never cropped), centred. Sources within 2% of the cell's ratio fill
// it, so ordinary 2:3 posters are untouched and no sliver bar appears.
export const letterboxRect = (
  srcW: number,
  srcH: number,
  width: number,
  height: number,
) => {
  const full = { x: 0, y: 0, w: width, h: height }
  if (srcW <= 0 || srcH <= 0) return full
  const srcRatio = srcW / srcH
  const cellRatio = width / height
  if (Math.abs(srcRatio / cellRatio - 1) < 0.02) return full
  if (srcRatio > cellRatio) {
    const h = width / srcRatio
    return { x: 0, y: (height - h) / 2, w: width, h }
  }
  const w = height * srcRatio
  return { x: (width - w) / 2, y: 0, w, h: height }
}

// The slot colour the shader shows for an empty cell, so bars read as slot.
const BAR_COLOUR = '#050505'

// Draws a poster into a cell canvas: the poster in the middle (letterboxed if
// it is not 2:3), its edge pixels stretched across the gutter. Works on
// OffscreenCanvas (the worker) and on a plain canvas (the main-thread
// fallback).
export const renderCell = (source: DrawSource, cell: CellSpec): PosterImage => {
  const { width, height, gutter: g } = cell
  const totalW = width + g * 2
  const totalH = height + g * 2
  const offscreen = typeof OffscreenCanvas !== 'undefined'
  const canvas = offscreen
    ? new OffscreenCanvas(totalW, totalH)
    : Object.assign(document.createElement('canvas'), {
        width: totalW,
        height: totalH,
      })
  const context = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!context) throw new Error('no 2d context')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  const { w, h } = sourceSize(source)
  const box = letterboxRect(w, h, width, height)
  const letterboxed = box.w < width || box.h < height
  if (letterboxed) {
    context.fillStyle = BAR_COLOUR
    context.fillRect(0, 0, totalW, totalH)
  }
  context.drawImage(source, g + box.x, g + box.y, box.w, box.h)
  if (g > 0) {
    // Edges, then corners, each from a single source pixel row or column,
    // only on the sides where the poster reaches the cell edge.
    const left = box.x === 0
    const top = box.y === 0
    if (left) {
      context.drawImage(source, 0, 0, 1, h, 0, g + box.y, g, box.h)
      context.drawImage(source, w - 1, 0, 1, h, g + width, g + box.y, g, box.h)
    }
    if (top) {
      context.drawImage(source, 0, 0, w, 1, g + box.x, 0, box.w, g)
      context.drawImage(source, 0, h - 1, w, 1, g + box.x, g + height, box.w, g)
    }
    if (left && top) {
      context.drawImage(source, 0, 0, 1, 1, 0, 0, g, g)
      context.drawImage(source, w - 1, 0, 1, 1, g + width, 0, g, g)
      context.drawImage(source, 0, h - 1, 1, 1, 0, g + height, g, g)
      context.drawImage(source, w - 1, h - 1, 1, 1, g + width, g + height, g, g)
    }
  }
  if (offscreen && 'transferToImageBitmap' in canvas)
    return (canvas as OffscreenCanvas).transferToImageBitmap()
  return canvas as HTMLCanvasElement
}

export const loadImageElement = (url: string, signal?: AbortSignal) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    const abort = () => {
      image.src = ''
      reject(new DOMException('cancelled', 'AbortError'))
    }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    image.onload = () => {
      signal?.removeEventListener('abort', abort)
      const decode =
        typeof image.decode === 'function' ? image.decode() : Promise.resolve()
      decode.then(
        () => resolve(image),
        () => resolve(image),
      )
    }
    image.onerror = () => {
      signal?.removeEventListener('abort', abort)
      reject(new Error(`image failed: ${url}`))
    }
    image.src = url
  })

export const realDeps = (): DecodeDeps => ({
  fetch: (url, init) => fetch(url, init),
  createImageBitmap:
    typeof createImageBitmap === 'function'
      ? (blob, options) => createImageBitmap(blob, options)
      : undefined,
  loadImage: loadImageElement,
  renderCell,
})

const decodeOne = async (
  url: string,
  cell: CellSpec | null,
  deps: DecodeDeps,
  signal?: AbortSignal,
): Promise<PosterImage> => {
  let source: DrawSource
  if (deps.createImageBitmap) {
    const response = await deps.fetch(url, { mode: 'cors', signal })
    if (!response.ok) throw new Error(`poster ${response.status}: ${url}`)
    const blob = await response.blob()
    source = await deps.createImageBitmap(blob, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    })
  } else {
    source = await deps.loadImage(url, signal)
  }
  if (!cell) return source
  try {
    return deps.renderCell(source, cell)
  } finally {
    if ('close' in source) source.close()
  }
}

const URL_TIMEOUT_MS = 20000

// Tries the urls in order (best first); rejects only when every one fails.
export const decodeFirst = async (
  urls: readonly string[],
  cell: CellSpec | null,
  deps: DecodeDeps,
  signal?: AbortSignal,
): Promise<PosterImage> => {
  let lastError: unknown = new Error('no poster urls')
  for (const url of urls) {
    if (signal?.aborted) throw new DOMException('cancelled', 'AbortError')
    // One url gets this long before the next size is tried.
    const attempt = new AbortController()
    const forward = () => attempt.abort()
    signal?.addEventListener('abort', forward, { once: true })
    const timer = setTimeout(forward, URL_TIMEOUT_MS)
    try {
      return await decodeOne(url, cell, deps, attempt.signal)
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forward)
    }
  }
  throw lastError
}

export type WorkerIn =
  | { t: 'load'; key: string; urls: string[]; cell: CellSpec | null }
  | { t: 'cancel'; key: string }
export type WorkerOut =
  | { t: 'ok'; key: string; bitmap: ImageBitmap }
  | { t: 'fail'; key: string }
