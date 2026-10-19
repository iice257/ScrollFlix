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

// The quiet "you keep coming back" line shows once, the first time a world is
// one landing from an Eclipse.
const ECLIPSE_HINT_KEY = 'wtw:mood-eclipse-hint:v1'

export const hasSeenEclipseHint = () => {
  try {
    return window.localStorage.getItem(ECLIPSE_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export const markEclipseHintSeen = () => {
  try {
    window.localStorage.setItem(ECLIPSE_HINT_KEY, '1')
  } catch {
    // Private mode or blocked storage: nothing to remember it with.
  }
}
