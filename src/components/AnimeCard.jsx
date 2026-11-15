import React, { useState } from 'react';
import { trackingAiring } from '../tracking';
import { dayLabel, genreLabel, t } from '../i18n';
import StarRating from './StarRating';
import { sanitizeUrl } from '../constants';
import { getPlatformInfo, pickAutoWatchLink, formatAiringWhen, airingEpisodeLabel } from '../utils';

// Derive a status used for the colored left border.
const getCardStatus = ({ anime, isWatched, airing, ep, total }) => {
  if (anime.paused && !isWatched) return 'paused';
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
  onTouchCancel,
  onIncrementEpisode,
}) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [episodeFeedback, setEpisodeFeedback] = useState(0);
  const coverSrc = anime.image || anime.imageSm;
  const airing = trackingAiring(anime, airingData[anime.id]);
  const airingBadge = airing ? (
    airing.hasAired ? 'airing-new' :
    airing.isToday ? 'airing-today' :
    airing.isTomorrow ? 'airing-tomorrow' : null
  ) : null;

  const epLabel = airing ? airingEpisodeLabel(airing) : '';
  const airingText = airing ? (
    airing.hasAired ? `🆕 ${epLabel}` :
    airing.isToday ? `🔴 ${t('card.airingToday', '{episode} hoy', { episode: epLabel })}` :
    airing.isTomorrow ? `📢 ${t('card.airingTomorrow', '{episode} mañana', { episode: epLabel })}` : null
  ) : null;

  // Episodes further out than tomorrow get a hover-only strip with the airing
  // day (the urgent cases above already have their always-visible badge).
  const airingHoverText = airing && !airingBadge
    ? `📡 ${epLabel} · ${formatAiringWhen(airing)}`
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

  // Some providers omit the total episode count. Progress can still be tracked,
  // so only hide the shortcut when the anime is watched or definitively complete.
  const showQuickEp = !!onIncrementEpisode && !isWatched && !isComplete && !anime.paused;
  const handleQuickEp = (e) => {
    e.stopPropagation();
    setEpisodeFeedback((value) => value + 1);
    onIncrementEpisode(anime.id, 1);
  };

  const showTracking = !!day || isWatchLater || isWatched || anime.currentEp != null;
  const progressText = total > 0 ? `${ep}/${total}` : t('card.episodeCount', '{count} episodios', { count: ep });
  const quickActions = (
        <div className="anime-card-quick">
          {showQuickEp && (
            <button
              type="button"
              className="quick-btn quick-ep"
              onClick={handleQuickEp}
              title={t('card.markEpisode', 'Marcar episodio {episode} como visto', { episode: ep + 1 })}
              aria-label={t('card.addEpisode', 'Sumar un episodio')}
            >
              <span
                key={`value-${episodeFeedback}`}
                className={`quick-ep-value ${episodeFeedback > 0 ? 'is-confirmed' : ''}`}
              >
                +1
              </span>
              {episodeFeedback > 0 && (
                <span
                  key={`feedback-${episodeFeedback}`}
                  className="quick-ep-feedback"
                  aria-hidden="true"
                  onAnimationEnd={() => setEpisodeFeedback(0)}
                >
                  ✓ +1
                </span>
              )}
            </button>
          )}
          {platform && watchUrl && (
            <a
              href={sanitizeUrl(watchUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="quick-btn quick-watch"
              onClick={(e) => e.stopPropagation()}
              title={t('detail.watchOn', 'Ver en {platform}', { platform: platform.name })}
              aria-label={t('detail.watchOn', 'Ver en {platform}', { platform: platform.name })}
              style={{ '--platform-color': platform.color }}
            >
              <span className="quick-watch-label">{platform.label}</span>
            </a>
          )}
        </div>
  );

  return (
    <div
      data-anime-id={anime.id}
      className={`anime-card fade-in ${showTracking ? 'tracked-card' : ''} status-${status} ${airingBadge ? 'has-airing' : ''} ${airingHoverText ? 'has-airing-later' : ''} ${isDraggable ? 'draggable' : ''} ${isHighRated ? 'high-rated' : ''}`}
      onClick={(e) => onClick && onClick(e, anime, day, isWatchLater, isWatched)}
      draggable={isDraggable}
      onDragStart={isDraggable && onDragStart ? (e) => onDragStart(e, anime, day) : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
      onDragOver={isDraggable && cardIndex != null && onDragOver ? (e) => onDragOver(e, cardDay, cardIndex) : undefined}
      onTouchStart={isDraggable && onTouchStart ? (e) => onTouchStart(e, anime, day) : undefined}
      onTouchMove={isDraggable && onTouchMove ? (e) => onTouchMove(e, day) : undefined}
      onTouchEnd={isDraggable ? onTouchEnd : undefined}
      onTouchCancel={isDraggable ? onTouchCancel : undefined}
    >
      <div className="anime-card-image">
        <div className="anime-card-blur" style={{ backgroundImage: anime.imageSm ? `url(${anime.imageSm})` : 'none' }} aria-hidden="true" />
        {/* Sin portada: directo la inicial (un src vacío pediría la página de nuevo). */}
        {coverSrc && <img
          src={coverSrc}
          alt={anime.title}
          loading="lazy"
          decoding="async"
          draggable="false"
          onError={handleImgError}
          onLoad={() => setImgLoaded(true)}
          className={imgLoaded ? 'loaded' : 'loading'}
        />}
        <div className="img-fallback" style={{ display: coverSrc ? 'none' : 'flex' }}>{anime.title?.charAt(0) || '?'}</div>

        {/* Top-left affordances */}
        {anime.paused && !isWatched && <span className="card-paused-badge">{t('card.paused', 'En pausa')}</span>}
        {isDraggable && <span className="anime-card-grip" aria-hidden="true">⋮⋮</span>}

        {/* Top-right: rating */}
        {anime.rating > 0 && (
          <div className="anime-card-score">⭐ {Number(anime.rating).toFixed(1)}</div>
        )}

        {/* Hover-only quick actions */}
        {!showTracking && quickActions}

        {/* Airing pulse */}
        {airingBadge && (
          <div className={`anime-card-airing ${airingBadge}`}>{airingText}</div>
        )}
        {airingHoverText && (
          <div className="anime-card-airing airing-later">{airingHoverText}</div>
        )}

        {/* Bottom: title + genre overlay */}
        <div className="anime-card-overlay">
          <h3 className="anime-card-title" title={anime.title}>{onClick
            ? <button type="button" className="card-open" aria-label={t('detail.open', undefined, { title: anime.title })}>{anime.title}</button>
            : anime.title}</h3>
          <div className="anime-card-overlay-meta">
            <div className="anime-genres">
              {(anime.genres || []).slice(0, 2).map((g, i) => <span key={i} className="genre-tag">{genreLabel(g)}</span>)}
            </div>
            {anime.userRating > 0 && <StarRating rating={anime.userRating} size={11} />}
          </div>
        </div>

        {/* Slim progress bar at the very bottom of the cover */}
        {!showTracking && (hasProgress || isComplete) && (
          <div className="anime-card-progress" aria-label={t('card.progressOf', '{episode} de {total} episodios', { episode: ep, total })}>
            <div className={`anime-card-progress-fill ${isComplete ? 'complete' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Status badge for watched view */}
        {isWatched && (
          <div
            className={`anime-card-status-pill ${anime.finished ? 'finished' : 'dropped'}`}
            role="img"
            aria-label={anime.finished ? t('card.statusFinished', 'Completada') : t('card.statusDropped', 'Dropeada')}
            title={anime.finished ? t('card.statusFinished', 'Completada') : t('card.statusDropped', 'Dropeada')}
          >
            <span aria-hidden="true">{anime.finished ? '✓' : '✗'}</span>
          </div>
        )}
      </div>
      {showTracking && <div className="card-tracking">
        <div className="card-progress-copy">
          <strong>{anime.currentSeason
            ? t('card.seasonProgress', 'T{season} · {progress}', { season: anime.currentSeason, progress: progressText })
            : progressText}</strong>
          <span>{anime.paused && !isWatched
            ? (day ? t('card.pausedOn', 'En pausa · {day}', { day: dayLabel(day) }) : t('card.paused', 'En pausa'))
            : total > 0
              ? (isComplete ? t('card.caughtUp', 'Al día') : t('card.remaining', 'Faltan {count}', { count: Math.max(0, total - ep) }))
              : t('card.totalUnknown', 'Total por confirmar')}</span>
        </div>
        {quickActions}
        {total > 0 && <div className="card-progress-track" role="progressbar" aria-label={t('card.progress', 'Progreso de episodios')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(ep, total)}><span style={{ width: `${pct}%` }} /></div>}
      </div>}
    </div>
  );
};

export default React.memo(AnimeCard);
