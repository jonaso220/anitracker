import React from 'react';
import { t } from '../i18n';

/**
 * Filter bar to narrow a list by minimum community rating and toggle sorting
 * by rating (descending). Designed to be reused across Watch Later, Season
 * and Top Anime views.
 */
const MIN_OPTIONS = [
  { value: 0, label: null }, // «Todos»: se traduce al renderizar
  { value: 7, label: '7+' },
  { value: 8, label: '8+' },
  { value: 9, label: '9+' },
];

const RatingFilterBar = ({ minRating, setMinRating, sortByRating, setSortByRating, className = '' }) => (
  <div className={`filter-bar ${className}`} role="toolbar" aria-label={t('rating.filterLabel', 'Filtrar por valoración')}>
    <span className="filter-bar-label" aria-hidden="true">{t('rating.label', '⭐ Valoración:')}</span>
    {MIN_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        className={`filter-btn ${minRating === opt.value ? 'active' : ''}`}
        onClick={() => setMinRating(opt.value)}
        aria-pressed={minRating === opt.value}
      >
        {opt.label ?? t('directory.allMasc', 'Todos')}
      </button>
    ))}
    {setSortByRating && (
      <button
        type="button"
        className={`sort-btn ${sortByRating ? 'active' : ''}`}
        onClick={() => setSortByRating((v) => !v)}
        aria-pressed={!!sortByRating}
        title={sortByRating ? t('rating.sorted', 'Ordenado por valoración') : t('rating.sortHint', 'Ordenar por valoración descendente')}
      >
        {sortByRating ? t('rating.bestFirst', '↓ Mejor primero') : t('rating.byRating', '↕ Por valoración')}
      </button>
    )}
  </div>
);

export default React.memo(RatingFilterBar);
