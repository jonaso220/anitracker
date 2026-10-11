# CLAUDE.md

Guía de arquitectura para trabajar en AniTracker. Para uso general y features,
ver [README.md](README.md).

## Qué es

PWA de seguimiento de anime. React 19 + Vite 8, CSS modular. Firebase
(Auth + Firestore) opcional para sync. La navegación es por pestañas y la
pestaña activa vive en el **hash de la URL** (`#/vistas`), vía `router.ts` +
`useHashRoute` (ver «Rutas» más abajo).

El núcleo de lógica pura está en TypeScript (modo `strict`); el resto de la app
sigue en JavaScript y se migra de a poco (ver «TypeScript» más abajo).

## Comandos

- `npm run dev` — dev server (puerto 5173)
- `npm run build` — build a `dist/`
- `npm run test` — Vitest (jsdom). Un solo archivo: `npx vitest run src/test/utils.test.ts`
- `npm run typecheck` — `tsc --noEmit` sobre el núcleo en TypeScript
- `npm run lint` — ESLint (debe quedar limpio antes de cerrar un cambio)
- `npm run size` — presupuesto de tamaño del bundle (requiere `npm run build`)

CI (`.github/workflows/ci.yml`) corre lint, typecheck, tests, build y size en
cada push a `main` y en cada PR, con el Node de `.nvmrc`. Dependabot abre un PR
mensual agrupado con las actualizaciones menores.

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
    (cache en localStorage con TTL). La emisión sale de AniList/MAL, Viki,
    TVMaze (fecha y hora exactas, de a tandas de 18 por su límite) y TMDB
    (solo fecha: `dateOnly`), cada una por su id de fuente vía `sourceKey`.
    TVMaze y TMDB numeran por temporada (`season` en la info): la tarjeta
    muestra "T38 · Ep. 2" y la agenda solo cuenta pendientes si coincide con
    la temporada que se sigue (`airingMatchesProgress` en `tracking.ts`).
  - `useFirebase` — compositor de la auth y el sync; mantiene la API pública
    que consume `App.jsx`. La lógica está partida en dos hooks, cada uno con una
    responsabilidad:
    - `useCloudSync` — suscripción a Firestore, guardado y conflictos. Cada
      snapshot se resuelve con `syncMerge.ts`: fusión a tres vías por anime
      contra la *base* (huella de lo último sincronizado en este dispositivo),
      así un cambio hecho en un solo lado nunca se pierde y el reloj del
      dispositivo no decide. La base guarda también una huella **por campo**
      (`f|clave|campo`), así que dos dispositivos que tocaron campos distintos
      se fusionan solos; si tocaron el mismo campo, o hay un borrado contra una
      edición, la sincronización **se pausa** y el usuario elige (`SyncStatus` →
      `chooseSyncConflicts`, con checkpoint y export en `syncRecovery.js`).
      El guardado pasa por `cloudSync.js`, que lee y fusiona **dentro de una
      transacción** y sella `syncProtocol`/`syncRevision` en cada escritura. Sin
      base (cuenta que nunca sincronizó acá, p. ej. datos de invitado) se
      fusiona todo. `cloudCodec.ts` comprime la biblioteca con gzip si supera
      ~900 KB (límite de 1 MiB por documento); al cerrar sesión se sube lo
      pendiente primero. `cloudLoaded` avisa cuándo llegó el primer snapshot de
      la sesión: hasta entonces una semana vacía puede ser solo que todavía no
      bajó (App muestra "Trayendo tu semana…" en vez de la bienvenida
      `WeekOnboarding`).
    - `useAuth` — estado y acciones de la sesión de Google (`loginWithGoogle`).
    `useFirebase` se queda con lo que necesita a los dos a la vez: el ciclo de
    vida de la sesión (`onAuthStateChanged` → suscribir/desuscribir la nube) y
    `logout` (sube lo pendiente antes de cortar sesión). `firebaseClient.js`
    aporta la config, la inicialización perezosa del SDK (con `runTransaction`),
    `authMessage` y `serializeData`.
  - `useDirectory` — catálogo navegable ("Directorio") con filtros de AniList
    (género, demografía, formato, estado, año, temporada, orden) y paginado
    acumulativo con "cargar más".
  - `useDragDrop`, `useBulkMode`, `useBulkActions`, `useDiscovery`,
    `useToast`, `useServiceWorkerUpdate`, `useHashRoute` (ver «Rutas»).
- **`services/`** — una API por archivo (`jikanService`, `kitsuService`,
  `anilistService`, `tvmazeService`, `itunesService`, `tmdbService`,
  `vikiService`, `wikipediaBridge`). `searchAnime.js` las orquesta en paralelo
  (`Promise.allSettled`, 6 s máximo por fuente, `onProgress` con resultados
  parciales), deduplica entre fuentes por `malId` o título principal + año +
  formato (nunca dentro de una misma fuente ni por sinónimos; mergea
  streaming links / trailer del duplicado descartado), cachea consultas
  completas (TTL 10 min) y rankea por relevancia ignorando artículos
  (`searchText.ts`), con *fallback* a Wikipedia si no hay buen match: el
  título del artículo se usa para rankear, nunca se agrega a `altTitles`. `tmdbService`
  solo se activa con `VITE_TMDB_API_KEY` y expone además "dónde ver" por país
  (providers de JustWatch, cache localStorage 24 h) y trailers. `vikiService`
  (Rakuten Viki, dramas asiáticos) usa la API pública v4 sin key y completa
  cada resultado con su ficha (sinopsis en español, día de emisión → `airDay`,
  que `DayPickerModal` sugiere).
- **`components/`** — UI. `views/` = contenido de cada pestaña; `modals/` =
  diálogos.
- **`utils.ts`** — helpers puros y testeables (`clean`, `filterByLocalSearch`,
  `getFilteredWatched`, `buildBackup`, `parseBackup`…).
- **`schemas/anime.ts`** — normaliza la forma de un objeto "anime".
- **`types/anime.ts`** — tipos del dominio (`Anime`, `CustomList`, `Library`,
  `AiringInfo`, `Schedule`…): la fuente de verdad de la forma de un anime.
- **`router.ts`** — mapeo pestaña ↔ hash de la URL (ver «Rutas»).
- **`autoBackup.ts`** — copias automáticas de la biblioteca en IndexedDB
  (ver «Copias automáticas»); enganchado por `useAutoBackup`.
- **`errorReporter.ts`** — reporte de errores opt-in por `VITE_ERROR_REPORT_URL`
  (ver «Reporte de errores»).
- **`i18n/`** — `index.ts` es el motor (`t(key, fallback, params)` con
  interpolación `{name}`, plurales `{ one, other }` por `count` y registro de
  locales); `es.ts` es el diccionario tipado.

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
sin MAL `300000 + id` si el id de AniList es `< 100000` y `800000000 + id` desde
ahí (antes caía en el rango de TVMaze), TVMaze `+400000`, iTunes `+500000`, TMDB
película `+600000000` / serie `+900000000`, Viki `+700000000`. La identidad real
va por `sourceKey` (`anilist:N`, `tvmaze:N`…), nunca por el rango.
`idMigration.ts` pasa al rango nuevo los AniList guardados con el id viejo al
leer localStorage, cuentas guardadas, snapshots de la nube y copias de
seguridad (determinista, idempotente; si queda la misma obra dos veces, gana
la de más progreso).

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
  (`captureEntry`/`restoreEntry` de `libraryEdits.ts`), nunca la biblioteca
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

## TypeScript

Migración **incremental**: los módulos de lógica pura ya son `.ts` y se chequean
con `strict`; los `.js`/`.jsx` siguen sin chequear (`allowJs: true`,
`checkJs: false` en `tsconfig.json`).

Ya migrados: `constants`, `types/anime`, `schemas/anime`, `libraryEdits`,
`tracking`, `agenda`, `services/searchText`, `idMigration`, `syncMerge`,
`cloudCodec`, `router`, `autoBackup`, `errorReporter`, `i18n` y `utils`.

**Para convertir un archivo**: cambiale la extensión a `.ts` (o `.tsx`) y
arreglá lo que reporte `npm run typecheck`. Los imports son sin extensión y
Vite/Vitest resuelven `.ts` solos, así que no hay que tocar a quien lo consume.
El lint cubre `.ts`/`.tsx` con typescript-eslint.

Reglas de estilo al migrar:

- **Nada de `any` suelto.** Si un valor llega dinámico, usá `unknown` y angostalo
  con un type guard (ver `isPlainObject` en `utils.ts`).
- **El cast es el último recurso**, y va con un comentario que explique por qué
  es seguro (ver `migrateAnime` en `idMigration.ts` o `pipe` en `cloudCodec.ts`).
- **El dominio vive en `types/anime.ts`**: una entrada laxa es `AnimeLike`, una
  biblioteca sin validar es `LibraryInput`. Agregá campos ahí en vez de
  inventar tipos locales.

## Rutas

La pestaña activa **es la URL**: `router.ts` mapea pestaña ↔ hash y
`useHashRoute` mantiene el estado de React en sync.

| Pestaña | Hash |
|---------|------|
| Semana | `#/semana` |
| Después | `#/despues` |
| Vistas | `#/vistas` |
| Listas | `#/listas` |
| Temporada | `#/temporada` |
| Directorio | `#/directorio` |

- Se usa **hash** y no la History API a propósito: la app es estática, el hash
  no necesita rewrites del servidor ni toca el service worker, y se comporta
  igual en la PWA instalada. **No agregues rutas por path** sin resolver antes
  el fallback del servidor y el del service worker.
- Un hash vacío o desconocido cae en Semana, y `useHashRoute` lo
  **canonicaliza** con `replaceState` (sin entrada de historial) para que la
  barra de direcciones siempre tenga un enlace compartible.
- Los slugs son **estables**: cambiarlos rompe los enlaces ya compartidos.
- Cambiar de pestaña deja rastro en el historial, así el botón atrás funciona.
- La carga de datos va en un efecto sobre `activeTab` y no en el handler del
  clic, para que entrar por `#/directorio` también cargue el catálogo.
- Tests: `src/test/router.test.js` (mapeo y hook) y
  `src/test/deepLinks.test.jsx` (la app entera abierta en un hash). Los tests
  que renderizan `App` **deben resetear el hash** entre casos
  (`window.history.replaceState(null, '', '/')`), o la navegación de un test se
  filtra al siguiente.

## Tests

Vitest + Testing Library (jsdom), setup en `src/test/setup.js`. Al tocar
`utils.ts` o un componente, actualizá/añadí el test correspondiente en
`src/test/`. Apuntá a helpers puros para la lógica y a render+queries para UI.

## Notas

- **Rutas**: ver la sección «Rutas» más abajo; no hay estado `activeTab` suelto.
- **Copias automáticas**: `useAutoBackup` guarda una copia de la biblioteca en
  **IndexedDB** (`anitracker-backups`) como máximo una vez por día y por cuenta,
  conservando las últimas 3; se listan y restauran desde el modal de copia de
  seguridad. Va en IndexedDB y no en localStorage a propósito: ahí vive el dato
  vivo y comparten cuota, así que un respaldo grande podría dejar a la app sin
  poder guardar. Todo es best-effort (sin IndexedDB es un no-op) y **no**
  reemplaza a descargar una copia, que es lo único que sobrevive a un borrado de
  datos del sitio.
- **Reporte de errores**: apagado salvo que exista `VITE_ERROR_REPORT_URL`.
  Engancha `error`, `unhandledrejection` y el `ErrorBoundary` (un error de chunk
  viejo **no** se reporta: pasa en cada deploy y taparía los errores reales).
  Deduplica y corta a 10 reportes por sesión. Se implementó sin SDK para no
  sumar ~40 kB gzip por una función que puede estar apagada; si se quiere Sentry,
  el camino es cargar su SDK de forma diferida cuando haya DSN.
- **Idiomas**: hoy solo `es`. Para agregar otro: crear el diccionario tipado y
  registrarlo con `registerLocale(id, dict)`; las claves nuevas conviene
  escribirlas ya con `{placeholders}` y `{ one, other }` en vez de concatenar.
- Service worker hecho a mano en `public/sw.js`; la versión de cache se sube a
  mano (`CACHE_VERSION`). Las portadas van a `anitracker-images` (sin versión,
  sobrevive a los deploys, máx. 500): primero cache, pedidas con CORS para
  poder guardarlas. Nunca guardar respuestas opacas (~7 MB de cuota cada una
  en Chrome: el navegador podría borrar todos los datos del sitio). Tests en
  `src/test/serviceWorker.test.js` (ejecutan el archivo real con fakes).
- Firebase config admite override por env (`VITE_FIREBASE_*`, ver
  `.env.example`) con *fallback* al proyecto público compartido.
- TMDB es opcional: sin `VITE_TMDB_API_KEY` la fuente no aparece en la
  búsqueda ni se consultan providers.
- **Protocolo de sync** (`SYNC_PROTOCOL` en `cloudSync.js`): cada documento
  lleva `syncProtocol` y un `syncRevision` monotónico. Un documento con un
  protocolo **más nuevo** se rechaza en vez de degradarlo, y una revisión
  inválida o agotada aborta el guardado; subí `SYNC_PROTOCOL` solo si cambia la
  forma del documento de manera incompatible. Al leer, la base vieja (v28, sin
  huellas por campo) exige revisión antes de escribir: `src/test/fixtures/`
  guarda una copia congelada para probar esa compatibilidad.
- **Firebase fijado en `~12.14`**: desde 12.15 (Firestore 4.16) el chunk de
  Firebase suma ~60 kB gzip para las mismas funciones (Dependabot lo ignora).
  Ya no hace falta comparar a mano: `npm run size` (y CI) falla si el chunk de
  Firebase se pasa del presupuesto de `scripts/check-bundle-size.mjs`.
  **Y subirlo tampoco arregla la auditoría**: incluso el último
  `@firebase/firestore` (4.18.0) sigue pidiendo `@grpc/grpc-js: ~1.9.0`, que es
  justo la versión vulnerable. Pasar a 13.x cuesta ~60 kB y no cierra el aviso.
- **`overrides` de `@grpc/grpc-js` (`^1.14.6`)**: está solo para que
  `npm audit` quede limpio. `@grpc/grpc-js` es el transporte gRPC del SDK de
  Firestore para **Node**: el bundle del navegador usa WebChannel y no incluye
  ese código (verificado: no aparece en `dist/assets`), y los dos avisos son de
  comportamiento de **servidor** gRPC (`getAuthContext` y mensajes de error de
  los handlers), que esta PWA nunca ejecuta. El override deja el bundle
  byte-idéntico; si en algún momento se agrega código Node que use Firestore,
  revisar esto antes.
- **No corras `npm audit fix --force`**: el "fix" que propone es instalar
  `firebase@9.14.0`, un downgrade de tres majors.
- **Chunks**: Vite 8 usa Rolldown; `vendor` (React) y `firebase` se definen
  en `build.rolldownOptions.output.codeSplitting.groups` (ya no existe
  `manualChunks` como objeto).
