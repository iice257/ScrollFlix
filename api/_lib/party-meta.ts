// What a Pass the Globe link says, for its preview card. The game lives in the
// ?party= code (see app/.../party/party-link.ts); this reads just enough of it
// to say whose turn it is or who won. It is deliberately standalone: the app's
// decoder imports extensionless paths that the Node function bundle can't
// resolve, and a test keeps the two in step by running the real encoder.

export type PartySummary = {
  headline: string
  detail: string
  // TMDB id of the film to show on the card. Null before any film is played.
  lastTmdbId: string | null
}

type Payload = {
  v?: unknown
  r?: unknown
  s?: unknown
  p?: unknown
  t?: unknown
  w?: unknown
  k?: unknown
}

const CODE = /^[A-Za-z0-9_-]{8,4000}$/

const fromBase64Url = (code: string) => {
  const padded = code.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0)),
  )
}

const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value)

export const summarizePartyCode = (code: string): PartySummary | null => {
  try {
    if (!CODE.test(code)) return null
    const { v, r, s, p, t, w, k } = JSON.parse(fromBase64Url(code)) as Payload
    if (v !== 1 || !isInt(r) || r < 1 || r > 3) return null
    if (!Array.isArray(p) || p.length < 2 || p.length > 6) return null
    if (
      !p.every((n) => typeof n === 'string' && n.length > 0 && n.length <= 14)
    )
      return null
    if (!Array.isArray(t) || t.length > p.length * r) return null
    const names = p as string[]
    const rows = t as unknown[][]
    const totals = names.map(() => 0)
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      if (!Array.isArray(row) || !isInt(row[0]) || !isInt(row[4])) return null
      totals[i % names.length] += row[4]
    }
    const lastRow = rows[rows.length - 1]
    const lastTmdbId = lastRow ? String(lastRow[0]) : null
    const ranked = totals
      .map((total, index) => ({ total, index }))
      .sort((a, b) => b.total - a.total || a.index - b.index)
    const lead = ranked[0]
    const finished = rows.length >= names.length * r
    if (isInt(w) && w > 0) {
      return {
        headline: "Tonight's film",
        detail: 'Picked in a game of Pass the Globe',
        lastTmdbId: String(w),
      }
    }
    if (finished && k === 0) {
      const top = ranked.filter((e) => e.total === lead.total)
      const who = top.map((e) => names[e.index]).join(' and ')
      return {
        headline: s === 1 ? 'Time to settle it' : `${who} won`,
        detail: `${who} ${top.length > 1 ? 'tie' : 'wins'} with ${lead.total}`,
        lastTmdbId,
      }
    }
    if (finished) {
      return {
        headline: 'Votes still to cast',
        detail: `${names[lead.index]} leads with ${lead.total}`,
        lastTmdbId,
      }
    }
    const round = Math.min(r, Math.floor(rows.length / names.length) + 1)
    return {
      headline: `Your turn, ${names[rows.length % names.length]}`,
      detail: `${names[lead.index]} leads with ${lead.total} · Round ${round} of ${r}`,
      lastTmdbId,
    }
  } catch {
    return null
  }
}
