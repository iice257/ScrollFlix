import { Analytics } from '@vercel/analytics/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './cmps/common/error-boundary'
import { TestGalleryApp } from './cmps/views/test-gallery'
import { installPerfProbe } from './cmps/views/test-gallery/perf-probe'
import { animateDocTitleSuffix } from './utils/anim'
import { initTelemetry } from './utils/telemetry/init-telemetry'
import './styles.css'
import './light-theme.css'
import './cmps/views/test-gallery/shuffle-pro/shuffle-pro.css'

initTelemetry()

// Frame-time probe for `npm run perf`; never created without ?perf=1.
if (new URLSearchParams(window.location.search).get('perf') === '1') {
  installPerfProbe()
}

window.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('root')
  if (!rootElement) return

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
