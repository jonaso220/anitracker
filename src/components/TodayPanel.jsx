import { buildAgenda } from '../agenda';

function TodayItem({ anime, onDetail, onIncrementEpisode, showDay = false }) {
  const pendingLabel = anime._pendingEpisodes > 1 ? ` · ${anime._pendingEpisodes} pendientes` : '';
  const dayLabel = showDay ? `${anime._day} · ` : '';
  return (
    <div className="today-item">
      <button className="today-item-main" onClick={() => onDetail(anime)} aria-label={`Abrir ${anime.title}`}>
        <img src={anime.imageSm || anime.image} alt="" loading="lazy" decoding="async" />
        <span className="today-item-copy">
          <strong>{anime.title}</strong>
          <small>{dayLabel}Ver episodio {anime._nextToWatch}{pendingLabel}</small>
        </span>
      </button>
      <button className="today-quick" onClick={() => onIncrementEpisode(anime.id, 1)} aria-label={`Marcar episodio ${anime._nextToWatch} de ${anime.title}`}>+1</button>
    </div>
  );
}

export default function TodayPanel({ schedule, airingData, onDetail, onIncrementEpisode }) {
  const now = new Date();
  const agenda = buildAgenda(schedule, airingData, now);

  if (!agenda.active) return null;

  const activeIsToday = agenda.active.dayIndex === agenda.todayIndex;
  const activeHeading = activeIsToday ? '▶ Para hoy' : `▶ Continuar · ${agenda.active.day}`;

  return (
    <section className="today-panel fade-in" aria-labelledby="today-title">
      <div className="today-heading">
        <div><span className="today-eyebrow">TU AGENDA</span><h2 id="today-title">Para hoy</h2></div>
        <span className="today-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
      <div className="today-columns">
        <div className="today-group urgent">
          <h3>{activeHeading} <span>{agenda.active.items.length}</span></h3>
          {agenda.active.items.map((anime) => (
            <TodayItem key={anime.id} anime={anime} onDetail={onDetail} onIncrementEpisode={onIncrementEpisode} />
          ))}
        </div>
        {agenda.upcoming.length > 0 && (
          <div className="today-group">
            <h3>⏭️ Próximos <span>{agenda.upcoming.length}</span></h3>
            {agenda.upcoming.map((anime) => (
              <TodayItem key={anime.id} anime={anime} onDetail={onDetail} onIncrementEpisode={onIncrementEpisode} showDay />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
