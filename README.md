# AniTracker

Una PWA para llevar el seguimiento de tu anime: organizá tus series por día de la
semana, mantené una lista de pendientes, registrá lo que ya viste, creá listas
personalizadas y descubrí lo nuevo de la temporada — todo con sincronización
opcional en la nube.

> Hecho con React 19 + Vite. Funciona offline e instalable como app (PWA).

## Funcionalidades

- **📅 Horario semanal** — organizá los animes que estás viendo por día, con
  drag & drop entre días e info de próximos episodios en emisión.
- **🕐 Ver después** — cola de pendientes con filtro por rating.
- **✓ Vistas** — historial de terminados/abandonados, con filtros y orden por
  fecha, rating o título.
- **📋 Listas personalizadas** — agrupá animes como quieras.
- **🔍 Búsqueda multi-fuente** — consulta en paralelo a MyAnimeList (Jikan),
  Kitsu, AniList, TVMaze, iTunes y TMDB (opcional), con deduplicado,
  cache de búsquedas recientes y *fallback* vía Wikipedia.
- **📺 Dónde ver** — links de streaming (Crunchyroll, Netflix, etc.) desde
  AniList/Kitsu, y con TMDB configurado, disponibilidad por país de películas
  y series (datos de JustWatch) + trailers de YouTube.
- **🌸 Descubrimiento** — animes de la temporada actual y top histórico.
- **📊 Estadísticas** — composición de tu biblioteca, distribución de tus
  puntuaciones y géneros favoritos.
- **💾 Copia de seguridad** — exportá/importá todos tus datos en un `.json`.
- **📥 Importar desde AniList** — traé tu lista por nombre de usuario.
- **☁️ Sync con Firebase** — login con Google y guardado en la nube (opcional).
- **🌓 Tema claro/oscuro** y **📱 PWA** instalable con soporte offline.

## Stack

| Capa | Tecnología |
|------|-----------|
| UI | React 19 |
| Build / dev | Vite 7 |
| Tests | Vitest + Testing Library (jsdom) |
| Lint | ESLint 9 |
| Backend opcional | Firebase (Auth + Firestore) |
| Datos de anime | AniList, Jikan (MAL), Kitsu, TVMaze, iTunes |
| Películas y series | TMDB (opcional, con disponibilidad por país vía JustWatch) |

## Cómo empezar

Requisitos: Node.js 18+ y npm.

```bash
npm install      # instalar dependencias
npm run dev      # servidor de desarrollo (http://localhost:5173)
```

### Scripts

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Previsualizar la build de producción |
| `npm run test` | Correr la suite de tests (Vitest) |
| `npm run lint` | Lint con ESLint |

## Configuración (Firebase)

La sincronización en la nube es **opcional**. La app funciona sin configurar
nada: usa por defecto un proyecto Firebase público compartido.

Para apuntar a **tu propio** proyecto Firebase, copiá `.env.example` a
`.env.local` y completá tus valores:

```bash
cp .env.example .env.local
```

Las reglas de Firestore están versionadas en `firestore.rules`. Desplegalas en
tu proyecto antes de habilitar la sincronización:

```bash
firebase deploy --only firestore:rules
```

> Las claves Web de Firebase **no son secretas** — la seguridad se hace con
> Firebase Security Rules, no ocultando estos valores. Aun así, `.env*` está en
> `.gitignore`.

### TMDB (películas y series)

Para que la búsqueda incluya películas y series con metadatos en español,
disponibilidad por país (Netflix, Disney+, Max…) y trailers, registrate gratis
en [TMDB](https://www.themoviedb.org/settings/api) y agregá a tu `.env.local`:

```bash
VITE_TMDB_API_KEY=tu_api_key_o_token_v4
```

Sin la clave, la app funciona igual pero la búsqueda de películas/series queda
limitada a TVMaze e iTunes. La disponibilidad por plataforma la provee
JustWatch vía TMDB.

## Estructura del proyecto

```
src/
├── App.jsx              # Componente raíz: estado, composición de vistas y modales
├── components/          # Componentes de UI
│   ├── views/           # Vistas de cada pestaña (Schedule, WatchLater, Watched…)
│   └── modals/          # Diálogos (búsqueda, detalle, backup, import…)
├── hooks/               # Lógica por dominio (useFirebase, useAnimeData, useAnimeActions…)
├── services/            # Integraciones con cada API de anime
├── styles/              # CSS modular por feature (tokens en theme.css)
├── i18n/                # Strings en español (preparado para más locales)
├── schemas/            # Normalización de la forma de un "anime"
├── utils.js             # Helpers puros (filtros, backup, etc.)
└── constants.js         # Días de la semana, sanitización de URLs, etc.
public/
└── sw.js                # Service worker (cache de app shell e imágenes)
```

Más detalle de arquitectura para contribuir: ver [CLAUDE.md](CLAUDE.md).

## PWA / Service worker

El service worker (`public/sw.js`) cachea el app shell (network-first) y las
imágenes (stale-while-revalidate), y deja siempre pasar a red las llamadas a las
APIs. Cuando hay una versión nueva, la app muestra un banner para actualizar sin
recargar a la fuerza.

## Tests

```bash
npm run test
```

Cobertura sobre utils, constants, schemas, services, hooks y componentes con
Vitest + Testing Library.
