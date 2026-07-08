---
name: verify
description: Cómo verificar cambios de AniTracker end-to-end corriendo la app real (Vite + Playwright con APIs mockeadas por interceptación de red).
---

# Verificar AniTracker en runtime

La superficie es el navegador (PWA). Las APIs externas (Jikan, Kitsu, AniList,
TVMaze, iTunes, TMDB, Wikipedia, traducción) suelen estar bloqueadas en
entornos sandboxeados: mockearlas con `page.route()` de Playwright.

## Receta

```bash
# 1. Dev server (VITE_* del entorno activan features opcionales, ej. TMDB)
VITE_TMDB_API_KEY=testkey123 npm run dev -- --port 5173 --strictPort

# 2. Driver (playwright-core + Chromium preinstalado en /opt/pw-browsers/chromium)
#    npm i playwright-core en un directorio temporal, NO en el repo.
```

```js
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ locale: 'es-AR' }); // región TMDB sale de navigator.language
```

## Gotchas que ya nos mordieron

- **El service worker se registra también en dev** y hace fetch en su propio
  contexto para hosts que NO están en `NO_CACHE_HOSTS` de `public/sw.js` —
  esas requests **bypassean `page.route()`**. Si una API nueva no se
  intercepta, primero revisar esa lista (y agregar el host ahí, que además
  es lo correcto para prod).
- **Cerrar modales con `.close-btn`**, no con `Escape`: el listener de Escape
  vive en el overlay y no dispara si el foco quedó en `body`.
- Selectores útiles: `[aria-label="Abrir buscador de anime"]`,
  `input[placeholder="Buscar anime o serie..."]`, `.search-result-item`,
  `.source-badge`, tabs `button[role="tab"]:has-text("Después")`,
  `.anime-card`, `.detail-modal`.
- Mockear también `translate.googleapis.com` / `api.mymemory.translated.net`
  (modal de detalle traduce sinopsis en inglés) o usar sinopsis en español
  en los fixtures.
- AniList es POST a `graphql.anilist.co` (búsqueda, airing, temporada): un
  solo route puede responder todo si el fixture es de búsqueda.

## Flujos que valen la pena

1. Buscar (hint de fuentes en `.search-hint`) → resultados con badges por
   fuente, dedupe entre MAL/Kitsu/AniList.
2. Agregar a "Después" → abrir card → modal detalle: sección "Dónde ver"
   (chips de streaming, providers TMDB + selector de región), trailer.
3. Probes: API caída (fulfill 429/abort) → aviso `.search-partial-notice`
   sin crash; cambio de región TMDB → refetch; reload → cache localStorage.
