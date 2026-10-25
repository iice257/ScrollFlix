// The "Genres and filters" figure on the About page: every distinct genre plus
// every selectable filter chip. It is fed the same lists the Filters page and
// the card and globe tags render, so it moves when they do.
type Choice = { disabled?: boolean; id?: string }

export type FilterCountSources = {
  // Genre names from the catalogue (card popup tags and globe tags are these).
  genres: readonly string[]
  // Each group of filter chips the Filters page shows. Disabled chips and the
  // "all" reset chip are not filters, so they are skipped.
  groups: readonly (readonly (Choice | number | string)[])[]
}

const isChoice = (item: Choice | number | string): item is Choice =>
  typeof item === 'object'

export const countGenresAndFilters = ({
  genres,
  groups,
}: FilterCountSources) => {
  const distinctGenres = new Set(
    genres.map((genre) => genre.trim().toLowerCase()).filter(Boolean),
  )
  let filters = 0
  for (const group of groups) {
    for (const item of group) {
      if (isChoice(item) && (item.disabled || item.id === 'all')) continue
      filters += 1
    }
  }
  return distinctGenres.size + filters
}
