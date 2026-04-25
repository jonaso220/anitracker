import React, { useState, useMemo } from 'react';
import { daysOfWeek } from '../constants';
import DiscoveryCard from './DiscoveryCard';

const FORMAT_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'TV', label: 'TV' },
  { key: 'MOVIE', label: 'Película' },
  { key: 'OVA_ONA', label: 'OVA/ONA' },
];

const TopAnimeSection = ({ topAnime, topLoading, schedule, watchedList, watchLater, setShowDayPicker, addToWatchLater, markAsWatched, onDetail }) => {
  const [formatFilter, setFormatFilter] = useState('all');

  const allUserIds = useMemo(() => new Set([
    ...daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)),
    ...watchedList.map(a => a.id),
    ...watchLater.map(a => a.id)
  ]), [schedule, watchedList, watchLater]);

  const filtered = useMemo(() => {
    if (formatFilter === 'all') return topAnime;
    if (formatFilter === 'OVA_ONA') return topAnime.filter(a => ['OVA', 'ONA', 'Special'].includes(a.type));
    if (formatFilter === 'MOVIE') return topAnime.filter(a => a.type === 'Película');
    return topAnime.filter(a => a.type === 'TV' || a.type === 'TV Short');
  }, [topAnime, formatFilter]);

  return (
    <>
      <div className="section-header">
        <h2>🏆 Top Anime</h2>
        <span className="count">{filtered.length}</span>
      </div>

      <div className="filter-bar">
        {FORMAT_FILTERS.map(f => (
          <button key={f.key} className={`filter-btn ${formatFilter === f.key ? 'active' : ''}`} onClick={() => setFormatFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {topLoading ? (
        <div className="season-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton skeleton-card-image"></div>
              <div className="skeleton-card-body">
                <div className="skeleton skeleton-line w75"></div>
                <div className="skeleton skeleton-line w50"></div>
                <div className="skeleton skeleton-line w30"></div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="season-grid stagger-in">
          {filtered.map((anime, idx) => (
            <DiscoveryCard
              key={anime.id}
              anime={anime}
              rank={idx + 1}
              alreadyAdded={allUserIds.has(anime.id)}
              onDetail={onDetail}
              onAddToSchedule={setShowDayPicker}
              onAddToWatchLater={addToWatchLater}
              onMarkWatched={markAsWatched}
            />
          ))}
        </div>
      ) : <div className="empty-state"><span>🏆</span><p>No se encontraron animes</p></div>}
    </>
  );
};

export default React.memo(TopAnimeSection);
