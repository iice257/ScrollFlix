import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read as text: the test runner turns CSS imports into empty modules.
const lightTheme = readFileSync(
  resolve(process.cwd(), 'app/light-theme.css'),
  'utf8',
)

// The first block of rules for a selector, minus its hover and focus states.
const declarationsFor = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(
    `\\.warp-shell\\[data-theme="light"\\] ${escaped}\\s*\\{([^}]*)\\}`,
  ).exec(lightTheme)
  return rule?.[1] ?? ''
}

const channels = (value: string) =>
  (/rgb\((\d+) (\d+) (\d+)/.exec(value) ?? []).slice(1).map(Number)

describe('light theme', () => {
  it('draws the saved and info icons in the same dark ink', () => {
    const info = /color:\s*([^;]+);/.exec(declarationsFor('.warp-info-button'))
    const saved = /color:\s*([^;]+);/.exec(
      declarationsFor('.warp-saved-button'),
    )
    expect(info).not.toBeNull()
    expect(saved).not.toBeNull()
    // Cream on the tan pill is invisible; both icons must be dark.
    const [r, g, b] = channels(saved?.[1] ?? '')
    expect((r + g + b) / 3).toBeLessThan(90)
    expect(saved?.[1]).toBe(info?.[1])
  })

  it('outlines controls with a soft warm hairline, never hard black', () => {
    expect(lightTheme).not.toContain('border: 1px solid rgb(0 0 0 / 0.8)')
  })

  it('puts the dock outline on the capsule, not on the button inside it', () => {
    const group =
      /([^{}]*)\{\s*border: 1px solid rgb\(33 26 16 \/ 0\.34\);\s*\}/.exec(
        lightTheme,
      )
    const selectors = (group?.[1] ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((s) => s.trim())
    expect(selectors).toContain(
      '.warp-shell[data-theme="light"] .warp-main-nav',
    )
    expect(selectors).toContain(
      '.warp-shell[data-theme="light"] .warp-mode-toggle',
    )
    expect(selectors).not.toContain(
      '.warp-shell[data-theme="light"] .warp-main-nav button',
    )
  })
})
