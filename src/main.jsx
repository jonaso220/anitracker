import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { reloadForNewDeploy } from './chunkReload.js'
import { skipToContent } from './skipLink.js'
import { t } from './i18n'

// Vite avisa cuando falla un import dinámico (chunk de un deploy anterior).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewDeploy()) event.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <a className="skip-link" href="#main-content" onClick={skipToContent}>{t('app.skipToContent', 'Saltar al contenido')}</a>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
