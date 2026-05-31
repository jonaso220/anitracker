import { t } from '../i18n';

// Library composition segments. Together these cover every anime in the library
// (schedule + finished + dropped + watchLater === allTotal), so they form a clean
// 100% stacked bar.
const STATUS_SEGMENTS = [
  { key: 'totalSchedule', label: 'Viendo', color: '#a855f7' },
  { key: 'finished', label: 'Terminados', color: '#10b981' },
  { key: 'dropped', label: 'Abandonados', color: '#f43f5e' },
  { key: 'totalWatchLater', label: 'Pendientes', color: '#f59e0b' },
];

const SUMMARY_CARDS = [
  { key: 'totalSchedule', icon: '📺', label: t('stats.inSchedule', 'En horario') },
  { key: 'finished', icon: '✅', label: t('stats.finished', 'Terminados') },
  { key: 'totalWatched', icon: '🎬', label: t('stats.watched', 'Vistos') },
  { key: 'totalWatchLater', icon: '⏳', label: t('stats.pending', 'Pendientes') },
  { key: 'allTotal', icon: '📚', label: t('stats.total', 'Total') },
  { key: 'avgRating', icon: '⭐', label: t('stats.avgRating', 'Rating medio') },
  { key: 'totalEps', icon: '🎞️', label: t('stats.episodes', 'Episodios') },
  { key: 'dropped', icon: '🚫', label: t('stats.dropped', 'Abandonados') },
];

export default function StatsPanel({ stats }) {
  const ratingDist = stats.ratingDist || [];
  const segTotal = STATUS_SEGMENTS.reduce((sum, seg) => sum + (stats[seg.key] || 0), 0);
  const maxGenre = stats.topGenres.length ? stats.topGenres[0][1] : 0;
  const maxRating = ratingDist.length ? Math.max(...ratingDist) : 0;
  const hasRatings = ratingDist.some((n) => n > 0);

  return (
    <div className="stats-panel">
      <div className="stats-grid">
        {SUMMARY_CARDS.map((card) => (
          <div className="stat-card" key={card.key}>
            <div className="stat-icon">{card.icon}</div>
            <div className="stat-value">{stats[card.key]}</div>
            <div className="stat-label">{card.label}</div>
          </div>
        ))}
      </div>

      {segTotal > 0 && (
        <div className="stats-block">
          <h3 className="stats-block-title">{t('stats.composition', 'Composición de tu biblioteca')}</h3>
          <div className="status-bar" role="img" aria-label={t('stats.composition', 'Composición de tu biblioteca')}>
            {STATUS_SEGMENTS.map((seg) => {
              const value = stats[seg.key] || 0;
              if (!value) return null;
              return (
                <div
                  key={seg.key}
                  className="status-seg"
                  style={{ width: `${(value / segTotal) * 100}%`, background: seg.color }}
                  title={`${seg.label}: ${value}`}
                />
              );
            })}
          </div>
          <div className="status-legend">
            {STATUS_SEGMENTS.map((seg) => (
              <div className="status-legend-item" key={seg.key}>
                <span className="status-dot" style={{ background: seg.color }} />
                <span className="status-legend-label">{seg.label}</span>
                <span className="status-legend-value">{stats[seg.key] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasRatings && (
        <div className="stats-block">
          <h3 className="stats-block-title">{t('stats.yourRatings', 'Tus puntuaciones')}</h3>
          <div className="rating-chart">
            {ratingDist.map((count, i) => (
              <div className="rating-col" key={i}>
                <div className="rating-track">
                  <div
                    className="rating-fill"
                    style={{ height: maxRating ? `${(count / maxRating) * 100}%` : '0%' }}
                  >
                    {count > 0 && <span className="rating-count">{count}</span>}
                  </div>
                </div>
                <span className="rating-axis">{i + 1}</span>
              </div>
            ))}
          </div>
          <p className="rating-caption">
            {stats.ratedCount} {stats.ratedCount === 1 ? 'anime puntuado' : 'animes puntuados'} · {t('stats.avgRating', 'Rating medio')} {stats.avgRating}
          </p>
        </div>
      )}

      {stats.topGenres.length > 0 && (
        <div className="stats-block">
          <h3 className="stats-block-title">{t('stats.topGenres', 'Géneros favoritos')}</h3>
          <div className="genre-bars">
            {stats.topGenres.map(([genre, count]) => (
              <div className="genre-bar-row" key={genre}>
                <span className="genre-bar-name">{genre}</span>
                <div className="genre-bar-track">
                  <div
                    className="genre-bar-fill"
                    style={{ width: maxGenre ? `${(count / maxGenre) * 100}%` : '0%' }}
                  />
                </div>
                <span className="genre-bar-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
