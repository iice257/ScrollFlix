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

// Draws a poster into a cell canvas: the poster in the middle, its edge
// pixels stretched across the gutter. Works on OffscreenCanvas (the worker)
// and on a plain canvas (the main-thread fallback).
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
  context.drawImage(source, g, g, width, height)
  if (g > 0) {
    const { w, h } = sourceSize(source)
    // Edges, then corners, each from a single source pixel row or column.
    context.drawImage(source, 0, 0, 1, h, 0, g, g, height)
    context.drawImage(source, w - 1, 0, 1, h, g + width, g, g, height)
    context.drawImage(source, 0, 0, w, 1, g, 0, width, g)
    context.drawImage(source, 0, h - 1, w, 1, g, g + height, width, g)
    context.drawImage(source, 0, 0, 1, 1, 0, 0, g, g)
    context.drawImage(source, w - 1, 0, 1, 1, g + width, 0, g, g)
    context.drawImage(source, 0, h - 1, 1, 1, 0, g + height, g, g)
    context.drawImage(source, w - 1, h - 1, 1, 1, g + width, g + height, g, g)
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
    try {
      return await decodeOne(url, cell, deps, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
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
