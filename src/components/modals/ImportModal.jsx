import React, { useState } from 'react';
import { fetchAnilistUserAnimeLists } from '../../services/anilistService';

const ImportModal = ({ onClose, onImport }) => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState({ schedule: true, watchLater: true, watched: true });

  const fetchList = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await fetchAnilistUserAnimeLists(username));
    } catch (err) {
      setError(err?.code === 'ANILIST_USER_NOT_FOUND' ? 'Usuario no encontrado en AniList' : (err?.message || 'Error de conexión con AniList'));
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
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="import-modal-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="import-modal fade-in" onClick={e => e.stopPropagation()}>
        <div className="bottom-sheet-handle" aria-hidden="true"></div>
        <button className="close-btn" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 id="import-modal-title" className="import-title">Importar desde AniList</h2>
        <p className="import-desc">Ingresá tu nombre de usuario de AniList para importar tu lista de anime.</p>

        <div className="import-input-row">
          <input
            type="text"
            placeholder="Usuario de AniList..."
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchList()}
          />
          <button className="import-fetch-btn" onClick={fetchList} disabled={loading || !username.trim()}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {error && <div className="import-error">{error}</div>}

        {preview && (
          <div className="import-preview">
            <h3>Animes encontrados</h3>
            <div className="import-categories">
              <label className={`import-cat ${selected.schedule ? 'active' : ''}`}>
                <input type="checkbox" checked={selected.schedule} onChange={e => setSelected(p => ({ ...p, schedule: e.target.checked }))} />
                <span>📅 Viendo ({preview.schedule.length})</span>
              </label>
              <label className={`import-cat ${selected.watchLater ? 'active' : ''}`}>
                <input type="checkbox" checked={selected.watchLater} onChange={e => setSelected(p => ({ ...p, watchLater: e.target.checked }))} />
                <span>🕐 Planeados ({preview.watchLater.length})</span>
              </label>
              <label className={`import-cat ${selected.watched ? 'active' : ''}`}>
                <input type="checkbox" checked={selected.watched} onChange={e => setSelected(p => ({ ...p, watched: e.target.checked }))} />
                <span>✓ Completados/Drop ({preview.watched.length})</span>
              </label>
            </div>

            <div className="import-summary">
              Total: {(selected.schedule ? preview.schedule.length : 0) + (selected.watchLater ? preview.watchLater.length : 0) + (selected.watched ? preview.watched.length : 0)} animes
            </div>

            <button className="import-confirm-btn" onClick={doImport}>
              Importar seleccionados
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportModal;
