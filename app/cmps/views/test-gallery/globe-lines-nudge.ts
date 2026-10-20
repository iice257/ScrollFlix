// The first-open nudge for the two globe-line settings. The first time the
// menu opens, each setting that is still at its default and has not been
// explained yet gets a small tip beside its switch. This is only the
// bookkeeping; the tip itself is in globe-lines-tip.tsx.
//
// Like the other first-time hints it is a courtesy: storage that is missing
// or blocked just means a tip may show again.

export type LineKind = 'path' | 'links'

export const LINE_KINDS: readonly LineKind[] = ['path', 'links']

const SEEN_KEYS: Record<LineKind, string> = {
  path: 'wtw:globe-lines-nudge:path:v1',
  links: 'wtw:globe-lines-nudge:links:v1',
}

// The tips count as seen once the menu has been closed after they were on
// screen for at least this long; a flash (a remount) does not use them up.
export const NUDGE_SEEN_AFTER_MS = 1500

export const hasSeenLineNudge = (kind: LineKind) => {
  try {
    return window.localStorage.getItem(SEEN_KEYS[kind]) === '1'
  } catch {
    return false
  }
}

export const markLineNudgeSeen = (kind: LineKind) => {
  try {
    window.localStorage.setItem(SEEN_KEYS[kind], '1')
  } catch {
    // Private mode or blocked storage: nothing to remember it with.
  }
}

// Which tips to show: a setting the person has already chosen (On or Off) or
// whose tip they have already seen gets none.
export const pendingLineNudges = (
  isStored: Record<LineKind, () => boolean>,
  hasSeen: (kind: LineKind) => boolean = hasSeenLineNudge,
): LineKind[] =>
  LINE_KINDS.filter((kind) => !isStored[kind]() && !hasSeen(kind))

export const LINE_NUDGE_COPY: Record<
  LineKind,
  { title: string; line: string }
> = {
  path: {
    title: 'Session path',
    line: 'See the trail of films you’ve landed on.',
  },
  links: {
    title: 'Favorite links',
    line: 'Draw lines between the films you’ve saved.',
  },
}
