// Choosing which of the candidate films get published. The state holds every
// candidate with its vote count; the catalogue is the top `target` by votes.
// This works from the data we hold, never from TMDB's `total_results`, which
// is capped at 10,000 for any discover query and so says nothing about size.

// The film-level vote threshold for about `target` films: the vote count of
// the target-th most voted film, so ties at that count are all included (the
// result can overshoot the target by the size of that tie). With no more
// candidates than the target, everything is published and the threshold is
// `floor`, the lowest count the candidate state was collected at.
export const chooseThreshold = (films, target, floor = 1) => {
  const counts = [...films.values()]
    .map((film) => film.voteCount)
    .sort((a, b) => b - a)
  if (counts.length <= target) return { minVotes: floor, count: counts.length }
  const minVotes = Math.max(floor, counts[target - 1])
  let count = Math.min(target, counts.length)
  while (count > 0 && counts[count - 1] < minVotes) count -= 1
  while (count < counts.length && counts[count] >= minVotes) count += 1
  return { minVotes, count }
}

// The films to publish: those at or above the chosen threshold.
export const cutByVotes = (films, target, floor = 1) => {
  const { minVotes } = chooseThreshold(films, target, floor)
  const kept = [...films.values()].filter((film) => film.voteCount >= minVotes)
  return { films: kept, minVotes, count: kept.length }
}
