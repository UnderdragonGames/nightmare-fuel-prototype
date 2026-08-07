import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Chromium fires beforeinstallprompt before React mounts — stash it so the
// install banner can trigger the real prompt on tap (see ui/InstallBanner).
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__pwaInstallPrompt = e as unknown as typeof window.__pwaInstallPrompt
})

// PWA service worker (web push). Registration is safe to repeat; browsers
// without SW/push support simply skip it.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* push is a nice-to-have — never block the app on it */
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
