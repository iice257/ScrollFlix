import { describe, expect, it } from 'vitest'
import { failingTests, issueBody, rollbackSteps } from './smoke-alert.mjs'

const report = {
  suites: [
    {
      title: 'smoke.spec.ts',
      specs: [],
      suites: [
        {
          title: 'deployment smoke',
          specs: [
            { title: 'home page responds', ok: true },
            { title: 'catalogue manifest loads', ok: false },
            { title: 'skipped one', ok: true },
          ],
        },
      ],
    },
  ],
}

describe('smoke-alert', () => {
  it('lists only the failing tests, with their suite path', () => {
    expect(failingTests(report)).toEqual([
      'smoke.spec.ts > deployment smoke > catalogue manifest loads',
    ])
  })

  it('copes with an empty or missing report', () => {
    expect(failingTests({})).toEqual([])
    expect(failingTests(undefined)).toEqual([])
  })

  it('writes an issue body with the run link, failures and rollback steps', () => {
    const body = issueBody({
      target: 'https://scrollflix.app',
      source: 'uptime',
      runUrl: 'https://github.com/x/y/actions/runs/1',
      failed: ['a > b'],
      when: '2026-01-01T00:00:00.000Z',
    })
    expect(body).toContain('https://github.com/x/y/actions/runs/1')
    expect(body).toContain('- a > b')
    expect(body).toContain(rollbackSteps())
    expect(body).toContain('vercel rollback')
  })
})
