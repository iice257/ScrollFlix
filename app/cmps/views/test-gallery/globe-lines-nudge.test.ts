import { beforeEach, describe, expect, it } from 'vitest'
import {
  SESSION_PATH_LINES_STORAGE_KEY,
  createFlagSetting,
  sessionPathSetting,
} from './globe-lines'
import {
  hasSeenLineNudge,
  markLineNudgeSeen,
  pendingLineNudges,
} from './globe-lines-nudge'

beforeEach(() => {
  window.localStorage.clear()
})

describe('line settings', () => {
  it('start off when nothing was ever stored', () => {
    const setting = createFlagSetting('test:flag')
    expect(setting.get()).toBe(false)
    expect(setting.isStored()).toBe(false)
  })

  it('remember On and Off, and tell subscribers', () => {
    const setting = createFlagSetting('test:flag')
    let calls = 0
    const stop = setting.subscribe(() => {
      calls += 1
    })
    setting.set(true)
    expect(setting.get()).toBe(true)
    expect(window.localStorage.getItem('test:flag')).toBe('1')
    expect(setting.isStored()).toBe(true)
    setting.set(false)
    expect(window.localStorage.getItem('test:flag')).toBe('0')
    stop()
    setting.set(true)
    expect(calls).toBe(2)
    // A fresh read of the same key sees what was stored.
    expect(createFlagSetting('test:flag').get()).toBe(true)
  })

  it('adopt an explicit value on the old single switch, once', () => {
    window.localStorage.setItem('old', '1')
    const setting = createFlagSetting('new', 'old')
    expect(setting.isStored()).toBe(true)
    expect(setting.get()).toBe(true)
    expect(window.localStorage.getItem('new')).toBe('1')
    // Turning the old switch off later does not move this one.
    window.localStorage.setItem('old', '0')
    expect(createFlagSetting('new', 'old').get()).toBe(true)
  })

  it('adopt an explicit Off from the old switch', () => {
    window.localStorage.setItem('old', '0')
    const setting = createFlagSetting('new', 'old')
    expect(setting.get()).toBe(false)
    expect(setting.isStored()).toBe(true)
  })

  it('ignore junk in storage', () => {
    window.localStorage.setItem('new', 'maybe')
    const setting = createFlagSetting('new')
    expect(setting.get()).toBe(false)
    expect(setting.isStored()).toBe(false)
  })

  it('the session path starts off', () => {
    expect(sessionPathSetting.get()).toBe(false)
    expect(window.localStorage.getItem(SESSION_PATH_LINES_STORAGE_KEY)).toBe(
      null,
    )
  })
})

describe('line nudges', () => {
  const unset = { path: () => false, links: () => false }

  it('offer both tips on a first visit', () => {
    expect(pendingLineNudges(unset)).toEqual(['path', 'links'])
  })

  it('skip a setting that was already chosen', () => {
    expect(pendingLineNudges({ ...unset, links: () => true })).toEqual(['path'])
    expect(pendingLineNudges({ path: () => true, links: () => true })).toEqual(
      [],
    )
  })

  it('skip a tip that was already seen, and keep that for good', () => {
    expect(hasSeenLineNudge('path')).toBe(false)
    markLineNudgeSeen('path')
    expect(hasSeenLineNudge('path')).toBe(true)
    expect(hasSeenLineNudge('links')).toBe(false)
    expect(pendingLineNudges(unset)).toEqual(['links'])
  })
})
