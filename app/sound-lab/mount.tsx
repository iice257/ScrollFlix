import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { SoundLab } from './sound-lab'

// Mounts the audition page in place of the site. Only ever imported behind
// import.meta.env.DEV, so a production build contains none of it.
export const mountSoundLab = (root: HTMLElement) => {
  document.title = 'Sound lab'
  createRoot(root).render(
    <StrictMode>
      <SoundLab />
    </StrictMode>,
  )
}
