// Registers the service worker in production, and unregisters it when the
// kill switch is on: VITE_SW=off at build time, or "sw-version": "off" in the
// catalogue manifest (flip it without a deploy of the app).
const unregisterAll = async () => {
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((entry) => entry.unregister()))
  if ('caches' in window) {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter(
          (name) => name.startsWith('tmdb-img-') || name.startsWith('catalog-'),
        )
        .map((name) => caches.delete(name)),
    )
  }
}

const remoteKill = async () => {
  try {
    const response = await fetch('/json/catalog/manifest.json', {
      cache: 'no-cache',
    })
    if (!response.ok) return false
    const manifest = (await response.json()) as { 'sw-version'?: string }
    return manifest['sw-version'] === 'off'
  } catch {
    return false
  }
}

export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const start = async () => {
    if (import.meta.env.VITE_SW === 'off' || (await remoteKill())) {
      await unregisterAll()
      return
    }
    await navigator.serviceWorker.register('/sw.js')
  }
  window.addEventListener('load', () => {
    void start().catch(() => undefined)
  })
}
