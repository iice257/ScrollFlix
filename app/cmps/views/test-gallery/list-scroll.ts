// Pure helpers for the Index's random pick, kept apart from the component so
// they can be tested without a DOM.

// A uniformly random film from the whole list, never the one already showing.
// The list is virtualised, so this must read the data, not the rendered rows.
export const pickRandomRow = <T extends { id: string }>(
  rows: readonly T[],
  currentId: string | null,
  random: () => number,
): T | null => {
  if (!rows.length) return null
  const currentIndex = currentId
    ? rows.findIndex((row) => row.id === currentId)
    : -1
  if (currentIndex === -1) return rows[Math.floor(random() * rows.length)]
  if (rows.length === 1) return rows[0]
  // Draw from the other rows, then step over the current one.
  const drawn = Math.floor(random() * (rows.length - 1))
  return rows[drawn >= currentIndex ? drawn + 1 : drawn]
}

type CenterInput = {
  // The row's top edge measured from the top of the scrolled content.
  rowTop: number
  rowHeight: number
  viewportHeight: number
  scrollHeight: number
}

// The scrollTop that puts a row in the middle of the viewport, clamped to the
// scrollable range.
export const centeredScrollTop = ({
  rowTop,
  rowHeight,
  viewportHeight,
  scrollHeight,
}: CenterInput) => {
  const maxTop = Math.max(0, scrollHeight - viewportHeight)
  const target = rowTop - viewportHeight / 2 + rowHeight / 2
  return Math.max(0, Math.min(maxTop, target))
}

// Where a long scroll begins its visible glide. A target many screens away is
// reached by an instant jump to this point first, so the glide only ever
// crosses a screen or two of rows instead of mounting thousands on the way.
export const glideStart = (
  from: number,
  target: number,
  viewportHeight: number,
) => {
  const lead = viewportHeight * 1.5
  const distance = target - from
  if (Math.abs(distance) <= lead * 2) return from
  return target - Math.sign(distance) * lead
}

// The genre chips on an Index row. A row has room for three, so a genre the
// list is filtered by comes first: it is the reason the film is there, and it
// would otherwise be hidden whenever it is a film's fourth genre.
export const visibleGenreTags = (
  genres: readonly string[],
  selected: readonly string[],
  limit = 3,
) => {
  const picked = genres.filter((genre) => selected.includes(genre))
  const rest = genres.filter((genre) => !selected.includes(genre))
  return [...picked, ...rest].slice(0, limit)
}
