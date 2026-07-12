import { daysOfWeek } from './constants';

const getTodayIndex = (now) => (now.getDay() + 6) % 7;

const getWatchableEpisode = (anime) => {
  const currentEp = anime.currentEp || 0;
  const airing = anime.airing;

  if (airing?.episode) {
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

const compareAgendaItems = (a, b) => {
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
export const buildAgenda = (schedule, airingData, now = new Date()) => {
  const todayIndex = getTodayIndex(now);
  const dayBuckets = daysOfWeek.map((day, dayIndex) => {
    const items = (schedule[day] || []).flatMap((anime) => {
      const enriched = { ...anime, _day: day, airing: airingData[anime.id] };
      const watchableEpisode = getWatchableEpisode(enriched);
      const currentEp = anime.currentEp || 0;
      const isFinished = Boolean(anime.episodes) && currentEp >= anime.episodes;

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
