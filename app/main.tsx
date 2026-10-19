import { Analytics } from '@vercel/analytics/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './cmps/common/error-boundary'
import { TestGalleryApp } from './cmps/views/test-gallery'
import { animateDocTitleSuffix } from './utils/anim'
import { initTelemetry } from './utils/telemetry/init-telemetry'
import './styles.css'
import './light-theme.css'
import './cmps/views/test-gallery/shuffle-pro/shuffle-pro.css'

initTelemetry()

window.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('root')
  if (!rootElement) return

  // The sound audition page. The constant condition lets the build drop this
  // branch, and with it the whole lab and its audio candidates.
  if (
    import.meta.env.DEV &&
    window.location.pathname.startsWith('/sound-lab')
  ) {
    void import('./sound-lab/mount').then((lab) =>
      lab.mountSoundLab(rootElement),
    )
    return
  }

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <TestGalleryApp />
        <Analytics />
      </ErrorBoundary>
    </StrictMode>,
  )
  animateDocTitleSuffix()
})
