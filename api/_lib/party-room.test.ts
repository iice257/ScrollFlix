import { describe, expect, it, vi } from 'vitest'
import {
  type Room,
  type RoomView,
  handleParty,
  memoryStore,
  normalizeCode,
  upstashStore,
} from './party-room'

const A = 'token-host-0001'
const B = 'token-guest-0002'
const C = 'token-guest-0003'
const GAME = 'eyJ2IjoxfQ-game-code'

const setup = () => {
  const store = memoryStore()
  const call = async (
    body: unknown,
    method = 'POST',
    query = '',
  ): Promise<{ status: number; data: Record<string, unknown> & RoomView }> => {
    const response = await handleParty(
      new Request(`https://x.test/api/party${query}`, {
        method,
        body: method === 'POST' ? JSON.stringify(body) : undefined,
      }),
      store,
    )
    return {
      status: response.status,
      data: (await response.json()) as Record<string, unknown> & RoomView,
    }
  }
  return { store, call }
}

const make = async (call: ReturnType<typeof setup>['call']) => {
  const { data } = await call({
    action: 'create',
    token: A,
    names: ['Ada', 'Bo', 'Cy'],
    rounds: 2,
    mode: 'year',
    settle: true,
  })
  return data.room
}

describe('party rooms', () => {
  it('creates a lobby the host already sits in', async () => {
    const { call } = setup()
    const { status, data } = await call({
      action: 'create',
      token: A,
      names: ['Ada', 'Bo'],
      avatars: [603, 'x'],
      rounds: 9,
      mode: 'nonsense',
    })
    expect(status).toBe(200)
    expect(data.room).toMatch(/^[A-HJKMNP-Z2-9]{4}$/)
    expect(data).toMatchObject({
      status: 'lobby',
      claimed: [true, false],
      seat: 0,
      host: true,
      rounds: 3,
      mode: 'year',
      avatars: [603, 0],
    })
  })

  it('refuses a room with too few or blank players', async () => {
    const { call } = setup()
    for (const names of [['Ada'], ['Ada', ' '], []])
      expect((await call({ action: 'create', token: A, names })).status).toBe(
        400,
      )
  })

  it('never tells a phone anyone else is who', async () => {
    const { call } = setup()
    const room = await make(call)
    const text = JSON.stringify(
      (await call(null, 'GET', `?room=${room}&token=${B}`)).data,
    )
    expect(text).not.toContain(A)
  })

  it('lets a guest take a free seat once and not a taken one', async () => {
    const { call } = setup()
    const room = await make(call)
    const claim = (token: string, seat: number) =>
      call({ action: 'claim', room, token, seat })
    expect((await claim(B, 1)).data.claimed).toEqual([true, true, false])
    expect((await claim(C, 1)).status).toBe(409)
    expect((await claim(B, 1)).status).toBe(200)
    // Moving to another seat lets go of the first.
    expect((await claim(B, 2)).data.claimed).toEqual([true, false, true])
  })

  it('answers "unchanged" to a phone that is up to date', async () => {
    const { call } = setup()
    const room = await make(call)
    const first = await call(null, 'GET', `?room=${room}&token=${A}`)
    const again = await call(
      null,
      'GET',
      `?room=${room}&token=${A}&since=${first.data.v}`,
    )
    expect(again.data).toMatchObject({ unchanged: true })
  })

  it('starts only for the host, with the seats that were taken', async () => {
    const { call } = setup()
    const room = await make(call)
    await call({ action: 'claim', room, token: B, seat: 2 })
    const start = (token: string, order: number[]) =>
      call({ action: 'start', room, token, code: GAME, order })
    expect((await start(B, [0, 2])).status).toBe(403)
    expect((await start(A, [0, 1])).status).toBe(400)
    const ok = await start(A, [0, 2])
    expect(ok.data).toMatchObject({ status: 'live', code: GAME, you: 0 })
    const guest = await call(null, 'GET', `?room=${room}&token=${B}`)
    expect(guest.data).toMatchObject({ seat: 2, you: 1, host: false })
    expect(
      (await call({ action: 'claim', room, token: C, seat: 1 })).status,
    ).toBe(409)
  })

  it('takes a move only against the version it was made on', async () => {
    const { call } = setup()
    const room = await make(call)
    await call({ action: 'claim', room, token: B, seat: 1 })
    const live = await call({
      action: 'start',
      room,
      token: A,
      code: GAME,
      order: [0, 1],
    })
    const publish = (token: string, expect: number, code: string) =>
      call({ action: 'publish', room, token, expect, code })
    const first = await publish(A, live.data.v, 'game-code-one')
    expect(first.status).toBe(200)
    // B was still looking at the old version.
    const late = await publish(B, live.data.v, 'game-code-two')
    expect(late.status).toBe(409)
    expect(late.data).toMatchObject({ error: 'stale', code: 'game-code-one' })
    expect((await publish(B, first.data.v, 'game-code-two')).data.code).toBe(
      'game-code-two',
    )
    expect((await publish(C, first.data.v, 'game-code-xxxx')).status).toBe(403)
  })

  it('lets the host end it and no one else', async () => {
    const { call } = setup()
    const room = await make(call)
    expect((await call({ action: 'end', room, token: B })).status).toBe(403)
    expect((await call({ action: 'end', room, token: A })).data.status).toBe(
      'ended',
    )
  })

  it('knows a missing room, and a bad code', async () => {
    const { call } = setup()
    expect((await call(null, 'GET', '?room=ZZZZ')).status).toBe(404)
    expect((await call(null, 'GET', '?room=zz')).status).toBe(400)
  })

  it('is unavailable where no store is configured', async () => {
    const response = await handleParty(
      new Request('https://x.test/api/party?room=ABCD'),
      null,
    )
    expect(response.status).toBe(503)
  })

  it('reads a typed code forgivingly', () => {
    expect(normalizeCode(' ab-c d9 ')).toBe('ABCD')
    expect(normalizeCode(undefined)).toBe('')
  })
})

describe('Upstash store', () => {
  it('reads with GET and writes with one version-checked script', async () => {
    const sent: unknown[] = []
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const command = JSON.parse(String(init?.body)) as unknown[]
      sent.push(command)
      return new Response(
        JSON.stringify({
          result: command[0] === 'GET' ? null : 1,
        }),
      )
    }) as unknown as typeof fetch
    const store = upstashStore('https://kv.test', 'secret', fetcher)
    expect(await store.get('k')).toBeNull()
    const room: Room = {
      v: 2,
      status: 'lobby',
      names: [],
      avatars: [],
      rounds: 2,
      mode: 'year',
      settle: true,
      seats: [],
      order: [],
      code: null,
      updated: 0,
    }
    expect(await store.put('k', 1, room)).toBe(true)
    expect((sent[1] as unknown[]).slice(0, 5)).toEqual([
      'EVAL',
      expect.any(String),
      1,
      'k',
      '1',
    ])
  })

  it('treats an error answer as a failure', async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({ error: 'nope' }),
      )) as unknown as typeof fetch
    await expect(
      upstashStore('https://kv.test', 't', fetcher).get('k'),
    ).rejects.toThrow()
  })
})
