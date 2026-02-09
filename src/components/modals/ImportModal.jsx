import React, { useState } from 'react';

const STATUS_MAP = {
  CURRENT: 'schedule',
  PLANNING: 'watchLater',
  COMPLETED: 'watched',
  DROPPED: 'watched',
  PAUSED: 'watchLater',
  REPEATING: 'schedule'
};

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
      const query = `query ($username: String) {
        MediaListCollection(userName: $username, type: ANIME) {
          lists {
            name status
            entries {
              status progress score(format: POINT_10)
              media {
                id idMal
                title { romaji english native }
                coverImage { large medium }
                genres averageScore episodes format seasonYear
                description(asHtml: false) siteUrl
              }
            }
          }
        }
      }`;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { username: username.trim() } })
      }).then(r => r.json());

      if (res.errors) {
        setError(res.errors[0]?.message === 'User not found' ? 'Usuario no encontrado en AniList' : (res.errors[0]?.message || 'Error al buscar'));
        setLoading(false);
        return;
      }

      const lists = res.data?.MediaListCollection?.lists || [];
      const formatMap = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Película', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
      const items = { schedule: [], watchLater: [], watched: [] };

      lists.forEach(list => {
        (list.entries || []).forEach(entry => {
          const m = entry.media;
          if (!m) return;
          const dest = STATUS_MAP[entry.status] || 'watchLater';
          const anime = {
            id: m.idMal || (m.id + 300000),
            title: m.title?.english || m.title?.romaji || '',
            titleJp: m.title?.native || '',
            image: m.coverImage?.large || '',
            imageSm: m.coverImage?.medium || m.coverImage?.large || '',
            genres: m.genres || [],
            synopsis: (m.description || '').replace(/<[^>]*>/g, '').trim() || 'Sin sinopsis.',
            rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : 0,
            episodes: m.episodes || null,
            type: formatMap[m.format] || m.format || '',
            year: m.seasonYear || '',
            source: 'AniList',
            malUrl: m.siteUrl || '',
            watchLink: '',
            currentEp: entry.progress || 0,
            userRating: entry.score || 0,
            notes: '',
            _importStatus: entry.status,
            _finished: entry.status === 'COMPLETED',
            _dropped: entry.status === 'DROPPED'
          };
          items[dest].push(anime);
        });
      });

      setPreview(items);
    } catch (e) {
      setError('Error de conexión con AniList');
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
      <div className="import-modal fade-in" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        <h2 className="import-title">Importar desde AniList</h2>
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
