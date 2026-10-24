import { describe, expect, it } from 'vitest'
import { createPriorityQueue } from './priority-queue'

describe('priority queue', () => {
  it('pops lowest first', () => {
    const queue = createPriorityQueue<string>()
    queue.push('c', 3)
    queue.push('a', 1)
    queue.push('b', 2)
    expect([queue.pop(), queue.pop(), queue.pop(), queue.pop()]).toEqual([
      'a',
      'b',
      'c',
      undefined,
    ])
  })

  it('update moves key', () => {
    const queue = createPriorityQueue<string>()
    queue.push('a', 1)
    queue.push('b', 2)
    queue.push('c', 3)
    queue.update('c', 0)
    queue.update('a', 9)
    expect([queue.pop(), queue.pop(), queue.pop()]).toEqual(['c', 'b', 'a'])
  })

  it('remove drops key', () => {
    const queue = createPriorityQueue<string>()
    queue.push('a', 1)
    queue.push('b', 2)
    queue.push('c', 3)
    queue.push('d', 4)
    queue.remove('b')
    queue.remove('zzz')
    expect(queue.size).toBe(3)
    expect([queue.pop(), queue.pop(), queue.pop()]).toEqual(['a', 'c', 'd'])
  })

  it('stays ordered under random use', () => {
    const queue = createPriorityQueue<number>()
    const values = Array.from({ length: 200 }, (_, at) => (at * 7919) % 211)
    values.forEach((value, at) => queue.push(at, value))
    const out: number[] = []
    for (let key = queue.pop(); key !== undefined; key = queue.pop())
      out.push(values[key])
    expect(out).toEqual([...values].sort((a, b) => a - b))
  })
})
