import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { reloadForNewDeploy } from './chunkReload.js'
import { skipToContent } from './skipLink.js'
import { localeReady, t } from './i18n'

// Al volver de AniList el token llega en el hash: se guarda y se saca de la URL
// antes de que el router (o el reporte de errores) lea la dirección. El módulo
// solo se baja en ese caso.
const anilistReturn = /[#&]access_token=/.test(window.location.hash)
  ? import('./services/anilistAuth.js').then((m) => { m.captureAnilistToken() }).catch(() => {})
  : Promise.resolve()

// Vite avisa cuando falla un import dinámico (chunk de un deploy anterior).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewDeploy()) event.preventDefault()
})

// `localeReady` nunca falla: espera el diccionario (inglés va en un chunk
// aparte) para que el primer render ya salga en el idioma correcto.
Promise.all([localeReady, anilistReturn]).then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <a className="skip-link" href="#main-content" onClick={skipToContent}>{t('app.skipToContent', 'Saltar al contenido')}</a>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
})
