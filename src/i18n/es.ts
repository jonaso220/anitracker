/**
 * Spanish (es-ES / es-AR) strings.
 *
 * Flat dictionary keyed by dot-path, easy to extract for other locales. Values
 * can be a plain string or `{ one, other }` for plurals (see i18n/index.ts).
 * Only user-facing strings live here; log/console messages stay inline in their
 * source file.
 */
import type { Dictionary } from './index';

export const es: Dictionary = {
  'detail.open': 'Abrir ficha de {title}',
  'detail.originalTitle': 'Título original',
  'detail.fullTitle': 'Ver título completo',
  'detail.lessTitle': 'Contraer título',
  'detail.noSynopsis': 'Sin sinopsis.',
  'detail.readMore': 'Leer sinopsis completa',
  'detail.readLess': 'Leer menos',
  'detail.watch': 'Dónde ver',
  'detail.watchLink': 'Enlace para ver',
  'detail.watchNow': 'Ver ahora',
  'detail.watchOn': 'Ver en {platform}',
  'detail.otherLinks': 'Otros enlaces de {platform}',
  'detail.actions': 'Acciones de seguimiento',
  'detail.removeActions': 'Quitar de esta colección',
  'detail.unrated': 'Sin puntuar',
  'nav.schedule': 'Semana',
  'nav.watchLater': 'Después',
  'nav.watched': 'Vistas',
  'nav.lists': 'Listas',
  'nav.season': 'Temporada',
  'nav.directory': 'Directorio',
  'nav.top': 'Top',
  'nav.stats': 'Stats',

  'header.search': 'Buscar...',
  'header.import': 'Importar',
  'header.themeLight': 'Claro',
  'header.themeDark': 'Oscuro',
  'header.backup': 'Copia de seguridad',
  'header.logout': 'Salir',

  'onboarding.eyebrow': 'EMPEZÁ ACÁ',
  'onboarding.title': 'Armá tu semana',
  'onboarding.intro': 'Agregá lo que estás viendo al día en que lo mirás y AniTracker te muestra qué toca hoy, cuándo sale el próximo episodio y por dónde vas.',
  'onboarding.search': 'Buscar',
  'onboarding.searchHint': 'Anime, doramas de Viki, series y películas',
  'onboarding.season': 'Ver la temporada',
  'onboarding.seasonHint': 'Lo que se está emitiendo ahora',
  'onboarding.import': 'Importar de AniList',
  'onboarding.importHint': 'Traé tu lista con tu usuario',
  'onboarding.watchLater': 'Pasar de Después',
  'onboarding.otherDevice': '¿Ya la usabas en otro dispositivo?',
  'onboarding.login': 'Iniciá sesión con Google',
  'onboarding.restore': 'Restaurar una copia',
  'onboarding.loadingCloud': 'Trayendo tu semana…',

  'toast.undo': 'Deshacer',
  'toast.close': 'Cerrar notificación',

  'empty.noResults': 'Sin resultados',
  'empty.noAnime': 'No hay animes guardados',
  'empty.noWatched': 'No hay resultados',

  'action.addToSchedule': '📅 Semana',
  'action.addToWatchLater': '🕐 Después',
  'action.markAsWatched': '✓ Ya la vi',

  'bulk.selectAll': '☑ Seleccionar todo',
  'bulk.deselectAll': '☐ Deseleccionar',
  'bulk.delete': '🗑 Eliminar',
  'bulk.markWatched': '✓ Marcar vistos',
  'bulk.moveToWeek': '📅 Mover a semana',

  'season.today': 'HOY',
  'season.all': 'Todos',
  'season.lastEpisode': 'Último capítulo',
  'season.episode': 'Episodio',
  'season.premiere': 'Estreno',
  'season.continuing': 'Continúa',
  'season.emptyDay': 'Ningún anime se emite este día',

  'directory.searchPlaceholder': '🔍 Filtrar anime...',
  'directory.genre': 'Género',
  'directory.demography': 'Demografía',
  'directory.format': 'Tipo',
  'directory.status': 'Estado',
  'directory.year': 'Año',
  'directory.season': 'Temporada',
  'directory.sort': 'Ordenar por',
  'directory.clear': 'Limpiar filtros',
  'directory.viewGrid': 'Vista de cuadrícula',
  'directory.viewList': 'Vista de lista',
  'directory.loadMore': 'Cargar más',
  'directory.loading': 'Cargando…',
  'directory.empty': 'Sin resultados con esos filtros',

  'search.placeholder': 'Buscar anime o serie...',
  'search.partialNotice': 'Algunos resultados pueden faltar',
  'search.noResultsFor': 'Sin resultados para',
  'search.filterByName': '🔍 Filtrar por nombre...',

  'stats.inSchedule': 'En horario',
  'stats.finished': 'Terminados',
  'stats.watched': 'Vistos',
  'stats.pending': 'Pendientes',
  'stats.total': 'Total',
  'stats.avgRating': 'Rating medio',
  'stats.episodes': 'Episodios',
  'stats.dropped': 'Abandonados',
  'stats.composition': 'Composición de tu biblioteca',
  'stats.yourRatings': 'Tus puntuaciones',
  'stats.topGenres': 'Géneros favoritos',

  'backup.skippedFile': {
    one: 'Se omitirá 1 entrada inválida del archivo.',
    other: 'Se omitirán {count} entradas inválidas del archivo.',
  },
  'backup.animeCount': { one: '1 anime', other: '{count} animes' },
  'backup.autoHint': 'La app guarda una copia local por día y conserva las últimas {max}. Sirven para salir de un cambio accidental; no reemplazan a una copia descargada.',
};

export default es;
