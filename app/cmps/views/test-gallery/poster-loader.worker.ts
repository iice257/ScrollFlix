// Fetches and decodes posters off the main thread. The main thread's queue
// decides the order and how many run at once; this only does the work and
// transfers each bitmap back.
import {
  type CellSpec,
  type WorkerIn,
  type WorkerOut,
  decodeFirst,
  realDeps,
} from './poster-decode'

const deps = realDeps()
const running = new Map<string, AbortController>()
const scope = self as unknown as {
  postMessage: (message: WorkerOut, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WorkerIn>) => void) | null
}

const load = async (key: string, urls: string[], cell: CellSpec | null) => {
  const abort = new AbortController()
  running.set(key, abort)
  try {
    const image = await decodeFirst(urls, cell, deps, abort.signal)
    if (abort.signal.aborted) {
      if ('close' in image) image.close()
      return
    }
    scope.postMessage({ t: 'ok', key, bitmap: image as ImageBitmap }, [
      image as ImageBitmap,
    ])
  } catch {
    if (!abort.signal.aborted) scope.postMessage({ t: 'fail', key })
  } finally {
    running.delete(key)
  }
}

scope.onmessage = (event) => {
  const message = event.data
  if (message.t === 'load') void load(message.key, message.urls, message.cell)
  else running.get(message.key)?.abort()
}
