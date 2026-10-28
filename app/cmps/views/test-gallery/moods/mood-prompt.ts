// The line above the dock on Home: a lead-in and the mood button's label.
// It starts as the same two plain lines every visit, then follows what the
// visitor is doing: a skip, several skips, a quiet spell, the time of day.
// Every lead-in reads with every label, so the pools mix freely.

export type MoodPrompt = { lead: string; cta: string }
export type PromptContext = 'skip' | 'skips' | 'idle' | 'time'
export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night'

export const FIRST_PROMPT: MoodPrompt = {
  lead: 'How are you feeling?',
  cta: 'Pick your mood',
}

// A lead-in and its label together stay within this many characters, which is
// what fits between the phone's two corner buttons (the plain first prompt is
// 34 and sits there with room to spare).
export const PROMPT_BUDGET = 34

export const CTAS = [
  'Pick your mood',
  'Choose a mood',
  'Pick a mood',
  'Tell us your mood',
  'Say how you feel',
  'Let a mood decide',
  'Start with a mood',
] as const

const LEADS: Record<PromptContext, readonly string[]> = {
  skip: ["Didn't like that one?", 'Not that one?', 'Not quite right?'],
  skips: [
    'Nothing landing?',
    'Too much choice?',
    'Want us to decide?',
    'Hard to please?',
  ],
  idle: ['Need a nudge?', 'Take your time?', "Can't decide?"],
  time: [],
}

const TIME_LEADS: Record<DayPart, readonly string[]> = {
  morning: ['Morning mood?', "What's the vibe?"],
  afternoon: ['Afternoon slump?', "What's the vibe?"],
  evening: ["Tonight's vibe?", 'Winding down?'],
  night: ['Late night mood?', "Can't sleep?"],
}

export const dayPart = (hour: number): DayPart => {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'night'
}

// Skips since the visitor last opened the moods, or since they arrived.
export const SKIPS_BEFORE_SKIP_LINES = 1
export const SKIPS_BEFORE_MANY_LINES = 4

export const contextFor = (skips: number, idle: boolean): PromptContext => {
  if (skips >= SKIPS_BEFORE_MANY_LINES) return 'skips'
  if (skips >= SKIPS_BEFORE_SKIP_LINES) return 'skip'
  return idle ? 'idle' : 'time'
}

const choose = <T>(
  items: readonly T[],
  avoid: T | undefined,
  random: () => number,
) => {
  const pool = items.length > 1 ? items.filter((item) => item !== avoid) : items
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
}

// The next prompt: never the same lead-in or label twice running.
export const pickPrompt = (
  context: PromptContext,
  part: DayPart,
  previous: MoodPrompt,
  random: () => number = Math.random,
): MoodPrompt => {
  const leads = context === 'time' ? TIME_LEADS[part] : LEADS[context]
  const lead = choose(leads, previous.lead, random)
  const labels = CTAS.filter((cta) => lead.length + cta.length <= PROMPT_BUDGET)
  return { lead, cta: choose(labels, previous.cta, random) }
}
