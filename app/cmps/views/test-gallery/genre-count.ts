// Genre chip counts: exact below 1,000, then thousands to one decimal
// ("1k", "2.3k", "4.3k"), so a wide chip never pushes its row around.
export const formatGenreCount = (count: number) => {
  if (count < 1000) return String(count)
  const thousands = Math.round(count / 100) / 10
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`
}
