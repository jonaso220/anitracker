/**
 * Tipos del dominio de AniTracker.
 *
 * `Anime` es la forma canónica que garantiza `normalizeAnime` (schemas/anime.ts).
 * Los campos opcionales son los que agregan después las capas de UI, la agenda,
 * el descubrimiento o el estado de seguimiento por temporadas.
 */

/** Link de streaming ("Dónde ver"). */
export interface StreamingLink {
  site: string;
  url: string;
  language: string;
}

/** Progreso de una temporada concreta dentro de `seasonProgress`. */
export interface SeasonProgress {
  currentEp: number;
  episodes: number;
}

/** Datos del próximo episodio, con la forma que consumen tarjetas y agenda. */
export interface AiringInfo {
  episode: number;
  /** Timestamp unix en segundos. */
  airingAt: number;
  timeUntilAiring: number;
  isToday: boolean;
  isTomorrow: boolean;
  isThisWeek: boolean;
  hasAired: boolean;
  totalEpisodes: number | null;
  title: string;
  /** Fuentes de series (TVMaze, TMDB) numeran por temporada. */
  season?: number;
  /** Con solo fecha (TMDB) no se sabe la hora. */
  dateOnly?: boolean;
}

/**
 * Timestamps crudos que adjuntan los servicios de Temporada/Directorio en
 * `_airing`, antes de resolverse a `AiringInfo`. El nombre es histórico.
 */
export interface RawAiring {
  nextAiringAt?: number;
  lastAiredAt?: number;
  episode?: number;
  season?: number;
}

/** Fechas del servicio de descubrimiento/temporada sin resolver. */
export interface SeasonScheduleDate {
  episode?: number;
  airingAt?: number;
  timeUntilAiring?: number;
}

/**
 * Anime canónico. Los primeros campos los garantiza `normalizeAnime`; los
 * últimos son opcionales y los agrega la app en distintas capas.
 */
export interface Anime {
  // --- Garantizados por normalizeAnime ---
  id: number;
  source: string;
  sourceId: string;
  sourceKey: string;
  malId: number | null;
  title: string;
  titleOriginal: string;
  titleJp: string;
  titleEn: string;
  altTitles: string[];
  image: string;
  imageSm: string;
  genres: string[];
  synopsis: string;
  rating: number;
  episodes: number | null;
  status: string;
  year: string;
  type: string;
  malUrl: string;
  watchLink: string;
  trailerUrl: string;
  streamingLinks: StreamingLink[];
  airDay: string;
  currentEp: number;
  userRating: number;
  finished: boolean;
  finishedDate?: string;
  droppedDate?: string;

  // --- Seguimiento por temporadas / pausa ---
  currentSeason?: number;
  seasonProgress?: Record<number, SeasonProgress>;
  paused?: boolean;

  // --- Emisión resuelta para la UI (useAnimeData) ---
  airing?: AiringInfo;
  nextAiringEpisode?: AiringInfo;

  // --- Flags internos de UI (se quitan con `clean` antes de persistir) ---
  _day?: string;
  _isWatchLater?: boolean;
  _isWatched?: boolean;
  _isSeason?: boolean;
  _isDirectory?: boolean;
  _isCustomList?: boolean;
  _customListId?: string | number;
  _airing?: RawAiring;
  _continuing?: boolean;
  _relation?: string;
  _recommendationScore?: number;
  _recommendationReason?: string;
  _pendingEpisodes?: number;
  _nextToWatch?: number;
}

/**
 * Entrada "anime-like": lo que aceptan las funciones que no exigen la forma
 * completa (cachés, resultados crudos de APIs, backups ya validados). Siempre
 * se puede leer un `id`.
 */
export type AnimeLike = Partial<Anime> & { id?: number | string };

/** Lista personalizada. */
export interface CustomList {
  id: string | number;
  name: string;
  items: Anime[];
}

/** Semana: anime agrupados por día (Lunes…Domingo). */
export type Schedule = Record<string, Anime[]>;

/** Biblioteca completa: lo que se persiste, sincroniza y respalda. */
export interface Library {
  schedule: Schedule;
  watchedList: Anime[];
  watchLater: Anime[];
  customLists: CustomList[];
}

/**
 * Biblioteca cruda (nube, localStorage, backups sin validar): solo se aceptan
 * claves del dominio, con valores todavía sin tipar.
 */
export type LibraryInput = Partial<Record<keyof Library, unknown>>;

/** Resultado de `parseBackup`: biblioteca validada + cuántas entradas se descartaron. */
export interface ParsedBackup extends Library {
  skipped: number;
}
