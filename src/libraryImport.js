import { daysOfWeek } from './constants';
import { anilistIdsOf } from './services/anilistService';
import { normalize } from './services/searchText';

// Claves con las que una misma obra puede aparecer en la biblioteca: el id de
// MAL, el de AniList y el título + año. No el id interno: entre fuentes puede
// chocar (AniList sin MAL pasa de 400000, el rango de TVMaze), y un anime
// guardado desde Kitsu tiene otro id interno pero suele compartir MAL o título.
const titleKey = (title, year) => {
  const t = normalize(title).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return t && year ? `t:${t}|${year}` : null;
};

export function workKeys(anime) {
  const { anilistId, malId } = anilistIdsOf(anime);
  return [
    malId ? `mal:${malId}` : null,
    anilistId ? `anilist:${anilistId}` : null,
    ...[anime.title, anime.titleEn, anime.titleOriginal].map((t) => titleKey(t, anime.year)),
  ].filter(Boolean);
}

const CATEGORIES = ['schedule', 'watchLater', 'watched'];

/**
 * Qué agrega una importación: lo que ya está en la semana, Después o Vistas
 * (por cualquiera de sus claves) se saltea y se cuenta en `known`, así nunca
 * queda la misma obra en dos listas. A la semana, cada anime va al día en que
 * sale (`airDay`) o, si no se sabe, al día con menos animes.
 */
export function planImport(data, { schedule = {}, watchLater = [], watchedList = [] }) {
  const taken = new Set();
  const take = (anime) => workKeys(anime).forEach((k) => taken.add(k));
  daysOfWeek.forEach((d) => (schedule[d] || []).forEach(take));
  watchLater.forEach(take);
  watchedList.forEach(take);

  const load = Object.fromEntries(daysOfWeek.map((d) => [d, (schedule[d] || []).length]));
  const lightestDay = () => daysOfWeek.reduce((best, d) => (load[d] < load[best] ? d : best), daysOfWeek[0]);

  const plan = { schedule: [], watchLater: [], watched: [], known: { schedule: 0, watchLater: 0, watched: 0 } };
  for (const category of CATEGORIES) {
    for (const anime of data[category] || []) {
      const keys = workKeys(anime);
      if (keys.some((k) => taken.has(k))) { plan.known[category] += 1; continue; }
      keys.forEach((k) => taken.add(k));
      if (category === 'schedule') {
        const day = daysOfWeek.includes(anime.airDay) ? anime.airDay : lightestDay();
        load[day] += 1;
        plan.schedule.push({ anime, day });
      } else {
        plan[category].push(anime);
      }
    }
  }
  plan.added = plan.schedule.length + plan.watchLater.length + plan.watched.length;
  plan.skipped = plan.known.schedule + plan.known.watchLater + plan.known.watched;
  return plan;
}
