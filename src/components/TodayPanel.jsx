import { useMemo } from 'react';
import { daysOfWeek } from '../constants';

const formatTime = (airing) => {
  if (airing.hasAired) return 'Disponible';
  const date = new Date(airing.airingAt * 1000);
  if (airing.isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (airing.isTomorrow) return `Mañana · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
};

function TodayItem({ anime, label, onDetail, onIncrementEpisode, onScrollToDay }) {
  return (
    <div className="today-item">
      <button className="today-item-main" onClick={() => onDetail(anime)} aria-label={`Abrir ${anime.title}`}>
        <img src={anime.imageSm || anime.image} alt="" loading="lazy" decoding="async" />
        <span className="today-item-copy"><strong>{anime.title}</strong><small>{label}</small></span>
      </button>
      {onIncrementEpisode && <button className="today-quick" onClick={() => onIncrementEpisode(anime.id, 1)} aria-label={`Marcar episodio ${(anime.currentEp || 0) + 1} de ${anime.title}`}>+1</button>}
      {onScrollToDay && <button className="today-jump" onClick={() => onScrollToDay(anime._day)} aria-label={`Ir a ${anime._day}`}>↓</button>}
    </div>
  );
}

export default function TodayPanel({ schedule, airingData, onDetail, onIncrementEpisode, onScrollToDay }) {
  const groups = useMemo(() => {
    const all = daysOfWeek.flatMap((day) => (schedule[day] || []).map((anime) => ({ ...anime, _day: day, airing: airingData[anime.id] })));
    const available = all.filter((anime) => anime.airing?.hasAired && anime.airing.episode > (anime.currentEp || 0));
    const availableIds = new Set(available.map((anime) => anime.id));
    const today = all.filter((anime) => anime.airing?.isToday && !anime.airing.hasAired && !availableIds.has(anime.id));
    const upcoming = all.filter((anime) => anime.airing && !anime.airing.hasAired && !anime.airing.isToday).sort((a, b) => a.airing.airingAt - b.airing.airingAt).slice(0, 5);
    const continueWatching = all.filter((anime) => (anime.currentEp || 0) > 0 && (!anime.episodes || anime.currentEp < anime.episodes) && !availableIds.has(anime.id))
      .sort((a, b) => (b.currentEp || 0) - (a.currentEp || 0)).slice(0, 5);
    return { available, today, upcoming, continueWatching };
  }, [schedule, airingData]);

  const total = groups.available.length + groups.today.length + groups.upcoming.length + groups.continueWatching.length;
  if (!total) return null;
  return (
    <section className="today-panel fade-in" aria-labelledby="today-title">
      <div className="today-heading"><div><span className="today-eyebrow">TU AGENDA</span><h2 id="today-title">Para hoy</h2></div><span className="today-date">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
      <div className="today-columns">
        {groups.available.length > 0 && <div className="today-group urgent"><h3>🆕 Disponibles <span>{groups.available.length}</span></h3>{groups.available.map((anime) => <TodayItem key={anime.id} anime={anime} label={`Episodio ${anime.airing.episode} · pendiente`} onDetail={onDetail} onIncrementEpisode={onIncrementEpisode} onScrollToDay={onScrollToDay} />)}</div>}
        {groups.today.length > 0 && <div className="today-group"><h3>🔴 Salen hoy <span>{groups.today.length}</span></h3>{groups.today.map((anime) => <TodayItem key={anime.id} anime={anime} label={`Episodio ${anime.airing.episode} · ${formatTime(anime.airing)}`} onDetail={onDetail} onScrollToDay={onScrollToDay} />)}</div>}
        {groups.continueWatching.length > 0 && <div className="today-group"><h3>▶ Continuar <span>{groups.continueWatching.length}</span></h3>{groups.continueWatching.map((anime) => <TodayItem key={anime.id} anime={anime} label={`Episodio ${anime.currentEp}${anime.episodes ? ` de ${anime.episodes}` : ''}`} onDetail={onDetail} onIncrementEpisode={onIncrementEpisode} onScrollToDay={onScrollToDay} />)}</div>}
        {groups.upcoming.length > 0 && <div className="today-group"><h3>📡 Próximos <span>{groups.upcoming.length}</span></h3>{groups.upcoming.map((anime) => <TodayItem key={anime.id} anime={anime} label={`Ep. ${anime.airing.episode} · ${formatTime(anime.airing)}`} onDetail={onDetail} onScrollToDay={onScrollToDay} />)}</div>}
      </div>
    </section>
  );
}
