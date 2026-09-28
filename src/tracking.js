import { changeEpisode } from './libraryEdits';

export const seasonNumber = (anime) => Number.isInteger(anime.currentSeason) && anime.currentSeason > 0 ? anime.currentSeason : 1;

// Keep the scalar fields compatible with existing cards, backups and clients.
export function episodePatch(anime, value) {
  const currentEp = changeEpisode(0, value, anime.episodes);
  return {
    currentEp,
    ...(anime.seasonProgress ? { seasonProgress: {
      ...anime.seasonProgress,
      [seasonNumber(anime)]: { currentEp, episodes: anime.episodes || 0 },
    } } : {}),
  };
}

export function seasonPatch(anime, season, total) {
  const current = seasonNumber(anime);
  const seasonProgress = {
    ...anime.seasonProgress,
    [current]: { currentEp: anime.currentEp || 0, episodes: anime.episodes || 0 },
  };
  const saved = seasonProgress[season] || { currentEp: 0, episodes: 0 };
  const next = { ...saved, ...(total === undefined ? {} : { episodes: total }) };
  seasonProgress[season] = next;
  return { currentSeason: season, currentEp: next.currentEp, episodes: next.episodes, seasonProgress };
}

export function totalTrackedEpisodes(anime) {
  if (!anime.seasonProgress) return anime.currentEp || 0;
  return Object.entries(anime.seasonProgress).reduce((sum, [season, data]) =>
    sum + (Number(season) === seasonNumber(anime) ? 0 : (data.currentEp || 0)), anime.currentEp || 0);
}

// AniList tiene una entrada por temporada: si el usuario eligió una temporada
// posterior, la emisión que conocemos no es la suya. TVMaze/TMDB dicen de qué
// temporada es el episodio: vale si es la elegida (o si no eligió ninguna).
export const trackingAiring = (anime, airing) => {
  if (anime.paused || !airing) return undefined;
  if (airing.season) return !anime.currentSeason || anime.currentSeason === airing.season ? airing : undefined;
  return seasonNumber(anime) > 1 ? undefined : airing;
};

// Si los números de episodio de la emisión se pueden comparar con currentEp.
export const airingMatchesProgress = (anime, airing) => !airing?.season || airing.season === seasonNumber(anime);
