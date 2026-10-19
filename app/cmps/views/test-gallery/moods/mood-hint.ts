// Whether the "blend two worlds" tip has been shown before. It is a courtesy,
// so storage that is missing or blocked just means the tip may show again.

const BLEND_HINT_KEY = 'wtw:mood-blend-hint:v1'

export const hasSeenBlendHint = () => {
  try {
    return window.localStorage.getItem(BLEND_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export const markBlendHintSeen = () => {
  try {
    window.localStorage.setItem(BLEND_HINT_KEY, '1')
  } catch {
    // Private mode or blocked storage: nothing to remember it with.
  }
}
