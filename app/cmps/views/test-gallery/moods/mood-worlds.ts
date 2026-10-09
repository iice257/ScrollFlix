// The mood page's worlds. Each one is a place with a feeling, and each maps
// onto the filter the rest of the app already understands, so picking a world
// is just a shortcut into the same mood filters.

export type MoodFilter =
  | 'fast'
  | 'dark'
  | 'funny'
  | 'romantic'
  | 'weird'
  | 'highRated'

export type MoodTimeId =
  | 'any'
  | 'movieUnder90'
  | 'movie90to120'
  | 'movieOver120'

export type MoodWorld = {
  id: MoodFilter
  name: string
  promise: string
  // The colour the world's controls take when it is chosen.
  accent: string
}

export const MOOD_WORLDS: MoodWorld[] = [
  {
    id: 'fast',
    name: 'Edge of your seat',
    promise: 'Fast, loud, no time to blink.',
    accent: '#ff7a2f',
  },
  {
    id: 'dark',
    name: 'After dark',
    promise: 'Lights low. Something is out there.',
    accent: '#a78bfa',
  },
  {
    id: 'funny',
    name: 'Laugh it off',
    promise: 'Easy, bright and a little ridiculous.',
    accent: '#ffd23f',
  },
  {
    id: 'romantic',
    name: 'Hopeless romantic',
    promise: 'Slow glances and big feelings.',
    accent: '#ff6b9d',
  },
  {
    id: 'weird',
    name: 'Slightly unhinged',
    promise: 'Strange in the best possible way.',
    accent: '#5eead4',
  },
  {
    id: 'highRated',
    name: 'Certified great',
    promise: 'The ones everyone agrees on.',
    accent: '#f5c542',
  },
]

export const MOOD_TIMES: Array<{
  id: MoodTimeId
  label: string
  hint: string
}> = [
  { id: 'any', label: 'Any length', hint: 'No limit' },
  { id: 'movieUnder90', label: 'Quick', hint: 'Under 1 hr 30' },
  { id: 'movie90to120', label: 'Regular', hint: '1 hr 30 to 2 hrs' },
  { id: 'movieOver120', label: 'Settle in', hint: 'Over 2 hrs' },
]

export const MAX_BLENDED_MOODS = 2

// Choosing a world toggles it. A third choice replaces the oldest, so there
// are never more than two worlds blended.
export const toggleMood = (
  selected: MoodFilter[],
  id: MoodFilter,
  max = MAX_BLENDED_MOODS,
): MoodFilter[] => {
  if (selected.includes(id)) return selected.filter((item) => item !== id)
  return [...selected, id].slice(-max)
}

export const describeBlend = (selected: MoodFilter[]) =>
  selected
    .map((id) => MOOD_WORLDS.find((world) => world.id === id)?.name ?? '')
    .filter(Boolean)
    .join('  +  ')

// ------------------------------------------------------------------ nudge

export const NUDGE_RULES = {
  // This many shuffles inside the window, and the suggestion appears once.
  shuffles: 3,
  windowMs: 45_000,
} as const

// Keeps the times of recent shuffles and says when there have been enough of
// them, quickly enough, to offer the mood page.
export const noteShuffleForNudge = (
  recent: number[],
  now: number,
  rules: { shuffles: number; windowMs: number } = NUDGE_RULES,
): { recent: number[]; fire: boolean } => {
  const inWindow = [...recent, now].filter(
    (time) => now - time <= rules.windowMs,
  )
  if (inWindow.length >= rules.shuffles) return { recent: [], fire: true }
  return { recent: inWindow, fire: false }
}
