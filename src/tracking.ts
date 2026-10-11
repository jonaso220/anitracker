import type { AiringInfo, Anime, SeasonProgress } from './types/anime';
import { changeEpisode } from './libraryEdits';

export const seasonNumber = (anime: Anime): number =>
  typeof anime.currentSeason === 'number' && Number.isInteger(anime.currentSeason) && anime.currentSeason > 0
    ? anime.currentSeason
    : 1;

/** Campos que devuelven los patches de progreso. */
export interface ProgressPatch {
  currentEp: number;
  episodes?: number;
  currentSeason?: number;
  seasonProgress?: Record<number, SeasonProgress>;
}

// Keep the scalar fields compatible with existing cards, backups and clients.
export function episodePatch(anime: Anime, value: number): ProgressPatch {
  const currentEp = changeEpisode(0, value, anime.episodes);
  return {
    currentEp,
    ...(anime.seasonProgress ? { seasonProgress: {
      ...anime.seasonProgress,
      [seasonNumber(anime)]: { currentEp, episodes: anime.episodes || 0 },
    } } : {}),
  };
}

export function seasonPatch(anime: Anime, season: number, total?: number): ProgressPatch {
  const current = seasonNumber(anime);
  const seasonProgress: Record<number, SeasonProgress> = {
    ...anime.seasonProgress,
    [current]: { currentEp: anime.currentEp || 0, episodes: anime.episodes || 0 },
  };
  const saved = seasonProgress[season] || { currentEp: 0, episodes: 0 };
  const next = { ...saved, ...(total === undefined ? {} : { episodes: total }) };
  seasonProgress[season] = next;
  return { currentSeason: season, currentEp: next.currentEp, episodes: next.episodes, seasonProgress };
}

export function totalTrackedEpisodes(anime: Anime): number {
  if (!anime.seasonProgress) return anime.currentEp || 0;
  return Object.entries(anime.seasonProgress).reduce((sum, [season, data]) =>
    sum + (Number(season) === seasonNumber(anime) ? 0 : (data.currentEp || 0)), anime.currentEp || 0);
}

// AniList tiene una entrada por temporada: si el usuario eligió una temporada
// posterior, la emisión que conocemos no es la suya. TVMaze/TMDB dicen de qué
// temporada es el episodio: vale si es la elegida (o si no eligió ninguna).
export const trackingAiring = (anime: Anime, airing: AiringInfo | undefined): AiringInfo | undefined => {
  if (anime.paused || !airing) return undefined;
  if (airing.season) return !anime.currentSeason || anime.currentSeason === airing.season ? airing : undefined;
  return seasonNumber(anime) > 1 ? undefined : airing;
};

// Si los números de episodio de la emisión se pueden comparar con currentEp.
export const airingMatchesProgress = (anime: Anime, airing: AiringInfo | undefined): boolean =>
  !airing || !airing.season || airing.season === seasonNumber(anime);
