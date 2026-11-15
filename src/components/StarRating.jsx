import React from 'react';
import { t } from '../i18n';

const StarRating = React.memo(({ rating, size = 16, interactive = false, onChange }) => (
  <div className="star-rating" style={{ fontSize: size }}>
    {[1, 2, 3, 4, 5].map(s => (
      interactive ? <button type="button" key={s} className={`star ${s <= rating ? 'filled' : ''}`}
        aria-label={t('rating.starsOf', '{count} de {max} estrellas', { count: s, max: 5 })} aria-pressed={s === rating}
        onClick={(e) => { e.stopPropagation(); onChange?.(s === rating ? 0 : s); }}
      >{s <= rating ? '★' : '☆'}</button>
      : <span key={s} className={`star ${s <= rating ? 'filled' : ''}`}>{s <= rating ? '★' : '☆'}</span>
    ))}
  </div>
));

export default StarRating;