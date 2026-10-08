import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

function start() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// Development only: `?preview=1` on any app address answers /api/* from canned
// data, so a real page can be opened and clicked through without a backend
// (the local server's .env points at the production database, so it is never
// run here). The build replaces `import.meta.env.DEV` with `false`, so neither
// the branch nor the module it imports ships.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
  void import('./dev/previewApi').then(({ installPreviewApi }) => {
    installPreviewApi()
    start()
  })
} else {
  start()
}
