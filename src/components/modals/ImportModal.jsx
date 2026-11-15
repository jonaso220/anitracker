import React, { useMemo, useState } from 'react';
import { fetchAnilistUserAnimeLists } from '../../services/anilistService';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { t } from '../../i18n';

const CATEGORIES = [
  { key: 'schedule', label: () => t('import.catSchedule', '📅 Viendo') },
  { key: 'watchLater', label: () => t('import.catWatchLater', '🕐 Planeados') },
  { key: 'watched', label: () => t('import.catWatched', '✓ Completados/Drop') },
];

const ImportModal = ({ onClose, onImport, onPreview }) => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState({ schedule: true, watchLater: true, watched: true });
  const dialogRef = useAccessibleDialog(onClose);
  // Lo que ya está en la biblioteca no se vuelve a importar: se cuenta aparte.
  const plan = useMemo(() => (preview && onPreview ? onPreview(preview) : null), [preview, onPreview]);
  const newCount = (key) => (plan ? plan[key].length : preview?.[key].length || 0);
  const selectedTotal = CATEGORIES.reduce((sum, c) => sum + (selected[c.key] ? newCount(c.key) : 0), 0);

  const fetchList = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await fetchAnilistUserAnimeLists(username));
    } catch (err) {
      setError(err?.code === 'ANILIST_USER_NOT_FOUND' ? t('import.userNotFound', 'Usuario no encontrado en AniList') : (err?.message || t('import.connectionError', 'Error de conexión con AniList')));
    }
    setLoading(false);
  };

  const doImport = () => {
    if (!preview) return;
    const data = {};
    if (selected.schedule) data.schedule = preview.schedule;
    if (selected.watchLater) data.watchLater = preview.watchLater;
    if (selected.watched) data.watched = preview.watched;
    onImport(data);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={dialogRef} className="import-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="import-modal-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="bottom-sheet-handle" aria-hidden="true"></div>
        <button className="close-btn" onClick={onClose} aria-label={t('common.close', 'Cerrar')}>×</button>
        <h2 id="import-modal-title" className="import-title">{t('header.importAniList', 'Importar desde AniList')}</h2>
        <p id="import-modal-desc" className="import-desc">{t('import.desc', 'Ingresá tu nombre de usuario de AniList para importar tu lista de anime.')}</p>

        <div className="import-input-row">
          <label htmlFor="import-username" className="sr-only">{t('import.usernameLabel', 'Usuario de AniList')}</label>
          <input
            id="import-username"
            type="text"
            placeholder={t('import.usernamePlaceholder', 'Usuario de AniList...')}
            aria-describedby={error ? 'import-modal-desc import-error' : 'import-modal-desc'}
            aria-invalid={!!error}
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchList()}
          />
          <button className="import-fetch-btn" onClick={fetchList} disabled={loading || !username.trim()}>
            {loading ? t('import.searching', 'Buscando...') : t('import.search', 'Buscar')}
          </button>
        </div>

        {error && <div id="import-error" className="import-error" role="alert">{error}</div>}

        {preview && (
          <div className="import-preview">
            <h3>{t('import.found', 'Animes encontrados')}</h3>
            <div className="import-categories">
              {CATEGORIES.map(({ key, label }) => {
                const known = plan?.known[key] || 0;
                return (
                  <label key={key} className={`import-cat ${selected[key] ? 'active' : ''}`}>
                    <input type="checkbox" checked={selected[key]} onChange={e => setSelected(p => ({ ...p, [key]: e.target.checked }))} />
                    <span>{label()} ({newCount(key)})</span>
                    {known > 0 && <small className="import-known">{t('import.known', '{count} ya los tenés', { count: known })}</small>}
                  </label>
                );
              })}
            </div>

            <div className="import-summary">
              {selectedTotal > 0
                ? t('import.willAdd', 'Se agregan {count} animes', { count: selectedTotal })
                : t('import.nothingNew', 'No hay nada nuevo para importar')}
              {plan?.skipped > 0 && <span className="import-summary-note">{t('import.noDuplicates', 'Lo que ya está en tu semana, Después o Vistas no se duplica.')}</span>}
            </div>

            <button className="import-confirm-btn" onClick={doImport} disabled={selectedTotal === 0}>
              {t('import.confirm', 'Importar seleccionados')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportModal;
