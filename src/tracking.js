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

// A manually selected later season has no matching broadcast metadata yet.
export const trackingAiring = (anime, airing) => anime.paused || seasonNumber(anime) > 1 ? undefined : airing;
