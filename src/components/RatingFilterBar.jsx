import React from 'react';

/**
 * Filter bar to narrow a list by minimum community rating and toggle sorting
 * by rating (descending). Designed to be reused across Watch Later, Season
 * and Top Anime views.
 */
const MIN_OPTIONS = [
  { value: 0, label: 'Todos' },
  { value: 7, label: '7+' },
  { value: 8, label: '8+' },
  { value: 9, label: '9+' },
];

const RatingFilterBar = ({ minRating, setMinRating, sortByRating, setSortByRating, className = '' }) => (
  <div className={`filter-bar ${className}`} role="toolbar" aria-label="Filtrar por valoración">
    <span className="filter-bar-label" aria-hidden="true">⭐ Valoración:</span>
    {MIN_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        className={`filter-btn ${minRating === opt.value ? 'active' : ''}`}
        onClick={() => setMinRating(opt.value)}
        aria-pressed={minRating === opt.value}
      >
        {opt.label}
      </button>
    ))}
    {setSortByRating && (
      <button
        type="button"
        className={`sort-btn ${sortByRating ? 'active' : ''}`}
        onClick={() => setSortByRating((v) => !v)}
        aria-pressed={!!sortByRating}
        title={sortByRating ? 'Ordenado por valoración' : 'Ordenar por valoración descendente'}
      >
        {sortByRating ? '↓ Mejor primero' : '↕ Por valoración'}
      </button>
    )}
  </div>
);

export default React.memo(RatingFilterBar);
