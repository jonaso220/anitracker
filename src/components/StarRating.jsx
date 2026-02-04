import React from 'react';

const StarRating = React.memo(({ rating, size = 16, interactive = false, onChange }) => (
  <div className="star-rating" style={{ fontSize: size }}>
    {[1, 2, 3, 4, 5].map(s => (
      <span key={s} className={`star ${s <= rating ? 'filled' : ''}`}
        onClick={interactive ? (e) => { e.stopPropagation(); onChange?.(s === rating ? 0 : s); } : undefined}
        style={interactive ? { cursor: 'pointer' } : {}}
      >{s <= rating ? '★' : '☆'}</span>
    ))}
  </div>
));

export default StarRating;