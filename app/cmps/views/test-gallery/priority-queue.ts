// A binary min-heap keyed by an id: lower priority numbers pop first, and a
// key's priority can change or be removed while it waits.
export const createPriorityQueue = <K>() => {
  const keys: K[] = []
  const priorities: number[] = []
  const slotOf = new Map<K, number>()

  const swap = (a: number, b: number) => {
    const keyA = keys[a]
    const keyB = keys[b]
    const priorityA = priorities[a]
    keys[a] = keyB
    keys[b] = keyA
    priorities[a] = priorities[b]
    priorities[b] = priorityA
    slotOf.set(keyA, b)
    slotOf.set(keyB, a)
  }

  const up = (from: number) => {
    let slot = from
    while (slot > 0) {
      const parent = (slot - 1) >> 1
      if (priorities[parent] <= priorities[slot]) break
      swap(parent, slot)
      slot = parent
    }
  }

  const down = (from: number) => {
    let slot = from
    for (;;) {
      const left = slot * 2 + 1
      const right = left + 1
      let smallest = slot
      if (left < keys.length && priorities[left] < priorities[smallest])
        smallest = left
      if (right < keys.length && priorities[right] < priorities[smallest])
        smallest = right
      if (smallest === slot) return
      swap(slot, smallest)
      slot = smallest
    }
  }

  const removeAt = (slot: number) => {
    const last = keys.length - 1
    const key = keys[slot]
    if (slot !== last) swap(slot, last)
    keys.pop()
    priorities.pop()
    slotOf.delete(key)
    if (slot !== last && slot < keys.length) {
      up(slot)
      down(slot)
    }
  }

  const update = (key: K, priority: number) => {
    const slot = slotOf.get(key)
    if (slot === undefined) return
    priorities[slot] = priority
    up(slot)
    down(slotOf.get(key) ?? 0)
  }

  return {
    push(key: K, priority: number) {
      if (slotOf.has(key)) {
        update(key, priority)
        return
      }
      keys.push(key)
      priorities.push(priority)
      slotOf.set(key, keys.length - 1)
      up(keys.length - 1)
    },
    update,
    remove(key: K) {
      const slot = slotOf.get(key)
      if (slot !== undefined) removeAt(slot)
    },
    has: (key: K) => slotOf.has(key),
    pop(): K | undefined {
      if (!keys.length) return undefined
      const key = keys[0]
      removeAt(0)
      return key
    },
    get size() {
      return keys.length
    },
  }
}
