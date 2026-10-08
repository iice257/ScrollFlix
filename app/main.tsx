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

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <TestGalleryApp />
      </ErrorBoundary>
    </StrictMode>,
  )
  animateDocTitleSuffix()
})
