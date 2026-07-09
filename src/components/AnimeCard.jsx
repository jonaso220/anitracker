import React, { useState } from 'react';
import StarRating from './StarRating';
import { sanitizeUrl } from '../constants';
import { getPlatformInfo, pickAutoWatchLink, formatAiringWhen } from '../utils';

// Derive a status used for the colored left border.
const getCardStatus = ({ anime, isWatched, airing, ep, total }) => {
  if (isWatched) return anime.finished ? 'finished' : 'dropped';
  if (airing && (airing.isToday || airing.isTomorrow || airing.hasAired)) return 'airing';
  if (total > 0 && ep >= total) return 'finished';
  if (ep > 0) return 'watching';
  return 'pending';
};

const AnimeCard = ({
  anime,
  day,
  isWatchLater = false,
  isWatched = false,
  cardIndex,
  cardDay,
  airingData = {},
  onClick,
  isDraggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onIncrementEpisode,
}) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const airing = airingData[anime.id];
  const airingBadge = airing ? (
    airing.hasAired ? 'airing-new' :
    airing.isToday ? 'airing-today' :
    airing.isTomorrow ? 'airing-tomorrow' : null
  ) : null;

  const airingText = airing ? (
    airing.hasAired ? `🆕 Ep. ${airing.episode}` :
    airing.isToday ? `🔴 Ep. ${airing.episode} hoy` :
    airing.isTomorrow ? `📢 Ep. ${airing.episode} mañana` : null
  ) : null;

  // Episodes further out than tomorrow get a hover-only strip with the airing
  // day (the urgent cases above already have their always-visible badge).
  const airingHoverText = airing && !airingBadge
    ? `📡 Ep. ${airing.episode} · ${formatAiringWhen(airing)}`
    : null;

  const handleImgError = (e) => {
    e.target.style.display = 'none';
    const fallback = e.target.nextSibling;
    if (fallback) fallback.style.display = 'flex';
    setImgLoaded(true);
  };

  const ep = anime.currentEp || 0;
  const total = anime.episodes || 0;
  const hasProgress = ep > 0 && total > 0;
  const pct = total > 0 ? Math.min((ep / total) * 100, 100) : 0;
  const isComplete = total > 0 && ep >= total;
  const status = getCardStatus({ anime, isWatched, airing, ep, total });
  // Manual link wins (unless it's a dead platform); otherwise the best-ranked
  // streaming link, so cards saved before auto-linking existed still get their
  // platform badge.
  const watchUrl = pickAutoWatchLink(anime);
  const platform = getPlatformInfo(watchUrl);
  const isHighRated = (anime.rating || 0) >= 9;

  const showQuickEp = !!onIncrementEpisode && !isWatched && total > 0 && !isComplete;
  const handleQuickEp = (e) => {
    e.stopPropagation();
    onIncrementEpisode(anime.id, 1);
  };

  return (
    <div
      className={`anime-card fade-in status-${status} ${airingBadge ? 'has-airing' : ''} ${airingHoverText ? 'has-airing-later' : ''} ${isDraggable ? 'draggable' : ''} ${isHighRated ? 'high-rated' : ''}`}
      onClick={(e) => onClick && onClick(e, anime, day, isWatchLater, isWatched)}
      draggable={isDraggable}
      onDragStart={isDraggable && onDragStart ? (e) => onDragStart(e, anime, day) : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onDragOver={isDraggable && cardIndex != null && onDragOver ? (e) => onDragOver(e, cardDay, cardIndex) : undefined}
      onTouchStart={isDraggable && onTouchStart ? (e) => onTouchStart(e, anime, day) : undefined}
      onTouchMove={isDraggable && onTouchMove ? (e) => onTouchMove(e, day) : undefined}
      onTouchEnd={isDraggable ? onTouchEnd : undefined}
    >
      <div className="anime-card-image">
        <div className="anime-card-blur" style={{ backgroundImage: anime.imageSm ? `url(${anime.imageSm})` : 'none' }} aria-hidden="true" />
        <img
          src={anime.image || anime.imageSm}
          alt={anime.title}
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={handleImgError}
          onLoad={() => setImgLoaded(true)}
          className={imgLoaded ? 'loaded' : 'loading'}
        />
        <div className="img-fallback" style={{ display: 'none' }}>{anime.title?.charAt(0) || '?'}</div>

        {/* Top-left affordances */}
        {isDraggable && <span className="anime-card-grip" aria-hidden="true">⋮⋮</span>}

        {/* Top-right: rating */}
        {anime.rating > 0 && (
          <div className="anime-card-score">⭐ {Number(anime.rating).toFixed(1)}</div>
        )}

        {/* Hover-only quick actions */}
        <div className="anime-card-quick">
          {showQuickEp && (
            <button
              type="button"
              className="quick-btn quick-ep"
              onClick={handleQuickEp}
              title={`Marcar episodio ${ep + 1} como visto`}
              aria-label="Sumar un episodio"
            >
              +1
            </button>
          )}
          {platform && watchUrl && (
            <a
              href={sanitizeUrl(watchUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="quick-btn quick-watch"
              onClick={(e) => e.stopPropagation()}
              title={`Ver en ${platform.name}`}
              aria-label={`Ver en ${platform.name}`}
              style={{ '--platform-color': platform.color }}
            >
              <span className="quick-watch-label">{platform.label}</span>
            </a>
          )}
        </div>

        {/* Airing pulse */}
        {airingBadge && (
          <div className={`anime-card-airing ${airingBadge}`}>{airingText}</div>
        )}
        {airingHoverText && (
          <div className="anime-card-airing airing-later">{airingHoverText}</div>
        )}

        {/* Bottom: title + genre overlay */}
        <div className="anime-card-overlay">
          <h3 className="anime-card-title">{anime.title}</h3>
          <div className="anime-card-overlay-meta">
            <div className="anime-genres">
              {(anime.genres || []).slice(0, 2).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}
            </div>
            {anime.userRating > 0 && <StarRating rating={anime.userRating} size={11} />}
          </div>
        </div>

        {/* Slim progress bar at the very bottom of the cover */}
        {(hasProgress || isComplete) && (
          <div className="anime-card-progress" aria-label={`${ep} de ${total} episodios`}>
            <div className={`anime-card-progress-fill ${isComplete ? 'complete' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Status badge for watched view */}
        {isWatched && (
          <div className={`anime-card-status-pill ${anime.finished ? 'finished' : 'dropped'}`}>
            {anime.finished ? '✓' : '⏸'}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(AnimeCard);
