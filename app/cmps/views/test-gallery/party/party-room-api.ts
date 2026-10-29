// Talking to /api/party: the rooms that let friends play Pass the globe live.
// Nothing here touches React. Every call answers with a result instead of
// throwing, and "unavailable" covers every way the server can't be reached
// (offline, a deploy with no store, a dev server with no functions), so the
// game can fall back to passing a link.

export type RoomView = {
  room: string
  v: number
  status: 'lobby' | 'live' | 'ended'
  names: string[]
  avatars: number[]
  rounds: number
  mode: string
  settle: boolean
  claimed: boolean[]
  seat: number | null
  you: number | null
  host: boolean
  code: string | null
}

export type RoomError =
  | 'unavailable'
  | 'no-room'
  | 'taken'
  | 'started'
  | 'stale'
  | 'busy'
  | 'forbidden'
  | 'invalid'

export type RoomResult =
  | { ok: true; view: RoomView }
  // `view` is there on "stale": where the room stands now.
  | { ok: false; error: RoomError; view?: RoomView }

export type RoomPoll = RoomResult | { ok: true; unchanged: true }

export type RoomSession = { room: string; token: string }

const ENDPOINT = '/api/party'

export const newToken = () => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

const errorOf = (status: number, code: unknown): RoomError => {
  if (code === 'stale') return 'stale'
  if (code === 'taken') return 'taken'
  if (code === 'started') return 'started'
  if (code === 'no-room' || status === 404) return 'no-room'
  if (code === 'busy') return 'busy'
  if (status === 403) return 'forbidden'
  if (status === 400) return 'invalid'
  return 'unavailable'
}

const parse = async (response: Response): Promise<RoomPoll> => {
  let body: Record<string, unknown> | null = null
  try {
    body = (await response.json()) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'unavailable' }
  }
  if (!body || typeof body !== 'object')
    return { ok: false, error: 'unavailable' }
  if (body.unchanged === true) return { ok: true, unchanged: true }
  if (response.ok && typeof body.room === 'string')
    return { ok: true, view: body as unknown as RoomView }
  const view =
    typeof body.room === 'string' ? (body as unknown as RoomView) : undefined
  return { ok: false, error: errorOf(response.status, body.error), view }
}

const send = async (
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<RoomResult> => {
  try {
    const reply = await parse(
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      }),
    )
    return 'unchanged' in reply ? { ok: false, error: 'unavailable' } : reply
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export const createRoom = (
  token: string,
  options: {
    names: string[]
    avatars: number[]
    rounds: number
    mode: string
    settle: boolean
  },
) => send({ action: 'create', token, ...options })

export const readRoom = async (
  session: RoomSession,
  since?: number,
  signal?: AbortSignal,
): Promise<RoomPoll> => {
  try {
    const query = new URLSearchParams({
      room: session.room,
      token: session.token,
    })
    if (since) query.set('since', String(since))
    return await parse(await fetch(`${ENDPOINT}?${query}`, { signal }))
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export const claimSeat = (session: RoomSession, seat: number) =>
  send({ action: 'claim', ...session, seat })

export const startRoom = (
  session: RoomSession,
  code: string,
  order: number[],
) => send({ action: 'start', ...session, code, order })

export const publishRoom = (
  session: RoomSession,
  expect: number,
  code: string,
) => send({ action: 'publish', ...session, expect, code })

export const endRoom = (session: RoomSession) =>
  send({ action: 'end', ...session })

// What someone types or pastes for a room: four letters or digits.
export const readRoomCode = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)

export const roomUrl = (room: string, base?: string) => {
  const url = new URL(base ?? window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('room', room)
  return url.toString()
}
