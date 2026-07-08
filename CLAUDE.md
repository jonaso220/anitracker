# CLAUDE.md

Guía de arquitectura para trabajar en AniTracker. Para uso general y features,
ver [README.md](README.md).

## Qué es

PWA de seguimiento de anime. React 19 + Vite 7, JavaScript (sin TypeScript),
CSS modular. Firebase (Auth + Firestore) opcional para sync. Sin router: la
navegación es por pestañas mediante estado en `App.jsx`.

## Comandos

- `npm run dev` — dev server (puerto 5173)
- `npm run build` — build a `dist/`
- `npm run test` — Vitest (jsdom). Un solo archivo: `npx vitest run src/test/utils.test.js`
- `npm run lint` — ESLint (debe quedar limpio antes de cerrar un cambio)

## Arquitectura

`App.jsx` es el componente raíz y orquestador: declara todo el estado (UI +
persistido), llama a los hooks de dominio y compone vistas + modales. No hay
store global ni context; el estado vive en `App.jsx` y baja por props.

### Capas

- **`hooks/`** — lógica por dominio, cada hook con una responsabilidad:
  - `usePersistedState` — `useState` espejado en localStorage; devuelve además
    un `ref` para leer el valor más reciente dentro de `useCallback` (clave para
    los snapshots de *undo*).
  - `useAnimeActions` — TODAS las mutaciones (agregar/mover/marcar/borrar,
    listas personalizadas, import). Recibe setters y refs por parámetro.
  - `useAnimeData` — búsqueda (debounce + `AbortController`) e info de emisión
    (cache en localStorage con TTL).
  - `useFirebase` — auth con Google + auto-sync a Firestore con cuidado de
    races (flags de carga, versionado de loads).
  - `useDirectory` — catálogo navegable ("Directorio") con filtros de AniList
    (género, demografía, formato, estado, año, temporada, orden) y paginado
    acumulativo con "cargar más".
  - `useDragDrop`, `useBulkMode`, `useBulkActions`, `useDiscovery`,
    `useToast`, `useServiceWorkerUpdate`.
- **`services/`** — una API por archivo (`jikanService`, `kitsuService`,
  `anilistService`, `tvmazeService`, `itunesService`, `tmdbService`,
  `wikipediaBridge`). `searchAnime.js` las orquesta en paralelo
  (`Promise.allSettled`), deduplica (mergeando streaming links / trailer del
  duplicado descartado), cachea consultas recientes (TTL 10 min) y rankea por
  relevancia, con *fallback* a Wikipedia si no hay buen match. `tmdbService`
  solo se activa con `VITE_TMDB_API_KEY` y expone además "dónde ver" por país
  (providers de JustWatch, cache localStorage 24 h) y trailers.
- **`components/`** — UI. `views/` = contenido de cada pestaña; `modals/` =
  diálogos.
- **`utils.js`** — helpers puros y testeables (`clean`, `filterByLocalSearch`,
  `getFilteredWatched`, `buildBackup`, `parseBackup`…).
- **`schemas/anime.js`** — normaliza la forma de un objeto "anime".
- **`i18n/`** — diccionario plano en español; helper `t(key, fallback)`.

### Datos persistidos (localStorage)

| Clave | Contenido |
|-------|-----------|
| `animeSchedule` | objeto `{ [día]: anime[] }` |
| `watchedAnimes` | array de vistos |
| `watchLater` | array de pendientes |
| `anitracker-custom-lists` | listas personalizadas |
| `anitracker-theme-v2` | booleano de tema (dark = true) |
| `anitracker-local-rev` | ISO de la última edición local (guardia anti-pisado en `useFirebase`) |

Los IDs de anime codifican la fuente: MAL `< 100000`, Kitsu `+100000`, AniList
`300000–400000`, TVMaze `+400000`, iTunes `+500000`, TMDB película
`+600000000` / serie `+900000000` (ver `useAnimeData` y cada service).

## Convenciones

- **CSS**: tokens de diseño en `src/styles/theme.css` (`--gradient-brand`,
  `--bg-surface`, `--text-primary`, `--radius-*`, etc.). Un archivo CSS por
  feature, importado desde `App.css`. **Usá los tokens existentes** — inventar
  nombres (`--gradient-primary`, `--card-bg`) falla en silencio (p. ej. texto con
  gradiente queda invisible).
- **Modales**: overlay `.modal-overlay` + panel con `.fade-in`, cierre con
  `.close-btn` y `Escape`, `role="dialog"` + `aria-modal`. Ver `DayPickerModal`
  o `BackupModal` como referencia.
- **Strings de UI** en español, vía `i18n/es.js`. Logs/errores de consola
  quedan inline en inglés.
- **Undo**: las acciones destructivas toman un snapshot (vía refs) y lo pasan a
  `showToast(msg, undoFn)`.
- **Async cancelable**: búsquedas y fetches usan `AbortController`; respetá el
  patrón al agregar llamadas de red.

## Tests

Vitest + Testing Library (jsdom), setup en `src/test/setup.js`. Al tocar
`utils.js` o un componente, actualizá/añadí el test correspondiente en
`src/test/`. Apuntá a helpers puros para la lógica y a render+queries para UI.

## Notas

- Sin router: pestaña activa = estado `activeTab` en `App.jsx`.
- Service worker hecho a mano en `public/sw.js`; la versión de cache se sube a
  mano (`CACHE_VERSION`).
- Firebase config admite override por env (`VITE_FIREBASE_*`, ver
  `.env.example`) con *fallback* al proyecto público compartido.
- TMDB es opcional: sin `VITE_TMDB_API_KEY` la fuente no aparece en la
  búsqueda ni se consultan providers.
