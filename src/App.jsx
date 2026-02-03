import React, { useState, useEffect, useRef, useCallback } from 'react';

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const dayEmojis = ['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'];

export default function AnimeTracker() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [showDayPicker, setShowDayPicker] = useState(null);
  const [showAnimeDetail, setShowAnimeDetail] = useState(null);
  const [showLinkEditor, setShowLinkEditor] = useState(null);
  const [linkInput, setLinkInput] = useState('');
  const searchTimeout = useRef(null);

  const [schedule, setSchedule] = useState(() => {
    try {
      const saved = localStorage.getItem('animeSchedule');
      return saved ? JSON.parse(saved) : {
        'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [],
        'Viernes': [], 'Sábado': [], 'Domingo': []
      };
    } catch { return { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] }; }
  });

  const [watchedList, setWatchedList] = useState(() => {
    try {
      const saved = localStorage.getItem('watchedAnimes');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [watchLater, setWatchLater] = useState(() => {
    try {
      const saved = localStorage.getItem('watchLater');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => { localStorage.setItem('animeSchedule', JSON.stringify(schedule)); }, [schedule]);
  useEffect(() => { localStorage.setItem('watchedAnimes', JSON.stringify(watchedList)); }, [watchedList]);
  useEffect(() => { localStorage.setItem('watchLater', JSON.stringify(watchLater)); }, [watchLater]);

  // Búsqueda con API de Jikan (MyAnimeList)
  const searchAnime = useCallback(async (query) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=15&sfw=true`);
      const data = await res.json();
      if (data.data) {
        const results = data.data.map(anime => ({
          id: anime.mal_id,
          title: anime.title,
          titleJp: anime.title_japanese || '',
          image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '',
          genres: anime.genres?.map(g => g.name) || [],
          synopsis: anime.synopsis || 'Sin sinopsis disponible.',
          rating: anime.score || 0,
          episodes: anime.episodes || '?',
          status: anime.status || '',
          year: anime.year || anime.aired?.prop?.from?.year || '',
          type: anime.type || '',
          malUrl: `https://myanimelist.net/anime/${anime.mal_id}`,
          watchLink: ''
        }));
        setSearchResults(results);
      }
    } catch (err) {
      console.error('Error buscando:', err);
      setSearchResults([]);
    }
    setIsSearching(false);
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchAnime(query), 500);
  };

  const addToSchedule = (anime, day) => {
    setSchedule(prev => ({
      ...prev,
      [day]: [...prev[day].filter(a => a.id !== anime.id), anime]
    }));
    setShowDayPicker(null);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeFromSchedule = (animeId, day) => {
    setSchedule(prev => ({ ...prev, [day]: prev[day].filter(a => a.id !== animeId) }));
  };

  const markAsFinished = (anime, day) => {
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: true, finishedDate: new Date().toLocaleDateString() }]);
  };

  const dropAnime = (anime, day) => {
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: false, droppedDate: new Date().toLocaleDateString() }]);
  };

  const addToWatchLater = (anime) => {
    setWatchLater(prev => [...prev.filter(a => a.id !== anime.id), anime]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const moveFromWatchLaterToSchedule = (anime, day) => {
    setWatchLater(prev => prev.filter(a => a.id !== anime.id));
    setSchedule(prev => ({ ...prev, [day]: [...prev[day].filter(a => a.id !== anime.id), anime] }));
  };

  const resumeAnime = (anime) => {
    setWatchedList(prev => prev.filter(a => a.id !== anime.id));
    setShowDayPicker(anime);
  };

  const updateAnimeLink = (animeId, link) => {
    const updateInList = (list) => list.map(a => a.id === animeId ? { ...a, watchLink: link } : a);
    setSchedule(prev => {
      const newSchedule = { ...prev };
      daysOfWeek.forEach(day => { newSchedule[day] = updateInList(newSchedule[day]); });
      return newSchedule;
    });
    setWatchLater(prev => updateInList(prev));
    setWatchedList(prev => updateInList(prev));
    setShowLinkEditor(null);
    setLinkInput('');
  };

  // ============ COMPONENTES ============

  const AnimeCard = ({ anime, day, showActions = true, isWatchLater = false, isWatched = false }) => (
    <div className="anime-card" onClick={() => setShowAnimeDetail(anime)}>
      <div className="anime-card-image">
        <img src={anime.image} alt={anime.title} loading="lazy" />
        {anime.rating > 0 && (
          <div className="anime-card-score">⭐ {anime.rating.toFixed ? anime.rating.toFixed(1) : anime.rating}</div>
        )}
      </div>
      <div className="anime-card-content">
        <h3>{anime.title}</h3>
        <div className="anime-genres">
          {(anime.genres || []).slice(0, 2).map((genre, i) => (
            <span key={i} className="genre-tag">{genre}</span>
          ))}
        </div>
        {anime.watchLink && (
          <a href={anime.watchLink} target="_blank" rel="noopener noreferrer" className="watch-link-badge" onClick={e => e.stopPropagation()}>
            ▶ Ver ahora
          </a>
        )}
        {isWatched && (
          <div className={`status-badge ${anime.finished ? 'finished' : 'dropped'}`}>
            {anime.finished ? '✓ Completado' : '⏸ Sin terminar'}
          </div>
        )}
      </div>
      {showActions && (
        <div className="anime-card-actions" onClick={e => e.stopPropagation()}>
          {!isWatchLater && !isWatched && (
            <>
              <button className="action-btn finish" onClick={() => markAsFinished(anime, day)} title="Finalizar">✓</button>
              <button className="action-btn drop" onClick={() => dropAnime(anime, day)} title="Dropear">✗</button>
              <button className="action-btn link-btn" onClick={() => { setShowLinkEditor(anime); setLinkInput(anime.watchLink || ''); }} title="Añadir link">🔗</button>
            </>
          )}
          {isWatchLater && (
            <>
              <button className="action-btn schedule" onClick={() => setShowDayPicker(anime)} title="Añadir a la semana">📅</button>
              <button className="action-btn link-btn" onClick={() => { setShowLinkEditor(anime); setLinkInput(anime.watchLink || ''); }} title="Añadir link">🔗</button>
            </>
          )}
          {isWatched && !anime.finished && (
            <button className="action-btn resume" onClick={() => resumeAnime(anime)} title="Retomar">▶</button>
          )}
        </div>
      )}
    </div>
  );

  const SearchModal = () => (
    <div className="modal-overlay" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-header">
          <input
            type="text"
            placeholder="🔍 Buscar en MyAnimeList..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            autoFocus
          />
          <button className="close-btn" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>×</button>
        </div>
        <div className="search-results">
          {isSearching ? (
            <div className="search-placeholder">
              <div className="spinner"></div>
              <p>Buscando en MyAnimeList...</p>
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map(anime => (
              <div key={anime.id} className="search-result-item">
                <img src={anime.image} alt={anime.title} />
                <div className="search-result-info">
                  <h4>{anime.title}</h4>
                  <div className="search-result-meta">
                    {anime.type && <span className="meta-tag type">{anime.type}</span>}
                    {anime.year && <span className="meta-tag year">{anime.year}</span>}
                    {anime.episodes && <span className="meta-tag eps">{anime.episodes} eps</span>}
                    {anime.rating > 0 && <span className="meta-tag score">⭐ {anime.rating.toFixed(1)}</span>}
                  </div>
                  <div className="search-result-genres">
                    {(anime.genres || []).slice(0, 3).map((g, i) => (
                      <span key={i} className="genre-tag-sm">{g}</span>
                    ))}
                  </div>
                  <a href={anime.malUrl} target="_blank" rel="noopener noreferrer" className="mal-link">
                    Ver en MyAnimeList ↗
                  </a>
                </div>
                <div className="search-result-actions">
                  <button className="add-btn schedule-btn" onClick={() => setShowDayPicker(anime)}>
                    📅 Añadir a la semana
                  </button>
                  <button className="add-btn later-btn" onClick={() => addToWatchLater(anime)}>
                    🕐 Ver más tarde
                  </button>
                </div>
              </div>
            ))
          ) : searchQuery.length > 1 ? (
            <div className="no-results">
              <span>😢</span>
              <p>No se encontraron resultados para "{searchQuery}"</p>
            </div>
          ) : (
            <div className="search-placeholder">
              <span>🎌</span>
              <p>Buscá cualquier anime en MyAnimeList</p>
              <p className="search-hint">Escribí al menos 2 letras para buscar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const AnimeDetailModal = () => {
    if (!showAnimeDetail) return null;
    const anime = showAnimeDetail;
    return (
      <div className="modal-overlay" onClick={() => setShowAnimeDetail(null)}>
        <div className="detail-modal" onClick={e => e.stopPropagation()}>
          <button className="close-btn" onClick={() => setShowAnimeDetail(null)}>×</button>
          <div className="detail-header">
            <img src={anime.image} alt={anime.title} />
            <div className="detail-info">
              <h2>{anime.title}</h2>
              {anime.titleJp && <p className="title-jp">{anime.titleJp}</p>}
              <div className="detail-meta">
                {anime.type && <span className="meta-tag type">{anime.type}</span>}
                {anime.year && <span className="meta-tag year">{anime.year}</span>}
                {anime.episodes && <span className="meta-tag eps">{anime.episodes} episodios</span>}
                {anime.status && <span className="meta-tag status">{anime.status}</span>}
              </div>
              <div className="detail-genres">
                {(anime.genres || []).map((genre, i) => (
                  <span key={i} className="genre-tag">{genre}</span>
                ))}
              </div>
              {anime.rating > 0 && (
                <div className="detail-score">
                  <span className="score-label">Valoración MAL:</span>
                  <span className="score-value">⭐ {anime.rating.toFixed ? anime.rating.toFixed(1) : anime.rating} / 10</span>
                  <div className="score-bar">
                    <div style={{ width: `${(anime.rating / 10) * 100}%` }}></div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="detail-synopsis">
            <h4>📖 Sinopsis:</h4>
            <p>{anime.synopsis}</p>
          </div>
          <div className="detail-links">
            <h4>🔗 Links:</h4>
            <div className="link-buttons">
              <a href={anime.malUrl} target="_blank" rel="noopener noreferrer" className="platform-btn mal">
                📊 MyAnimeList
              </a>
              {anime.watchLink && (
                <a href={anime.watchLink} target="_blank" rel="noopener noreferrer" className="platform-btn watch">
                  ▶ Ver anime
                </a>
              )}
            </div>
            {!anime.watchLink && (
              <p className="no-link-hint">No hay link de visualización. Usá el botón 🔗 en la tarjeta para agregar uno.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const DayPickerModal = () => {
    if (!showDayPicker) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowDayPicker(null)}>
        <div className="day-picker-modal" onClick={e => e.stopPropagation()}>
          <h3>📅 ¿Qué día querés ver "{showDayPicker.title}"?</h3>
          <div className="days-grid">
            {daysOfWeek.map(day => (
              <button key={day} className="day-btn" onClick={() => {
                const isFromWatchLater = watchLater.some(a => a.id === showDayPicker.id);
                if (isFromWatchLater) {
                  moveFromWatchLaterToSchedule(showDayPicker, day);
                } else {
                  addToSchedule(showDayPicker, day);
                }
                setShowDayPicker(null);
              }}>
                {dayEmojis[daysOfWeek.indexOf(day)]} {day}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const LinkEditorModal = () => {
    if (!showLinkEditor) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowLinkEditor(null)}>
        <div className="link-editor-modal" onClick={e => e.stopPropagation()}>
          <h3>🔗 Link para ver "{showLinkEditor.title}"</h3>
          <p className="link-hint">Pegá el link de Crunchyroll, Netflix, AnimeFLV, Prime, o donde lo estés viendo</p>
          <input
            type="url"
            placeholder="https://www.crunchyroll.com/es/..."
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            autoFocus
          />
          <div className="link-editor-actions">
            <button className="save-link-btn" onClick={() => updateAnimeLink(showLinkEditor.id, linkInput)}>
              💾 Guardar
            </button>
            {showLinkEditor.watchLink && (
              <button className="remove-link-btn" onClick={() => updateAnimeLink(showLinkEditor.id, '')}>
                🗑 Quitar link
              </button>
            )}
            <button className="cancel-link-btn" onClick={() => setShowLinkEditor(null)}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="anime-tracker">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Zen+Dots&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }

        .anime-tracker {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
          font-family: 'Outfit', sans-serif;
          color: #fff;
          position: relative;
          overflow-x: hidden;
        }

        .anime-tracker::before {
          content: '';
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: 
            radial-gradient(circle at 20% 80%, rgba(255, 107, 107, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(78, 205, 196, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(168, 85, 247, 0.05) 0%, transparent 40%);
          pointer-events: none;
          z-index: 0;
        }

        .header {
          position: sticky; top: 0; z-index: 100;
          background: rgba(15, 15, 26, 0.95);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1rem 2rem;
        }

        .header-content {
          max-width: 1400px; margin: 0 auto;
          display: flex; justify-content: space-between; align-items: center;
        }

        .logo {
          font-family: 'Zen Dots', cursive; font-size: 1.8rem;
          background: linear-gradient(135deg, #ff6b6b, #4ecdc4, #a855f7);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }

        .search-btn {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(78, 205, 196, 0.2));
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 50px; color: #fff; font-size: 1rem; cursor: pointer;
          transition: all 0.3s ease;
        }
        .search-btn:hover {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(78, 205, 196, 0.4));
          transform: translateY(-2px); box-shadow: 0 10px 30px rgba(168, 85, 247, 0.3);
        }

        .nav-tabs {
          display: flex; gap: 0.5rem; padding: 1rem 2rem;
          max-width: 1400px; margin: 0 auto; position: relative; z-index: 1;
          flex-wrap: wrap;
        }

        .nav-tab {
          padding: 0.75rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px; color: rgba(255, 255, 255, 0.6);
          font-size: 0.95rem; font-weight: 500; cursor: pointer;
          transition: all 0.3s ease;
        }
        .nav-tab:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
        .nav-tab.active {
          background: linear-gradient(135deg, #a855f7, #4ecdc4);
          border-color: transparent; color: #fff;
          box-shadow: 0 5px 20px rgba(168, 85, 247, 0.4);
        }

        .main-content {
          max-width: 1400px; margin: 0 auto;
          padding: 1rem 2rem 3rem; position: relative; z-index: 1;
        }

        .schedule-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1.5rem;
        }

        .day-column {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 20px; padding: 1.25rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          min-height: 400px;
        }

        .day-header {
          font-size: 1.1rem; font-weight: 600;
          margin-bottom: 1rem; padding-bottom: 0.75rem;
          border-bottom: 2px solid;
          border-image: linear-gradient(90deg, #a855f7, #4ecdc4) 1;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .day-header span { font-size: 1.3rem; }

        .anime-card {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 16px; overflow: hidden;
          margin-bottom: 1rem; cursor: pointer;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.08);
          position: relative;
        }
        .anime-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 40px rgba(168, 85, 247, 0.2);
          border-color: rgba(168, 85, 247, 0.3);
        }

        .anime-card-image {
          position: relative; aspect-ratio: 3/4; overflow: hidden;
        }
        .anime-card-image img {
          width: 100%; height: 100%; object-fit: cover;
          transition: transform 0.5s ease;
        }
        .anime-card:hover .anime-card-image img { transform: scale(1.1); }

        .anime-card-score {
          position: absolute; top: 0.5rem; right: 0.5rem;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(5px);
          padding: 0.2rem 0.5rem; border-radius: 8px;
          font-size: 0.75rem; font-weight: 600;
        }

        .anime-card-content { padding: 0.75rem; }
        .anime-card-content h3 {
          font-size: 0.85rem; font-weight: 600;
          margin-bottom: 0.5rem;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .anime-genres { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .genre-tag {
          font-size: 0.65rem; padding: 0.2rem 0.5rem;
          background: rgba(168, 85, 247, 0.2);
          border-radius: 20px; color: #c4b5fd;
        }

        .watch-link-badge {
          display: inline-block; margin-top: 0.5rem;
          padding: 0.25rem 0.6rem; border-radius: 8px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(78, 205, 196, 0.3));
          color: #4ade80; font-size: 0.7rem; font-weight: 600;
          text-decoration: none; transition: all 0.2s ease;
        }
        .watch-link-badge:hover { background: rgba(34, 197, 94, 0.5); }

        .status-badge {
          margin-top: 0.5rem; padding: 0.3rem 0.6rem;
          border-radius: 8px; font-size: 0.7rem; font-weight: 600;
        }
        .status-badge.finished { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .status-badge.dropped { background: rgba(251, 191, 36, 0.2); color: #fcd34d; }

        .anime-card-actions {
          display: flex; gap: 0.5rem;
          padding: 0.5rem 0.75rem 0.75rem;
          opacity: 0; transition: opacity 0.3s ease;
        }
        .anime-card:hover .anime-card-actions { opacity: 1; }

        .action-btn {
          flex: 1; padding: 0.5rem; border: none;
          border-radius: 8px; cursor: pointer;
          font-size: 1rem; transition: all 0.2s ease;
        }
        .action-btn.finish { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
        .action-btn.finish:hover { background: rgba(34, 197, 94, 0.4); }
        .action-btn.drop { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .action-btn.drop:hover { background: rgba(239, 68, 68, 0.4); }
        .action-btn.schedule, .action-btn.resume { background: rgba(168, 85, 247, 0.2); color: #c4b5fd; }
        .action-btn.schedule:hover, .action-btn.resume:hover { background: rgba(168, 85, 247, 0.4); }
        .action-btn.link-btn { background: rgba(78, 205, 196, 0.2); color: #4ecdc4; }
        .action-btn.link-btn:hover { background: rgba(78, 205, 196, 0.4); }

        .section-header {
          display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
        }
        .section-header h2 {
          font-size: 1.5rem; font-weight: 700;
          background: linear-gradient(135deg, #fff, #a855f7);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .section-header .count {
          background: rgba(168, 85, 247, 0.3);
          padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.85rem;
        }

        .anime-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .empty-state {
          grid-column: 1 / -1; text-align: center;
          padding: 4rem 2rem; color: rgba(255, 255, 255, 0.4);
        }
        .empty-state span { font-size: 4rem; display: block; margin-bottom: 1rem; }

        /* MODALS */
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 1rem;
        }

        .search-modal {
          width: 100%; max-width: 700px; max-height: 85vh;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden; display: flex; flex-direction: column;
        }

        .search-header {
          display: flex; gap: 1rem; padding: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .search-header input {
          flex: 1; padding: 1rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50px; color: #fff; font-size: 1rem; font-family: inherit;
        }
        .search-header input:focus {
          outline: none; border-color: rgba(168, 85, 247, 0.5);
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.2);
        }
        .search-header input::placeholder { color: rgba(255, 255, 255, 0.4); }

        .close-btn {
          width: 48px; height: 48px; border-radius: 50%;
          background: rgba(255, 255, 255, 0.1); border: none;
          color: #fff; font-size: 1.5rem; cursor: pointer;
          transition: all 0.2s ease; flex-shrink: 0;
        }
        .close-btn:hover { background: rgba(239, 68, 68, 0.3); }

        .search-results { flex: 1; overflow-y: auto; padding: 1rem; }

        .search-result-item {
          display: flex; gap: 1rem; padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 16px; margin-bottom: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          flex-wrap: wrap; transition: all 0.2s ease;
        }
        .search-result-item:hover { border-color: rgba(168, 85, 247, 0.2); }

        .search-result-item img {
          width: 80px; height: 110px;
          object-fit: cover; border-radius: 12px; flex-shrink: 0;
        }

        .search-result-info { flex: 1; min-width: 200px; }
        .search-result-info h4 { font-size: 1.05rem; margin-bottom: 0.4rem; }

        .search-result-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.4rem; }
        .meta-tag {
          font-size: 0.7rem; padding: 0.2rem 0.5rem;
          border-radius: 6px; font-weight: 500;
        }
        .meta-tag.type { background: rgba(168, 85, 247, 0.2); color: #c4b5fd; }
        .meta-tag.year { background: rgba(78, 205, 196, 0.2); color: #4ecdc4; }
        .meta-tag.eps { background: rgba(251, 191, 36, 0.2); color: #fcd34d; }
        .meta-tag.score { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }
        .meta-tag.status { background: rgba(34, 197, 94, 0.2); color: #4ade80; }

        .search-result-genres { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem; }
        .genre-tag-sm {
          font-size: 0.6rem; padding: 0.15rem 0.4rem;
          background: rgba(255, 255, 255, 0.08); border-radius: 10px;
          color: rgba(255, 255, 255, 0.6);
        }

        .mal-link {
          font-size: 0.75rem; color: #4ecdc4; text-decoration: none;
          transition: color 0.2s;
        }
        .mal-link:hover { color: #fff; }

        .search-result-actions {
          display: flex; gap: 0.5rem; width: 100%; margin-top: 0.5rem;
        }

        .add-btn {
          flex: 1; padding: 0.6rem 1rem;
          border: none; border-radius: 10px;
          color: #fff; font-family: inherit; font-size: 0.85rem;
          cursor: pointer; transition: all 0.2s ease;
        }
        .add-btn:hover { transform: translateY(-2px); }
        .schedule-btn { background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(168, 85, 247, 0.2)); }
        .schedule-btn:hover { background: rgba(168, 85, 247, 0.5); }
        .later-btn { background: linear-gradient(135deg, rgba(251, 191, 36, 0.4), rgba(251, 191, 36, 0.2)); }
        .later-btn:hover { background: rgba(251, 191, 36, 0.5); }

        .spinner {
          width: 40px; height: 40px;
          border: 3px solid rgba(168, 85, 247, 0.2);
          border-top-color: #a855f7;
          border-radius: 50%; margin: 0 auto 1rem;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .no-results, .search-placeholder {
          text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.4);
        }
        .no-results span, .search-placeholder span {
          font-size: 3rem; display: block; margin-bottom: 1rem;
        }
        .search-hint { font-size: 0.85rem; margin-top: 0.5rem; opacity: 0.6; }

        /* DETAIL MODAL */
        .detail-modal {
          width: 100%; max-width: 600px; max-height: 85vh;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.1);
          overflow-y: auto; position: relative; padding: 2rem;
        }
        .detail-modal .close-btn { position: absolute; top: 1rem; right: 1rem; }

        .detail-header { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; }
        .detail-header img {
          width: 150px; height: 220px; object-fit: cover;
          border-radius: 16px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          flex-shrink: 0;
        }

        .detail-info h2 {
          font-size: 1.4rem; margin-bottom: 0.3rem;
          background: linear-gradient(135deg, #fff, #a855f7);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .title-jp { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-bottom: 0.6rem; }

        .detail-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.6rem; }
        .detail-genres { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.8rem; }

        .detail-score { margin-top: 0.5rem; }
        .score-label { font-size: 0.8rem; color: rgba(255,255,255,0.5); }
        .score-value { font-size: 1.1rem; font-weight: 700; color: #fcd34d; margin-left: 0.5rem; }
        .score-bar {
          margin-top: 0.4rem; height: 6px;
          background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;
        }
        .score-bar > div {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, #ff6b6b, #fcd34d, #4ade80);
        }

        .detail-synopsis { margin-bottom: 1.5rem; }
        .detail-synopsis h4 { font-size: 0.9rem; color: rgba(255,255,255,0.6); margin-bottom: 0.5rem; }
        .detail-synopsis p { line-height: 1.6; color: rgba(255,255,255,0.8); font-size: 0.9rem; }

        .detail-links h4 { font-size: 0.9rem; color: rgba(255,255,255,0.6); margin-bottom: 0.75rem; }
        .link-buttons { display: flex; flex-wrap: wrap; gap: 0.75rem; }
        .platform-btn {
          padding: 0.75rem 1.25rem; border-radius: 12px;
          color: #fff; text-decoration: none; font-weight: 500;
          transition: all 0.2s ease;
        }
        .platform-btn:hover { transform: translateY(-3px); box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
        .platform-btn.mal { background: linear-gradient(135deg, #2E51A2, #4267B2); }
        .platform-btn.watch { background: linear-gradient(135deg, #22c55e, #16a34a); }

        .no-link-hint {
          margin-top: 0.75rem; font-size: 0.8rem;
          color: rgba(255,255,255,0.4); font-style: italic;
        }

        /* DAY PICKER */
        .day-picker-modal {
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 24px; border: 1px solid rgba(255,255,255,0.1);
          padding: 2rem; max-width: 400px; width: 100%;
        }
        .day-picker-modal h3 { text-align: center; margin-bottom: 1.5rem; font-size: 1.1rem; }
        .days-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
        .day-btn {
          padding: 1rem;
          background: rgba(168, 85, 247, 0.15);
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 12px; color: #fff; font-family: inherit;
          font-size: 1rem; cursor: pointer; transition: all 0.2s ease;
        }
        .day-btn:hover { background: rgba(168, 85, 247, 0.4); transform: scale(1.02); }
        .day-btn:last-child { grid-column: 1 / -1; }

        /* LINK EDITOR */
        .link-editor-modal {
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 24px; border: 1px solid rgba(255,255,255,0.1);
          padding: 2rem; max-width: 500px; width: 100%;
        }
        .link-editor-modal h3 { margin-bottom: 0.5rem; font-size: 1.1rem; }
        .link-hint {
          font-size: 0.8rem; color: rgba(255,255,255,0.4);
          margin-bottom: 1rem;
        }
        .link-editor-modal input {
          width: 100%; padding: 0.85rem 1rem;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 12px; color: #fff; font-size: 0.95rem;
          font-family: inherit; margin-bottom: 1rem;
        }
        .link-editor-modal input:focus {
          outline: none; border-color: rgba(168, 85, 247, 0.5);
        }

        .link-editor-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .save-link-btn, .remove-link-btn, .cancel-link-btn {
          padding: 0.65rem 1.2rem; border: none; border-radius: 10px;
          color: #fff; font-family: inherit; cursor: pointer;
          transition: all 0.2s ease; font-size: 0.9rem;
        }
        .save-link-btn { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .save-link-btn:hover { transform: translateY(-2px); }
        .remove-link-btn { background: rgba(239, 68, 68, 0.3); }
        .remove-link-btn:hover { background: rgba(239, 68, 68, 0.5); }
        .cancel-link-btn { background: rgba(255,255,255,0.1); }
        .cancel-link-btn:hover { background: rgba(255,255,255,0.2); }

        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
        ::-webkit-scrollbar-thumb { background: rgba(168, 85, 247, 0.3); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(168, 85, 247, 0.5); }

        @media (max-width: 768px) {
          .header-content { flex-direction: column; gap: 1rem; }
          .schedule-grid { grid-template-columns: 1fr; }
          .detail-header { flex-direction: column; align-items: center; text-align: center; }
          .detail-genres { justify-content: center; }
          .search-result-item { flex-direction: column; align-items: center; text-align: center; }
          .search-result-actions { flex-direction: column; }
          .anime-card-actions { opacity: 1; }
        }
      `}</style>

      <header className="header">
        <div className="header-content">
          <h1 className="logo">AniTracker</h1>
          <button className="search-btn" onClick={() => setShowSearch(true)}>
            <span>🔍</span> Buscar anime...
          </button>
        </div>
      </header>

      <nav className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
          📅 Mi Semana
        </button>
        <button className={`nav-tab ${activeTab === 'watchLater' ? 'active' : ''}`} onClick={() => setActiveTab('watchLater')}>
          🕐 Ver más tarde ({watchLater.length})
        </button>
        <button className={`nav-tab ${activeTab === 'watched' ? 'active' : ''}`} onClick={() => setActiveTab('watched')}>
          ✓ Series vistas ({watchedList.length})
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'schedule' && (
          <div className="schedule-grid">
            {daysOfWeek.map((day, i) => (
              <div key={day} className="day-column">
                <h3 className="day-header"><span>{dayEmojis[i]}</span>{day}</h3>
                {schedule[day].length > 0 ? (
                  schedule[day].map(anime => (
                    <AnimeCard key={anime.id} anime={anime} day={day} />
                  ))
                ) : (
                  <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '2rem 0' }}>
                    <p style={{ fontSize: '0.85rem' }}>Sin animes</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'watchLater' && (
          <>
            <div className="section-header">
              <h2>🕐 Ver más tarde</h2>
              <span className="count">{watchLater.length} animes</span>
            </div>
            <div className="anime-grid">
              {watchLater.length > 0 ? watchLater.map(anime => (
                <AnimeCard key={anime.id} anime={anime} isWatchLater={true} />
              )) : (
                <div className="empty-state">
                  <span>📺</span>
                  <p>No tenés animes guardados para ver más tarde</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Buscá un anime y añadilo aquí</p>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'watched' && (
          <>
            <div className="section-header">
              <h2>✓ Series vistas</h2>
              <span className="count">{watchedList.length} animes</span>
            </div>
            <div className="anime-grid">
              {watchedList.length > 0 ? watchedList.map(anime => (
                <AnimeCard key={anime.id} anime={anime} isWatched={true} />
              )) : (
                <div className="empty-state">
                  <span>🎬</span>
                  <p>Aún no marcaste ningún anime como visto</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showSearch && <SearchModal />}
      {showAnimeDetail && <AnimeDetailModal />}
      {showDayPicker && <DayPickerModal />}
      {showLinkEditor && <LinkEditorModal />}
    </div>
  );
}
