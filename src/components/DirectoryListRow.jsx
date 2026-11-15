import React from 'react';
import { useTranslatedSynopsis } from '../hooks/useTranslatedSynopsis';
import { t } from '../i18n';

/**
 * Fila del Directorio en modo lista: miniatura, título + metadatos, sinopsis
 * (traducida al español) y las mismas acciones que la card de descubrimiento.
 *
 * El título es un botón real (teclado y lector de pantalla); su `::after` se
 * estira sobre toda la fila para que un clic en cualquier parte abra la ficha,
 * como el `.season-card-open` de DiscoveryCard. Las acciones quedan por encima.
 */
const DirectoryListRow = ({
  anime,
  alreadyAdded,
  onDetail,
  onAddToSchedule,
  onAddToWatchLater,
  onMarkWatched,
}) => {
  const synopsis = useTranslatedSynopsis(anime);
  const handleImgError = (e) => {
    e.target.style.display = 'none';
    const fb = e.target.nextSibling;
    if (fb) fb.style.display = 'flex';
  };

  return (
    <div className="directory-row fade-in">
      <div className="directory-row-thumb">
        <img src={anime.imageSm || anime.image || undefined} alt="" loading="lazy" decoding="async" onError={handleImgError} />
        <div className="img-fallback" style={{ display: 'none' }} aria-hidden="true">{anime.title?.charAt(0) || '?'}</div>
      </div>
      <div className="directory-row-info">
        <div className="directory-row-title-line">
          <h3 className="directory-row-title">
            <button
              type="button"
              className="directory-row-open"
              onClick={() => onDetail(anime)}
              aria-label={t('detail.openDetails', 'Abrir detalles de {title}', { title: anime.title })}
            >
              {anime.title}
            </button>
          </h3>
          {anime.rating > 0 && <span className="directory-row-score">⭐ {Number(anime.rating).toFixed(1)}</span>}
        </div>
        <div className="directory-row-meta">
          {anime.type && <span>{anime.type}</span>}
          {anime.year && <span>{anime.year}</span>}
          {anime.episodes && <span>{t('meta.episodesShort', '{count} eps', { count: anime.episodes })}</span>}
          {(anime.genres || []).slice(0, 3).map((g) => <span key={g} className="genre">{g}</span>)}
        </div>
        <p className="directory-row-synopsis">{synopsis}</p>
      </div>
      <div className="directory-row-actions">
        {alreadyAdded ? (
          <span className="directory-row-added" title={t('discovery.inLibraryTitle', 'Ya está en tu lista')}>{t('discovery.inLibrary', '✓ En tu lista')}</span>
        ) : (
          <>
            <button className="add-btn schedule-btn" onClick={() => onAddToSchedule(anime)} title={t('discovery.addToWeek', 'Añadir a semana')} aria-label={t('discovery.addToWeek', 'Añadir a semana')}>📅</button>
            <button className="add-btn later-btn" onClick={() => onAddToWatchLater(anime)} title={t('discovery.watchLater', 'Ver después')} aria-label={t('discovery.watchLater', 'Ver después')}>🕐</button>
            <button className="add-btn watched-btn" onClick={() => onMarkWatched(anime)} title={t('discovery.markWatched', 'Marcar como visto')} aria-label={t('discovery.markWatched', 'Marcar como visto')}>✓</button>
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(DirectoryListRow);
