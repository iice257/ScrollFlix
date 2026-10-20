// Runs `fn` over `items` with at most `concurrency` in flight. Results keep
// the order of `items`.
export const mapPool = async (items, concurrency, fn) => {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await fn(items[index], index)
      }
    }),
  )
  return results
}
