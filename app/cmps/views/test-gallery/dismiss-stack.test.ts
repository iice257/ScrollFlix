import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDismissStack, registerDismissLayer } from './dismiss-stack'

describe('createDismissStack', () => {
  it('closes the topmost layer first, one per call', () => {
    const stack = createDismissStack()
    const order: string[] = []
    const removeCard = stack.push({ close: () => order.push('card') })
    const removePopup = stack.push({ close: () => order.push('popup') })
    stack.dismissTop()
    removePopup()
    stack.dismissTop()
    expect(order).toEqual(['popup', 'card'])
    removeCard()
    expect(stack.dismissTop()).toBe(false)
  })

  it('closes on a press outside only for layers that opt in, and not inside', () => {
    const stack = createDismissStack()
    const inside = document.createElement('div')
    const outside = document.createElement('div')
    const close = vi.fn()
    stack.push({ close, contains: (t) => t === inside })
    expect(stack.pressOutside(inside)).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(stack.pressOutside(outside)).toBe(true)
    expect(close).toHaveBeenCalledOnce()

    const plain = createDismissStack()
    const plainClose = vi.fn()
    plain.push({ close: plainClose })
    expect(plain.pressOutside(outside)).toBe(false)
    expect(plainClose).not.toHaveBeenCalled()
  })
})

describe('window listeners', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })

  it('Escape closes only the topmost layer', () => {
    const lower = vi.fn()
    const upper = vi.fn()
    cleanups.push(registerDismissLayer({ close: lower }))
    cleanups.push(registerDismissLayer({ close: upper }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(upper).toHaveBeenCalledOnce()
    expect(lower).not.toHaveBeenCalled()
  })

  it('leaves Escape alone when an earlier handler already took it', () => {
    const close = vi.fn()
    cleanups.push(registerDismissLayer({ close }))
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    })
    event.preventDefault()
    window.dispatchEvent(event)
    expect(close).not.toHaveBeenCalled()
  })

  it('a press outside closes a popup, a press on its opener does not', () => {
    const popup = document.createElement('div')
    const opener = document.createElement('button')
    const elsewhere = document.createElement('div')
    document.body.append(popup, opener, elsewhere)
    const close = vi.fn()
    cleanups.push(
      registerDismissLayer({
        close,
        contains: (t) => popup.contains(t) || opener.contains(t),
      }),
    )
    opener.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    popup.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(close).not.toHaveBeenCalled()
    elsewhere.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(close).toHaveBeenCalledOnce()
  })
})
