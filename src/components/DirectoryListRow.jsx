import React from 'react';

/**
 * Fila compacta del Directorio en modo lista: miniatura, título + metadatos,
 * sinopsis recortada y las mismas acciones que la card de descubrimiento.
 */
const DirectoryListRow = ({
  anime,
  alreadyAdded,
  onDetail,
  onAddToSchedule,
  onAddToWatchLater,
  onMarkWatched,
}) => {
  const handleImgError = (e) => {
    e.target.style.display = 'none';
    const fb = e.target.nextSibling;
    if (fb) fb.style.display = 'flex';
  };

  return (
    <div className="directory-row fade-in" onClick={() => onDetail(anime)}>
      <div className="directory-row-thumb">
        <img src={anime.imageSm || anime.image} alt={anime.title} loading="lazy" decoding="async" onError={handleImgError} />
        <div className="img-fallback" style={{ display: 'none' }}>{anime.title?.charAt(0) || '?'}</div>
      </div>
      <div className="directory-row-info">
        <div className="directory-row-title-line">
          <h3 className="directory-row-title">{anime.title}</h3>
          {anime.rating > 0 && <span className="directory-row-score">⭐ {Number(anime.rating).toFixed(1)}</span>}
        </div>
        <div className="directory-row-meta">
          {anime.type && <span>{anime.type}</span>}
          {anime.year && <span>{anime.year}</span>}
          {anime.episodes && <span>{anime.episodes} eps</span>}
          {(anime.genres || []).slice(0, 3).map((g) => <span key={g} className="genre">{g}</span>)}
        </div>
        <p className="directory-row-synopsis">{anime.synopsis}</p>
      </div>
      <div className="directory-row-actions">
        {alreadyAdded ? (
          <span className="directory-row-added" title="Ya está en tu lista">✓ En tu lista</span>
        ) : (
          <>
            <button className="add-btn schedule-btn" onClick={(e) => { e.stopPropagation(); onAddToSchedule(anime); }} title="Añadir a semana" aria-label="Añadir a semana">📅</button>
            <button className="add-btn later-btn" onClick={(e) => { e.stopPropagation(); onAddToWatchLater(anime); }} title="Ver después" aria-label="Ver después">🕐</button>
            <button className="add-btn watched-btn" onClick={(e) => { e.stopPropagation(); onMarkWatched(anime); }} title="Marcar como visto" aria-label="Marcar como visto">✓</button>
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(DirectoryListRow);
