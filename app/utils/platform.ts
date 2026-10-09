type PlatformNavigator = Pick<Navigator, 'userAgent' | 'platform'> & {
  maxTouchPoints?: number
}

// iPhone, iPod and iPad, including iPadOS which reports itself as a Mac with
// a touch screen.
export const detectIOS = (nav: PlatformNavigator | undefined) => {
  if (!nav) return false
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1
}

export const isIOS = () =>
  detectIOS(typeof navigator === 'undefined' ? undefined : navigator)

const BROWSER_CHROME_COLORS = {
  dark: '#000000',
  light: '#f7f0e1',
} as const

// Paints the area behind the browser's own bars (the iOS status bar and tab
// bar, the Android address bar) in the colour of the current theme, so they
// read as part of the site instead of a separate strip.
export const syncBrowserChrome = (theme: 'dark' | 'light') => {
  if (typeof document === 'undefined') return
  const color = BROWSER_CHROME_COLORS[theme]
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', color)
  document.documentElement.style.backgroundColor = color
  document.documentElement.style.colorScheme = theme
}
