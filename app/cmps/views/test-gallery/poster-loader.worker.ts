// Fetches and decodes posters off the main thread. The main thread's queue
// decides the order and how many run at once; this only does the work and
// transfers each bitmap back.
import {
  type CellSpec,
  type WorkerIn,
  type WorkerOut,
  decodeFirstCells,
  realDeps,
} from './poster-decode'

const deps = realDeps()
const running = new Map<string, AbortController>()
const scope = self as unknown as {
  postMessage: (message: WorkerOut, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<WorkerIn>) => void) | null
}

const load = async (key: string, urls: string[], cells: CellSpec[] | null) => {
  const abort = new AbortController()
  running.set(key, abort)
  try {
    const images = await decodeFirstCells(urls, cells, deps, abort.signal)
    const bitmaps = images as ImageBitmap[]
    if (abort.signal.aborted) {
      for (const bitmap of bitmaps) bitmap.close()
      return
    }
    scope.postMessage({ t: 'ok', key, bitmaps }, bitmaps)
  } catch {
    if (!abort.signal.aborted) scope.postMessage({ t: 'fail', key })
  } finally {
    running.delete(key)
  }
}

scope.onmessage = (event) => {
  const message = event.data
  if (message.t === 'load') void load(message.key, message.urls, message.cells)
  else running.get(message.key)?.abort()
}
