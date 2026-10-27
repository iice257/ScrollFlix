import { describe, expect, it, vi } from 'vitest'
import type { DecodeDeps } from './poster-decode'
import { createPosterLoader } from './poster-loader'

const bitmap = (name: string) => ({ name, close: vi.fn() }) as never

const okResponse = (url: string) =>
  ({ ok: true, status: 200, blob: async () => ({ url }) }) as never
const missing = () => ({ ok: false, status: 404 }) as never

const makeDeps = (overrides: Partial<DecodeDeps> = {}): DecodeDeps => ({
  fetch: vi.fn(async (url: string) => okResponse(url)),
  createImageBitmap: vi.fn(async (blob: Blob) =>
    bitmap((blob as unknown as { url: string }).url),
  ),
  loadImage: vi.fn(async (url: string) => ({ url }) as never),
  renderCell: vi.fn((source) => source as never),
  ...overrides,
})

const nameOf = (image: unknown) => image as { name?: string; url?: string }

describe('poster loader', () => {
  it('falls back one size on 404', async () => {
    const deps = makeDeps({
      fetch: vi.fn(async (url: string) =>
        url.includes('/w342/') ? missing() : okResponse(url),
      ),
    })
    const loader = createPosterLoader({ useWorker: false, deps })
    const image = await loader.request(
      'a',
      ['https://x/w342/a.jpg', 'https://x/w185/a.jpg', 'https://x/w154/a.jpg'],
      0,
    )
    expect(nameOf(image).name).toBe('https://x/w185/a.jpg')
    expect(deps.fetch).toHaveBeenCalledTimes(2)
    loader.dispose()
  })

  it('rejects only when every url failed', async () => {
    const deps = makeDeps({ fetch: vi.fn(async () => missing()) })
    const loader = createPosterLoader({ useWorker: false, deps })
    await expect(
      loader.request('a', ['https://x/w342/a.jpg', 'https://x/w185/a.jpg'], 0),
    ).rejects.toThrow()
    expect(deps.fetch).toHaveBeenCalledTimes(2)
    loader.dispose()
  })

  it('cancel drops a queued request', async () => {
    const release: Array<() => void> = []
    const deps = makeDeps({
      fetch: vi.fn(
        (url: string) =>
          new Promise<Response>((resolve) =>
            release.push(() => resolve(okResponse(url))),
          ),
      ),
    })
    const loader = createPosterLoader({
      useWorker: false,
      deps,
      concurrency: 1,
    })
    const first = loader.request('first', ['https://x/1.jpg'], 0)
    const queued = loader.request('queued', ['https://x/2.jpg'], 1)
    const queuedResult = queued.catch((error) => error as Error)
    loader.cancel('queued')
    expect(((await queuedResult) as Error).name).toBe('AbortError')
    release[0]()
    await first
    expect(deps.fetch).toHaveBeenCalledTimes(1)
    loader.dispose()
  })

  it('never exceeds concurrency and loads the lowest priority first', async () => {
    let inFlight = 0
    let peak = 0
    const order: string[] = []
    const deps = makeDeps({
      fetch: vi.fn(async (url: string) => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        order.push(url)
        await new Promise((resolve) => setTimeout(resolve, 2))
        inFlight -= 1
        return okResponse(url)
      }),
    })
    const loader = createPosterLoader({
      useWorker: false,
      deps,
      concurrency: 2,
    })
    const all = Array.from({ length: 8 }, (_, at) =>
      loader.request(`k${at}`, [`https://x/${at}.jpg`], 10 - at),
    )
    await Promise.all(all)
    expect(peak).toBeLessThanOrEqual(2)
    // The first two start at once; the rest follow in priority order.
    expect(order.slice(2)).toEqual([
      'https://x/7.jpg',
      'https://x/6.jpg',
      'https://x/5.jpg',
      'https://x/4.jpg',
      'https://x/3.jpg',
      'https://x/2.jpg',
    ])
    loader.dispose()
  })

  it('reprioritise moves a waiting request up', async () => {
    const order: string[] = []
    const deps = makeDeps({
      fetch: vi.fn(async (url: string) => {
        order.push(url)
        await new Promise((resolve) => setTimeout(resolve, 2))
        return okResponse(url)
      }),
    })
    const loader = createPosterLoader({
      useWorker: false,
      deps,
      concurrency: 1,
    })
    const all = [
      loader.request('a', ['https://x/a.jpg'], 0),
      loader.request('b', ['https://x/b.jpg'], 1),
      loader.request('c', ['https://x/c.jpg'], 2),
    ]
    loader.reprioritise('c', 0.5)
    await Promise.all(all)
    expect(order).toEqual([
      'https://x/a.jpg',
      'https://x/c.jpg',
      'https://x/b.jpg',
    ])
    loader.dispose()
  })

  it('falls back to main-thread decode', async () => {
    const deps = makeDeps({ createImageBitmap: undefined })
    const loader = createPosterLoader({ useWorker: false, deps })
    const image = await loader.request('a', ['https://x/a.jpg'], 0)
    expect(nameOf(image).url).toBe('https://x/a.jpg')
    expect(deps.fetch).not.toHaveBeenCalled()
    expect(deps.loadImage).toHaveBeenCalledTimes(1)
    loader.dispose()
  })

  it('resizes into a cell and closes the source bitmap', async () => {
    const source = bitmap('src')
    const rendered = bitmap('cell')
    const deps = makeDeps({
      createImageBitmap: vi.fn(async () => source),
      renderCell: vi.fn(() => rendered),
    })
    const loader = createPosterLoader({ useWorker: false, deps })
    const image = await loader.request('a', ['https://x/a.jpg'], 0, {
      width: 64,
      height: 96,
      gutter: 2,
    })
    expect(image).toBe(rendered)
    expect(
      (source as unknown as { close: () => void }).close,
    ).toHaveBeenCalled()
    loader.dispose()
  })

  it('draws one download into several cells', async () => {
    const source = bitmap('src')
    const deps = makeDeps({
      createImageBitmap: vi.fn(async () => source),
      renderCell: vi.fn((_, cell) => bitmap(`cell-${cell.width}`)),
    })
    const loader = createPosterLoader({ useWorker: false, deps })
    const images = await loader.requestCells('a', ['https://x/a.jpg'], 0, [
      { width: 64, height: 96, gutter: 2 },
      { width: 154, height: 231, gutter: 0 },
    ])
    expect(images.map((image) => nameOf(image).name)).toEqual([
      'cell-64',
      'cell-154',
    ])
    expect(deps.fetch).toHaveBeenCalledTimes(1)
    expect(
      (source as unknown as { close: () => void }).close,
    ).toHaveBeenCalled()
    loader.dispose()
  })
})
