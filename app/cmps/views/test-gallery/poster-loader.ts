import {
  type CellSpec,
  type DecodeDeps,
  type PosterImage,
  type WorkerOut,
  decodeFirstCells,
  realDeps,
} from './poster-decode'
import { createPriorityQueue } from './priority-queue'

export type { CellSpec, PosterImage } from './poster-decode'

export type PosterLoaderOptions = {
  // How many images are in flight at once. Default 12.
  concurrency?: number
  // False forces the main-thread path (tests, and browsers without workers).
  useWorker?: boolean
  // Replaces fetch/createImageBitmap/Image, for tests.
  deps?: DecodeDeps
}

export type PosterLoader = {
  // `urls` are best first; later ones are fallbacks (a 404 on one size tries
  // the next). Lower priority numbers load first. The promise rejects when
  // every url failed, or with an AbortError when cancelled.
  request(
    key: string,
    urls: readonly string[],
    priority: number,
    cell?: CellSpec,
  ): Promise<PosterImage>
  // One download drawn into several cells (in the order given), so a poster
  // can fill its atlas cell and a sharper layer from a single request.
  requestCells(
    key: string,
    urls: readonly string[],
    priority: number,
    cells: readonly CellSpec[],
  ): Promise<PosterImage[]>
  reprioritise(key: string, priority: number): void
  // How many may run at once from now on; running ones are never stopped.
  setConcurrency(concurrency: number): void
  cancel(key: string): void
  // Number of requests queued or in flight.
  readonly pending: number
  dispose(): void
}

type Job = {
  urls: readonly string[]
  cells: CellSpec[] | null
  resolve: (images: PosterImage[]) => void
  reject: (error: unknown) => void
  promise: Promise<PosterImage[]>
  abort: AbortController | null
  running: boolean
  // The id the worker knows this run by, so a late reply to a cancelled run
  // can never settle a newer request for the same key.
  runId: string | null
}

const cancelled = () => new DOMException('cancelled', 'AbortError')

const canUseWorker = () =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap === 'function'

export const createPosterLoader = (
  options: PosterLoaderOptions = {},
): PosterLoader => {
  let concurrency = options.concurrency ?? 12
  const deps = options.deps ?? realDeps()
  const jobs = new Map<string, Job>()
  const queue = createPriorityQueue<string>()
  let active = 0
  let disposed = false
  let worker: Worker | null = null
  let runCounter = 0
  const keyOfRun = new Map<string, string>()

  if ((options.useWorker ?? true) && !options.deps && canUseWorker()) {
    try {
      worker = new Worker(
        new URL('./poster-loader.worker.ts', import.meta.url),
        { type: 'module' },
      )
    } catch {
      worker = null
    }
  }

  const settle = (key: string, job: Job) => {
    if (jobs.get(key) === job) jobs.delete(key)
    if (job.running) active -= 1
    job.running = false
  }

  const closeAll = (images: PosterImage[]) => {
    for (const image of images) if ('close' in image) image.close()
  }

  const finish = (key: string, images: PosterImage[] | null) => {
    const job = jobs.get(key)
    if (!job) {
      if (images) closeAll(images)
      return
    }
    settle(key, job)
    if (images) job.resolve(images)
    else job.reject(new Error(`poster failed: ${key}`))
    pump()
  }

  worker?.addEventListener('message', (event: MessageEvent<WorkerOut>) => {
    const message = event.data
    const key = keyOfRun.get(message.key)
    keyOfRun.delete(message.key)
    if (key === undefined) {
      if (message.t === 'ok') closeAll(message.bitmaps)
      return
    }
    finish(key, message.t === 'ok' ? message.bitmaps : null)
  })
  worker?.addEventListener('error', () => {
    // A crashed worker: fail what it held and carry on on the main thread.
    worker = null
    keyOfRun.clear()
    for (const [key, job] of [...jobs]) if (job.running) finish(key, null)
  })

  const start = (key: string, job: Job) => {
    job.running = true
    active += 1
    if (worker) {
      runCounter += 1
      job.runId = String(runCounter)
      keyOfRun.set(job.runId, key)
      worker.postMessage({
        t: 'load',
        key: job.runId,
        urls: [...job.urls],
        cells: job.cells,
      })
      return
    }
    const abort = new AbortController()
    job.abort = abort
    decodeFirstCells(job.urls, job.cells, deps, abort.signal).then(
      (images) => {
        if (abort.signal.aborted) {
          closeAll(images)
          return
        }
        finish(key, images)
      },
      () => {
        if (!abort.signal.aborted) finish(key, null)
      },
    )
  }

  const pump = () => {
    while (!disposed && active < concurrency && queue.size) {
      const key = queue.pop()
      const job = key === undefined ? undefined : jobs.get(key)
      if (key !== undefined && job) start(key, job)
    }
  }

  const requestCells = (
    key: string,
    urls: readonly string[],
    priority: number,
    cells: readonly CellSpec[] | null,
  ) => {
    const existing = jobs.get(key)
    if (existing) {
      if (!existing.running) queue.update(key, priority)
      return existing.promise
    }
    let resolve!: Job['resolve']
    let reject!: Job['reject']
    const promise = new Promise<PosterImage[]>((res, rej) => {
      resolve = res
      reject = rej
    })
    jobs.set(key, {
      urls,
      cells: cells ? [...cells] : null,
      resolve,
      reject,
      promise,
      abort: null,
      running: false,
      runId: null,
    })
    queue.push(key, priority)
    pump()
    return promise
  }

  return {
    request: (key, urls, priority, cell) =>
      requestCells(key, urls, priority, cell ? [cell] : null).then((images) => {
        closeAll(images.slice(1))
        return images[0]
      }),
    requestCells: (key, urls, priority, cells) =>
      requestCells(key, urls, priority, cells),
    setConcurrency(next) {
      concurrency = Math.max(1, next)
      pump()
    },
    reprioritise(key, priority) {
      const job = jobs.get(key)
      if (job && !job.running) queue.update(key, priority)
    },
    cancel(key) {
      const job = jobs.get(key)
      if (!job) return
      queue.remove(key)
      const wasRunning = job.running
      settle(key, job)
      job.abort?.abort()
      if (wasRunning && worker && job.runId) {
        // The run's reply is still mapped, so the late bitmap is closed.
        worker.postMessage({ t: 'cancel', key: job.runId })
        keyOfRun.delete(job.runId)
      }
      job.reject(cancelled())
      pump()
    },
    get pending() {
      return jobs.size
    },
    dispose() {
      disposed = true
      for (const [key, job] of [...jobs]) {
        queue.remove(key)
        job.abort?.abort()
        job.reject(cancelled())
      }
      jobs.clear()
      worker?.terminate()
      worker = null
    },
  }
}
