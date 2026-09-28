# CLAUDE.md

Guía de arquitectura para trabajar en AniTracker. Para uso general y features,
ver [README.md](README.md).

## Qué es

PWA de seguimiento de anime. React 19 + Vite 8, JavaScript (sin TypeScript),
CSS modular. Firebase (Auth + Firestore) opcional para sync. Sin router: la
navegación es por pestañas mediante estado en `App.jsx`.

## Comandos

- `npm run dev` — dev server (puerto 5173)
- `npm run build` — build a `dist/`
- `npm run test` — Vitest (jsdom). Un solo archivo: `npx vitest run src/test/utils.test.js`
- `npm run lint` — ESLint (debe quedar limpio antes de cerrar un cambio)

CI (`.github/workflows/ci.yml`) corre lint, tests y build en cada push a
`main` y en cada PR, con el Node de `.nvmrc`. Dependabot abre un PR mensual
agrupado con las actualizaciones menores.

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
    races (flags de carga, versionado de loads). Cada snapshot se resuelve con
    `syncMerge.js`: fusión a tres vías por anime contra la *base* (huella de lo
    último sincronizado en este dispositivo), así un cambio hecho en un solo
    lado nunca se pierde y el reloj del dispositivo no decide. Sin base (cuenta
    que nunca sincronizó acá, p. ej. datos de invitado) se fusiona todo.
    `cloudCodec.js` comprime la biblioteca con gzip si supera ~900 KB (límite
    de 1 MiB por documento); al cerrar sesión se sube lo pendiente primero.
    `cloudLoaded` avisa cuándo llegó el primer snapshot de la sesión: hasta
    entonces una semana vacía puede ser solo que todavía no bajó (App muestra
    "Trayendo tu semana…" en vez de la bienvenida `WeekOnboarding`).
  - `useDirectory` — catálogo navegable ("Directorio") con filtros de AniList
    (género, demografía, formato, estado, año, temporada, orden) y paginado
    acumulativo con "cargar más".
  - `useDragDrop`, `useBulkMode`, `useBulkActions`, `useDiscovery`,
    `useToast`, `useServiceWorkerUpdate`.
- **`services/`** — una API por archivo (`jikanService`, `kitsuService`,
  `anilistService`, `tvmazeService`, `itunesService`, `tmdbService`,
  `vikiService`, `wikipediaBridge`). `searchAnime.js` las orquesta en paralelo
  (`Promise.allSettled`, 6 s máximo por fuente, `onProgress` con resultados
  parciales), deduplica entre fuentes por `malId` o título principal + año +
  formato (nunca dentro de una misma fuente ni por sinónimos; mergea
  streaming links / trailer del duplicado descartado), cachea consultas
  completas (TTL 10 min) y rankea por relevancia ignorando artículos
  (`searchText.js`), con *fallback* a Wikipedia si no hay buen match: el
  título del artículo se usa para rankear, nunca se agrega a `altTitles`. `tmdbService`
  solo se activa con `VITE_TMDB_API_KEY` y expone además "dónde ver" por país
  (providers de JustWatch, cache localStorage 24 h) y trailers. `vikiService`
  (Rakuten Viki, dramas asiáticos) usa la API pública v4 sin key y completa
  cada resultado con su ficha (sinopsis en español, día de emisión → `airDay`,
  que `DayPickerModal` sugiere).
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
| `anitracker-directory-filters` | filtros elegidos en Directorio (sin el texto de búsqueda) |
| `anitracker-directory-view` | modo de vista de Directorio (`'grid'` / `'list'`) |
| `anitracker-season-cache` | copia de la temporada vigente (TTL 15 min, para abrir al instante) |
| `anitracker-directory-cache` | primera página del Directorio por filtros (TTL 30 min) |
| `anitracker-local-rev` | ISO de la última edición local (solo como *fallback* sin base de sync) |
| `anitracker-account-state` | biblioteca de la cuenta activa (dueño + datos + rev), leída al arrancar |
| `anitracker-account:<uid>` | biblioteca guardada de otra cuenta usada en este dispositivo |
| `anitracker-sync-base:<uid>` | huella `{ clave: hash }` de lo último sincronizado (base de la fusión) |

Los IDs de anime codifican la fuente: MAL `< 100000`, Kitsu `+100000`, AniList
`300000–400000`, TVMaze `+400000`, iTunes `+500000`, TMDB película
`+600000000` / serie `+900000000`, Viki `+700000000` (ver `useAnimeData` y cada service).

## Convenciones

- **CSS**: tokens de diseño en `src/styles/theme.css` (`--gradient-brand`,
  `--bg-surface`, `--text-primary`, `--radius-*`, etc.). Un archivo CSS por
  feature, importado desde `App.css`. **Usá los tokens existentes** — inventar
  nombres (`--gradient-primary`, `--card-bg`) falla en silencio (p. ej. texto con
  gradiente queda invisible).
- **Modales**: overlay `.modal-overlay` + panel con `.fade-in` y `.close-btn`;
  `role="dialog"` + `aria-modal` van en el panel, que recibe el ref de
  `useAccessibleDialog(onClose)`. El hook maneja Escape (solo el modal de
  arriba si hay varios), foco atrapado, fondo `inert` y scroll bloqueado. Ver
  `DayPickerModal` o `BackupModal` como referencia.
- **Strings de UI** en español, vía `i18n/es.js`. Logs/errores de consola
  quedan inline en inglés.
- **Undo**: las acciones destructivas toman un snapshot (vía refs) y lo pasan a
  `showToast(msg, undoFn)`. El snapshot cubre solo lo afectado
  (`captureEntry`/`restoreEntry` de `libraryEdits.js`), nunca la biblioteca
  entera: así el deshacer no pisa ediciones ni cambios sincronizados mientras
  el toast está visible.
- **Async cancelable**: búsquedas y fetches usan `AbortController`; respetá el
  patrón al agregar llamadas de red.
- **Props estables**: las vistas y `AnimeCard` están en `React.memo`, y `App`
  se re-renderiza con cada tecla del buscador. No pases callbacks ni objetos
  creados inline: usá `useCallback`/`useMemo` (o handlers que lean refs, como
  `useDragDrop`). `AnimeCard` llama `onClick(e, anime, day)` para que un solo
  callback sirva a todas las tarjetas. `src/test/renderPerf.test.jsx` cuenta
  renders y falla si esto se rompe.

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
- **Firebase fijado en `~12.14`**: desde 12.15 (Firestore 4.16) el chunk de
  Firebase suma ~60 kB gzip para las mismas funciones. Antes de subirlo,
  compará el tamaño de `firebase-*.js` en el build (Dependabot lo ignora).
- **Chunks**: Vite 8 usa Rolldown; `vendor` (React) y `firebase` se definen
  en `build.rolldownOptions.output.codeSplitting.groups` (ya no existe
  `manualChunks` como objeto).
