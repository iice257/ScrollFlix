// Pass the globe rooms: the shared state that lets friends on their own phones
// play one game live. A room holds who is playing, who has taken which seat,
// and the game itself as the same code a ?party= link carries (see
// app/.../party/party-link.ts), so the server never has to know the rules. A
// version number goes up with every change and every write says which version
// it was made against, so two phones writing at once cannot overwrite each
// other: the loser is told and adopts what won.

export type RoomStatus = 'lobby' | 'live' | 'ended'

export type Room = {
  // Goes up by one with every change.
  v: number
  status: RoomStatus
  names: string[]
  // The film each seat chose as its picture (a TMDB id, 0 for none).
  avatars: number[]
  rounds: number
  mode: string
  settle: boolean
  // The token of whoever took each seat, null while it is free. Seat 0 is the
  // host, who made the room.
  seats: (string | null)[]
  // Once live: the seat each player index belongs to (players are the seats
  // that were taken, in seat order).
  order: number[]
  // The game, as a party link code. Null in the lobby.
  code: string | null
  updated: number
}

// What a phone is told about a room. Never includes anyone's token.
export type RoomView = {
  room: string
  v: number
  status: RoomStatus
  names: string[]
  avatars: number[]
  rounds: number
  mode: string
  settle: boolean
  claimed: boolean[]
  // Which seat is this phone's, null before it has taken one.
  seat: number | null
  // Once live: this phone's player index in the game.
  you: number | null
  host: boolean
  code: string | null
}

export type RoomStore = {
  get: (key: string) => Promise<Room | null>
  // Writes only if the stored room is at `expected` (0 means "not there").
  put: (key: string, expected: number, room: Room) => Promise<boolean>
}

export const MAX_SEATS = 6
export const MIN_SEATS = 2
export const MAX_NAME = 14
const TTL_SECONDS = 60 * 60 * 24
const CODE_LENGTH = 4
// No 0/O, 1/I/L: a code gets read aloud and typed on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const GAME_CODE = /^[A-Za-z0-9_-]{8,4000}$/
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/
const MODES = ['year', 'rating', 'crowd', 'mixed']
const RETRIES = 4

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })

const fail = (status: number, error: string) => json({ error }, status)

export const normalizeCode = (value: unknown) =>
  typeof value === 'string'
    ? value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, CODE_LENGTH)
    : ''

const randomCode = () => {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(
    bytes,
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join('')
}

const keyOf = (code: string) => `party:room:${code}`

export const viewOf = (
  code: string,
  room: Room,
  token: string | null,
): RoomView => {
  const seat = token ? room.seats.indexOf(token) : -1
  return {
    room: code,
    v: room.v,
    status: room.status,
    names: room.names,
    avatars: room.avatars,
    rounds: room.rounds,
    mode: room.mode,
    settle: room.settle,
    claimed: room.seats.map((holder) => holder !== null),
    seat: seat < 0 ? null : seat,
    you:
      seat < 0
        ? null
        : room.order.indexOf(seat) >= 0
          ? room.order.indexOf(seat)
          : null,
    host: seat === 0,
    code: room.code,
  }
}

// ----------------------------------------------------------------- stores

// Rooms in this process's memory. Right for local runs and tests; on a
// serverless host every instance would have its own, so it is not used there.
export const memoryStore = (): RoomStore => {
  const rooms = new Map<string, Room>()
  return {
    get: async (key) => {
      const room = rooms.get(key)
      return room ? structuredClone(room) : null
    },
    put: async (key, expected, room) => {
      const current = rooms.get(key)
      if ((current?.v ?? 0) !== expected) return false
      rooms.set(key, structuredClone(room))
      return true
    },
  }
}

// Upstash Redis over its REST interface, which a serverless function can call
// with plain fetch. The write is one script so the version check and the write
// cannot be split by another phone.
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
local version = 0
if current then version = cjson.decode(current)['v'] end
if tostring(version) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`

export const upstashStore = (
  url: string,
  token: string,
  fetcher: typeof fetch = fetch,
): RoomStore => {
  const run = async (command: (string | number)[]) => {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
    })
    if (!response.ok) throw new Error(`store ${response.status}`)
    const body = (await response.json()) as { result?: unknown; error?: string }
    if (body.error) throw new Error(body.error)
    return body.result
  }
  return {
    get: async (key) => {
      const raw = await run(['GET', key])
      if (typeof raw !== 'string') return null
      try {
        return JSON.parse(raw) as Room
      } catch {
        return null
      }
    },
    put: async (key, expected, room) =>
      (await run([
        'EVAL',
        CAS_SCRIPT,
        1,
        key,
        String(expected),
        JSON.stringify(room),
        String(TTL_SECONDS),
      ])) === 1,
  }
}

let shared: RoomStore | null | undefined

// The store the deployed function uses, or null when none is configured.
export const defaultStore = (
  env: Record<string, string | undefined> = process.env,
): RoomStore | null => {
  if (shared !== undefined) return shared
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) shared = upstashStore(url, token)
  else shared = env.VERCEL ? null : memoryStore()
  return shared
}

// ---------------------------------------------------------------- handler

type Body = Record<string, unknown>

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

const readToken = (value: unknown) =>
  typeof value === 'string' && TOKEN.test(value) ? value : null

// Read, change and write a room, trying again when another phone got there
// first. `change` returns the new room, or a Response to stop with.
const update = async (
  store: RoomStore,
  code: string,
  change: (room: Room) => Room | Response,
): Promise<{ room: Room } | Response> => {
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const room = await store.get(keyOf(code))
    if (!room) return fail(404, 'no-room')
    const next = change(room)
    if (next instanceof Response) return next
    const stamped = { ...next, v: room.v + 1, updated: Date.now() }
    if (await store.put(keyOf(code), room.v, stamped)) return { room: stamped }
  }
  return fail(409, 'busy')
}

const create = async (store: RoomStore, body: Body) => {
  const token = readToken(body.token)
  if (!token) return fail(400, 'bad-token')
  const names = Array.isArray(body.names)
    ? body.names.map((name) => text(name, MAX_NAME))
    : []
  if (
    names.length < MIN_SEATS ||
    names.length > MAX_SEATS ||
    names.some((name) => !name)
  )
    return fail(400, 'bad-players')
  const avatars = names.map((_, at) => {
    const id = Array.isArray(body.avatars) ? Number(body.avatars[at]) : 0
    return Number.isInteger(id) && id > 0 && id < 1e9 ? id : 0
  })
  const mode = MODES.includes(String(body.mode)) ? String(body.mode) : 'year'
  const rounds = Math.min(3, Math.max(1, Math.round(Number(body.rounds) || 2)))
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    const code = randomCode()
    const room: Room = {
      v: 1,
      status: 'lobby',
      names,
      avatars,
      rounds,
      mode,
      settle: body.settle !== false,
      seats: names.map((_, at) => (at === 0 ? token : null)),
      order: [],
      code: null,
      updated: Date.now(),
    }
    if (await store.put(keyOf(code), 0, room))
      return json(viewOf(code, room, token))
  }
  return fail(503, 'busy')
}

export const handleParty = async (
  request: Request,
  store: RoomStore | null = defaultStore(),
): Promise<Response> => {
  if (!store) return fail(503, 'unavailable')
  try {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams
      const code = normalizeCode(params.get('room'))
      if (code.length !== CODE_LENGTH) return fail(400, 'bad-room')
      const room = await store.get(keyOf(code))
      if (!room) return fail(404, 'no-room')
      const since = Number(params.get('since'))
      if (Number.isFinite(since) && since === room.v)
        return json({ room: code, v: room.v, unchanged: true })
      return json(viewOf(code, room, readToken(params.get('token'))))
    }
    if (request.method !== 'POST') return fail(405, 'method')
    const body = (await request.json().catch(() => null)) as Body | null
    if (!body || typeof body !== 'object') return fail(400, 'bad-body')
    if (body.action === 'create') return await create(store, body)

    const code = normalizeCode(body.room)
    const token = readToken(body.token)
    if (code.length !== CODE_LENGTH) return fail(400, 'bad-room')
    if (!token) return fail(400, 'bad-token')

    if (body.action === 'claim') {
      const seat = Number(body.seat)
      const result = await update(store, code, (room) => {
        if (!Number.isInteger(seat) || seat < 0 || seat >= room.seats.length)
          return fail(400, 'bad-seat')
        const holder = room.seats[seat]
        if (holder === token) return room
        if (room.status !== 'lobby') return fail(409, 'started')
        if (holder !== null) return fail(409, 'taken')
        // One seat per phone: taking another lets go of the first.
        const seats = room.seats.map((current, at) =>
          at === seat ? token : current === token && at !== 0 ? null : current,
        )
        return { ...room, seats }
      })
      return result instanceof Response
        ? result
        : json(viewOf(code, result.room, token))
    }

    if (body.action === 'start') {
      const game = typeof body.code === 'string' ? body.code : ''
      const order = Array.isArray(body.order) ? body.order.map(Number) : []
      const result = await update(store, code, (room) => {
        if (room.seats[0] !== token) return fail(403, 'not-host')
        if (room.status !== 'lobby') return fail(409, 'started')
        if (!GAME_CODE.test(game)) return fail(400, 'bad-game')
        const seated = new Set(
          room.seats.flatMap((holder, at) => (holder ? [at] : [])),
        )
        if (
          order.length < MIN_SEATS ||
          order.length !== seated.size ||
          !order.every((seat) => seated.has(seat)) ||
          new Set(order).size !== order.length
        )
          return fail(400, 'bad-order')
        return { ...room, status: 'live', order, code: game }
      })
      return result instanceof Response
        ? result
        : json(viewOf(code, result.room, token))
    }

    if (body.action === 'publish') {
      const game = typeof body.code === 'string' ? body.code : ''
      const expect = Number(body.expect)
      const result = await update(store, code, (room) => {
        if (!room.seats.includes(token)) return fail(403, 'not-seated')
        if (room.status !== 'live') return fail(409, 'not-live')
        if (!GAME_CODE.test(game)) return fail(400, 'bad-game')
        // Someone else's change landed first: say so, with where it stands.
        if (expect !== room.v)
          return json({ error: 'stale', ...viewOf(code, room, token) }, 409)
        return { ...room, code: game }
      })
      return result instanceof Response
        ? result
        : json(viewOf(code, result.room, token))
    }

    if (body.action === 'end') {
      const result = await update(store, code, (room) =>
        room.seats[0] === token
          ? { ...room, status: 'ended' }
          : fail(403, 'not-host'),
      )
      return result instanceof Response
        ? result
        : json(viewOf(code, result.room, token))
    }

    return fail(400, 'bad-action')
  } catch {
    return fail(503, 'unavailable')
  }
}
