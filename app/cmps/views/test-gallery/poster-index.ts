// Which globe instance shows each film. A film that appears more than once (a
// small set repeats its films to fill the globe) keeps its first place, so
// links and rings always attach to the same poster.

export const buildPosterIndex = (
  items: readonly { id: string }[],
  instanceCount: number,
): Map<string, number> => {
  const index = new Map<string, number>()
  const count = Math.max(1, items.length)
  for (let instance = 0; instance < instanceCount; instance += 1) {
    const item = items[instance % count]
    if (item && !index.has(item.id)) index.set(item.id, instance)
  }
  return index
}
