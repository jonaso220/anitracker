import type { AiringInfo, Anime, Schedule } from './types/anime';
import { trackingAiring, airingMatchesProgress } from './tracking';
import { daysOfWeek } from './constants';

/** Anime dentro de la agenda: lleva su día y cuántos episodios hay pendientes. */
export interface AgendaItem extends Anime {
  _day: string;
  _nextToWatch: number;
  _pendingEpisodes: number;
}

export interface AgendaBucket {
  day: string;
  dayIndex: number;
  distance: number;
  items: AgendaItem[];
}

export interface Agenda {
  active: AgendaBucket | null;
  upcoming: AgendaItem[];
  todayIndex: number;
}

const getTodayIndex = (now: Date): number => (now.getDay() + 6) % 7;

const getWatchableEpisode = (anime: Anime): number => {
  const currentEp = anime.currentEp || 0;
  const airing = anime.airing;

  // Una emisión de otra temporada (T38 cuando se sigue la 1) no dice nada de
  // cuántos episodios hay pendientes.
  if (airing?.episode && airingMatchesProgress(anime, airing)) {
    // AniList gives us the next broadcast. Episodes before it are already
    // watchable; an episode scheduled for today also belongs in today's plan.
    const releasedThrough = airing.isToday || airing.hasAired
      ? airing.episode
      : airing.episode - 1;
    return Math.max(currentEp, releasedThrough);
  }

  if (anime.episodes) return Math.min(anime.episodes, currentEp + 1);
  return currentEp + 1;
};

const compareAgendaItems = (a: AgendaItem, b: AgendaItem): number => {
  const aUnstarted = (a.currentEp || 0) === 0;
  const bUnstarted = (b.currentEp || 0) === 0;
  if (aUnstarted !== bUnstarted) return aUnstarted ? 1 : -1;

  const pendingDiff = b._pendingEpisodes - a._pendingEpisodes;
  if (pendingDiff) return pendingDiff;

  const aAiringAt = a.airing?.airingAt ?? Number.MAX_SAFE_INTEGER;
  const bAiringAt = b.airing?.airingAt ?? Number.MAX_SAFE_INTEGER;
  return aAiringAt - bAiringAt;
};

/** Build a cyclic, day-by-day watch queue beginning today. */
export const buildAgenda = (
  schedule: Schedule,
  airingData: Record<number, AiringInfo | undefined>,
  now: Date = new Date(),
): Agenda => {
  const todayIndex = getTodayIndex(now);
  const dayBuckets: AgendaBucket[] = daysOfWeek.map((day, dayIndex) => {
    const items = (schedule[day] || []).flatMap((anime): AgendaItem[] => {
      if (anime.paused) return [];
      const enriched: Anime & { _day: string } = { ...anime, _day: day, airing: trackingAiring(anime, airingData[anime.id]) };
      const watchableEpisode = getWatchableEpisode(enriched);
      const currentEp = anime.currentEp || 0;
      const isFinished = Boolean(anime.episodes) && currentEp >= (anime.episodes ?? 0);

      if (isFinished || watchableEpisode <= currentEp) return [];
      return [{
        ...enriched,
        _nextToWatch: currentEp + 1,
        _pendingEpisodes: watchableEpisode - currentEp,
      }];
    }).sort(compareAgendaItems);

    return { day, dayIndex, distance: (dayIndex - todayIndex + 7) % 7, items };
  }).sort((a, b) => a.distance - b.distance);

  const nonEmptyDays = dayBuckets.filter((bucket) => bucket.items.length > 0);
  const active = nonEmptyDays[0] || null;
  const upcoming = nonEmptyDays.slice(1).flatMap((bucket) => bucket.items).slice(0, 5);
  return { active, upcoming, todayIndex };
};
