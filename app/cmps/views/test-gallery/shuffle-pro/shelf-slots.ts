import type { Tier } from './shuffle-pro-logic'
import type { FoundEntry } from './shuffle-pro-store'

// The Easter egg shelf shows this many eggs; any further ones fold into a
// "+N" tile.
export const SHELF_SLOTS = 3

const TIER_ORDER: readonly Tier[] = ['frost', 'amethyst', 'jade', 'gold']

export type ShelfSlots = {
  // The eggs shown, in the order they were first found.
  shown: { tier: Tier; entry: FoundEntry }[]
  // Seats still empty (never says which egg belongs there).
  empty: number
  // Eggs found beyond the seats.
  more: number
}

export const shelfSlots = (
  found: Partial<Record<Tier, FoundEntry>>,
  slots = SHELF_SLOTS,
): ShelfSlots => {
  const earned = TIER_ORDER.flatMap((tier) => {
    const entry = found[tier]
    return entry ? [{ tier, entry }] : []
  }).sort((a, b) => a.entry.firstAt - b.entry.firstAt)
  return {
    shown: earned.slice(0, slots),
    empty: Math.max(0, slots - earned.length),
    more: Math.max(0, earned.length - slots),
  }
}
