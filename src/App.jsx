import React, { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

// Componentes y Hooks
import AnimeCard from './components/AnimeCard';
import StarRating from './components/StarRating';
import { useFirebase } from './hooks/useFirebase';
import { useAnimeData } from './hooks/useAnimeData';
import { useDragDrop } from './hooks/useDragDrop';

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const dayEmojis = ['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'];

const sanitizeUrl = (url) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? url : '';
  } catch { return ''; }
};

const emptySchedule = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };

export default function AnimeTracker() {
  // --- Estados Locales (Persistencia básica) ---
  const [activeTab, setActiveTab] = useState('schedule');
  const [showSearch, setShowSearch] = useState(false);
  const [showAnimeDetail, setShowAnimeDetail] = useState(null);
  const [showDayPicker, setShowDayPicker] = useState(null);
  const [showMoveDayPicker, setShowMoveDayPicker] = useState(null);
  const [watchedFilter, setWatchedFilter] = useState('all');
  const [watchedSort, setWatchedSort] = useState('date');

  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('anitracker-theme') !== 'light'; } catch { return true; }
  });

  const [schedule, setSchedule] = useState(() => {
    try { const s = localStorage.getItem('animeSchedule'); return s ? JSON.parse(s) : { ...emptySchedule }; } catch { return { ...emptySchedule }; }
  });
  const [watchedList, setWatchedList] = useState(() => {
    try { const s = localStorage.getItem('watchedAnimes'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [watchLater, setWatchLater] = useState(() => {
    try { const s = localStorage.getItem('watchLater'); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  // --- Nuevos estados ---
  const [toast, setToast] = useState(null);
  const [localSearch, setLocalSearch] = useState('');
  const [seasonAnime, setSeasonAnime] = useState([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const toastTimer = useRef(null);

  // Persistencia en localStorage
  useEffect(() => { localStorage.setItem('animeSchedule', JSON.stringify(schedule)); }, [schedule]);
  useEffect(() => { localStorage.setItem('watchedAnimes', JSON.stringify(watchedList)); }, [watchedList]);
  useEffect(() => { localStorage.setItem('watchLater', JSON.stringify(watchLater)); }, [watchLater]);
  useEffect(() => { localStorage.setItem('anitracker-theme', darkMode ? 'dark' : 'light'); }, [darkMode]);

  // --- HOOKS PERSONALIZADOS ---
  const { user, syncing, loginWithGoogle, logout, FIREBASE_ENABLED } = useFirebase(
    schedule, watchedList, watchLater, setSchedule, setWatchedList, setWatchLater
  );

  const {
    searchQuery, setSearchQuery, searchResults, setSearchResults, isSearching, airingData, handleSearch
  } = useAnimeData(schedule);

  const {
    isDragging, dropTarget, dropIndex, handleDragStart, handleDragEnd,
    handleDragOverRow, handleDragOverCard, handleDrop,
    handleTouchStart, handleTouchMove, handleTouchEnd, touchRef, dragState
  } = useDragDrop(schedule, setSchedule, daysOfWeek);

  const dayRowRefs = useRef({});

  // --- Toast system ---
  const showToast = (message, undoFn) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
    setToast({ message, undoFn });
  };
  const dismissToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  };
  const undoToast = () => {
    if (toast?.undoFn) toast.undoFn();
    dismissToast();
  };

  // --- Acciones de la UI ---
  const addToSchedule = (anime, day) => {
    const a = { ...anime, currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setSchedule(prev => ({ ...prev, [day]: [...prev[day].filter(x => x.id !== a.id), a] }));
    setShowDayPicker(null); setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const removeFromSchedule = (animeId, day) => {
    setSchedule(prev => ({ ...prev, [day]: prev[day].filter(a => a.id !== animeId) }));
  };

  const markAsFinished = (anime, day) => {
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevWatched = [...watchedList];
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: true, finishedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" marcado como finalizado`, () => {
      setSchedule(prevSchedule);
      setWatchedList(prevWatched);
    });
  };

  const dropAnime = (anime, day) => {
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevWatched = [...watchedList];
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: false, droppedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" dropeado`, () => {
      setSchedule(prevSchedule);
      setWatchedList(prevWatched);
    });
  };

  const addToWatchLater = (anime) => {
    const a = { ...anime, currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setWatchLater(prev => [...prev.filter(x => x.id !== a.id), a]);
    setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const markAsWatchedFromSearch = (anime) => {
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: true, finishedDate: new Date().toISOString(), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' }]);
    setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const moveFromWatchLaterToSchedule = (anime, day) => {
    setWatchLater(prev => prev.filter(a => a.id !== anime.id));
    setSchedule(prev => ({ ...prev, [day]: [...prev[day].filter(a => a.id !== anime.id), anime] }));
  };

  const resumeAnime = (anime) => {
    const prevWatched = [...watchedList];
    setWatchedList(prev => prev.filter(a => a.id !== anime.id));
    setShowDayPicker(anime);
    showToast(`"${anime.title}" retomado`, () => {
      setWatchedList(prevWatched);
    });
  };

  const moveAnimeToDay = (anime, fromDay, toDay) => {
    setSchedule(prev => {
      const next = { ...prev };
      next[fromDay] = next[fromDay].filter(a => a.id !== anime.id);
      next[toDay] = [...next[toDay].filter(a => a.id !== anime.id), anime];
      return next;
    });
    setShowMoveDayPicker(null);
  };

  const updateEpisode = (animeId, delta) => {
    const update = (list) => list.map(a => a.id === animeId ? { ...a, currentEp: Math.max(0, (a.currentEp || 0) + delta) } : a);
    setSchedule(prev => { const n = { ...prev }; daysOfWeek.forEach(d => { n[d] = update(n[d]); }); return n; });
    setWatchLater(prev => update(prev));
    setWatchedList(prev => update(prev));
  };

  const updateAnimeLink = (animeId, link) => {
    const update = (list) => list.map(a => a.id === animeId ? { ...a, watchLink: link } : a);
    setSchedule(prev => { const n = { ...prev }; daysOfWeek.forEach(d => { n[d] = update(n[d]); }); return n; });
    setWatchLater(prev => update(prev));
    setWatchedList(prev => update(prev));
  };

  const updateUserRating = (animeId, rating) => {
    const update = (list) => list.map(a => a.id === animeId ? { ...a, userRating: rating } : a);
    setSchedule(prev => { const n = { ...prev }; daysOfWeek.forEach(d => { n[d] = update(n[d]); }); return n; });
    setWatchLater(prev => update(prev));
    setWatchedList(prev => update(prev));
  };

  const updateAnimeNotes = (animeId, notes) => {
    const update = (list) => list.map(a => a.id === animeId ? { ...a, notes } : a);
    setSchedule(prev => { const n = { ...prev }; daysOfWeek.forEach(d => { n[d] = update(n[d]); }); return n; });
    setWatchLater(prev => update(prev));
    setWatchedList(prev => update(prev));
  };

  // --- Búsqueda local ---
  const filterByLocalSearch = (list) => {
    if (!localSearch.trim()) return list;
    const q = localSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return list.filter(a => {
      const titles = [a.title, a.titleJp, a.titleEn, a.titleOriginal].filter(Boolean);
      return titles.some(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
    });
  };

  // --- Filtrado de lista vista ---
  const getFilteredWatched = () => {
    let list = [...watchedList];
    if (watchedFilter === 'finished') list = list.filter(a => a.finished);
    else if (watchedFilter === 'dropped') list = list.filter(a => !a.finished);

    list = filterByLocalSearch(list);

    if (watchedSort === 'date') list.sort((a, b) => new Date(b.finishedDate || b.droppedDate || 0) - new Date(a.finishedDate || a.droppedDate || 0));
    else if (watchedSort === 'rating') list.sort((a, b) => (b.userRating || 0) - (a.userRating || 0));
    else if (watchedSort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  };

  // --- Temporada actual ---
  const seasonFetchedRef = useRef(false);
  const fetchSeason = () => {
    if (seasonFetchedRef.current) return;
    seasonFetchedRef.current = true;
    setSeasonLoading(true);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
    const query = `query { Page(page: 1, perPage: 30) { media(season: ${season}, seasonYear: ${year}, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      id idMal title { romaji english native } coverImage { large } genres averageScore episodes format status seasonYear description(asHtml: false) siteUrl
    } } }`;
    const formatMap = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Película', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
    fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    }).then(r => r.json()).then(data => {
      setSeasonAnime((data?.data?.Page?.media || []).map(m => ({
        id: m.idMal || (m.id + 300000), title: m.title?.english || m.title?.romaji || '', titleJp: m.title?.native || '',
        image: m.coverImage?.large || '', genres: m.genres || [],
        synopsis: (m.description || '').replace(/<[^>]*>/g, '').trim() || 'Sin sinopsis.',
        rating: m.averageScore ? (m.averageScore / 10).toFixed(1) : 0, episodes: m.episodes || null,
        type: formatMap[m.format] || m.format || '', year: m.seasonYear || year, status: m.status || '',
        source: 'AniList', malUrl: m.siteUrl || '', watchLink: '', currentEp: 0, userRating: 0, notes: ''
      })));
    }).catch(() => { seasonFetchedRef.current = false; }).finally(() => setSeasonLoading(false));
  };

  // --- Estadísticas ---
  const stats = useMemo(() => {
    const allSchedule = daysOfWeek.flatMap(d => schedule[d] || []);
    const totalSchedule = allSchedule.length;
    const totalWatched = watchedList.length;
    const totalWatchLater = watchLater.length;
    const finished = watchedList.filter(a => a.finished).length;
    const dropped = watchedList.filter(a => !a.finished).length;

    const allAnime = [...allSchedule, ...watchedList, ...watchLater];
    const totalEps = allAnime.reduce((sum, a) => sum + (a.currentEp || 0), 0);

    const rated = allAnime.filter(a => a.userRating > 0);
    const avgRating = rated.length > 0 ? (rated.reduce((s, a) => s + a.userRating, 0) / rated.length).toFixed(1) : '—';

    const genreCount = {};
    allAnime.forEach(a => (a.genres || []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; }));
    const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const sourceCount = {};
    allAnime.forEach(a => { if (a.source) sourceCount[a.source] = (sourceCount[a.source] || 0) + 1; });

    return { totalSchedule, totalWatched, totalWatchLater, finished, dropped, totalEps, avgRating, topGenres, allTotal: allAnime.length, sourceCount };
  }, [schedule, watchedList, watchLater]);

  // --- RENDER ---
  return (
    <div className={`anime-tracker ${darkMode ? 'dark' : 'light'}`}>
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="logo">AniTracker</h1>
            <button className="search-btn" onClick={() => setShowSearch(true)}>🔍 Buscar...</button>
          </div>
          <div className="header-right">
            <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? '☀️ Claro' : '🌙 Oscuro'}
            </button>
            {FIREBASE_ENABLED && !user && (
              <button className="auth-btn google" onClick={loginWithGoogle}>🔑 Google</button>
            )}
            {user && (
              <>
                <div className="user-info">
                  {user.photoURL && <img src={user.photoURL} alt="" />}
                  <span>{user.displayName?.split(' ')[0]}</span>
                </div>
                {syncing && <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>☁️ Sincronizando...</span>}
                <button className="auth-btn" onClick={logout}>Salir</button>
              </>
            )}
          </div>
        </div>
      </header>

      <nav className="nav-tabs">
        <button className={`nav-tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => { setActiveTab('schedule'); setLocalSearch(''); }}>📅 Semana</button>
        <button className={`nav-tab ${activeTab === 'watchLater' ? 'active' : ''}`} onClick={() => { setActiveTab('watchLater'); setLocalSearch(''); }}>🕐 Después ({watchLater.length})</button>
        <button className={`nav-tab ${activeTab === 'watched' ? 'active' : ''}`} onClick={() => { setActiveTab('watched'); setLocalSearch(''); }}>✓ Vistas ({watchedList.length})</button>
        <button className={`nav-tab ${activeTab === 'season' ? 'active' : ''}`} onClick={() => { setActiveTab('season'); setLocalSearch(''); fetchSeason(); }}>🌸 Temporada</button>
        <button className={`nav-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => { setActiveTab('stats'); setLocalSearch(''); }}>📊 Stats</button>
      </nav>

      <main className="main-content">
        {activeTab === 'schedule' && (
          <div className="schedule-rows">
            {Object.keys(airingData).length > 0 && (
              <AiringSection schedule={schedule} airingData={airingData} onDetail={(a) => setShowAnimeDetail({ ...a, _day: a._day, _isWatchLater: false, _isWatched: false })} />
            )}
            {daysOfWeek.map((day, i) => (
              <div key={day}
                ref={el => { dayRowRefs.current[day] = el; }}
                className={`day-row fade-in ${dropTarget === day ? 'drop-target' : ''} ${isDragging && dragState.fromDay === day ? 'drag-source' : ''}`}
                onDragOver={(e) => handleDragOverRow(e, day)}
                onDrop={(e) => handleDrop(e, day)}
              >
                <div className="day-label">
                  <span className="day-emoji">{dayEmojis[i]}</span>
                  <span className="day-name">{day}</span>
                  <span className="day-count">{schedule[day].length}</span>
                </div>
                <div className="day-animes">
                  {schedule[day].length > 0 ? schedule[day].map((a, idx) => (
                    <React.Fragment key={a.id}>
                      {dropTarget === day && dropIndex === idx && isDragging && dragState.anime?.id !== a.id && (
                        <div className="drop-indicator"></div>
                      )}
                      <AnimeCard
                        anime={a} day={day} cardIndex={idx} cardDay={day} airingData={airingData} isDraggable={true}
                        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOverCard}
                        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                        onClick={() => { if (touchRef.current.moved || touchRef.current.active) return; setShowAnimeDetail({ ...a, _day: day, _isWatchLater: false, _isWatched: false }); }}
                      />
                      {dropTarget === day && dropIndex === idx + 1 && idx === schedule[day].length - 1 && isDragging && (
                        <div className="drop-indicator"></div>
                      )}
                    </React.Fragment>
                  )) : <div className="day-empty">{dropTarget === day ? '⬇️ Soltar aquí' : 'Sin animes'}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'watchLater' && (
          <>
            <div className="section-header"><h2>🕐 Ver más tarde</h2><span className="count">{watchLater.length}</span></div>
            {watchLater.length > 3 && (
              <div className="local-search">
                <input type="text" placeholder="🔍 Filtrar por nombre..." value={localSearch} onChange={e => setLocalSearch(e.target.value)} />
              </div>
            )}
            <div className="anime-grid">
              {(() => {
                const filtered = filterByLocalSearch(watchLater);
                return filtered.length > 0 ? filtered.map(a => (
                  <AnimeCard key={a.id} anime={a} isWatchLater airingData={airingData} onClick={() => setShowAnimeDetail({ ...a, _isWatchLater: true })} />
                )) : <div className="empty-state"><span>📺</span><p>{localSearch ? 'Sin resultados' : 'No hay animes guardados'}</p></div>;
              })()}
            </div>
          </>
        )}

        {activeTab === 'watched' && (
          <>
            <div className="section-header"><h2>✓ Series vistas</h2><span className="count">{watchedList.length}</span></div>
            <div className="filter-bar">
              {['all', 'finished', 'dropped'].map(f => (
                  <button key={f} className={`filter-btn ${watchedFilter === f ? 'active' : ''}`} onClick={() => setWatchedFilter(f)}>
                      {f === 'all' ? 'Todas' : f === 'finished' ? '✓ Completadas' : '⏸ Dropeadas'}
                  </button>
              ))}
              <span style={{ opacity: 0.3 }}>|</span>
              {['date', 'rating', 'title'].map(s => (
                  <button key={s} className={`sort-btn ${watchedSort === s ? 'active' : ''}`} onClick={() => setWatchedSort(s)}>
                      {s === 'date' ? 'Fecha' : s === 'rating' ? 'Valoración' : 'A-Z'}
                  </button>
              ))}
            </div>
            {watchedList.length > 3 && (
              <div className="local-search">
                <input type="text" placeholder="🔍 Filtrar por nombre..." value={localSearch} onChange={e => setLocalSearch(e.target.value)} />
              </div>
            )}
            <div className="anime-grid">
              {(() => {
                const filtered = getFilteredWatched();
                return filtered.length > 0 ? filtered.map(a => (
                  <AnimeCard key={a.id} anime={a} isWatched airingData={airingData} onClick={() => setShowAnimeDetail({ ...a, _isWatched: true })} />
                )) : <div className="empty-state"><span>🎬</span><p>No hay resultados</p></div>;
              })()}
            </div>
          </>
        )}

        {activeTab === 'season' && (
          <SeasonSection
            seasonAnime={seasonAnime} seasonLoading={seasonLoading}
            schedule={schedule} watchedList={watchedList} watchLater={watchLater}
            setShowDayPicker={setShowDayPicker} addToWatchLater={addToWatchLater}
            onDetail={(a) => setShowAnimeDetail({ ...a, _isWatchLater: false, _isWatched: false, _isSeason: true })}
          />
        )}

        {activeTab === 'stats' && <StatsPanel stats={stats} />}
      </main>

      {/* Toast */}
      {toast && (
        <div className="toast fade-in">
          <span className="toast-message">{toast.message}</span>
          <div className="toast-actions">
            {toast.undoFn && <button className="toast-undo" onClick={undoToast}>Deshacer</button>}
            <button className="toast-close" onClick={dismissToast}>✕</button>
          </div>
        </div>
      )}

      {/* MODALES */}
      {showSearch && <SearchModal
        setShowSearch={setShowSearch} searchQuery={searchQuery}
        handleSearch={handleSearch} searchResults={searchResults} isSearching={isSearching}
        setSearchResults={setSearchResults} setSearchQuery={setSearchQuery} setShowDayPicker={setShowDayPicker}
        addToWatchLater={addToWatchLater} markAsWatchedFromSearch={markAsWatchedFromSearch}
      />}

      {showAnimeDetail && <AnimeDetailModal
        key={showAnimeDetail.id}
        showAnimeDetail={showAnimeDetail} setShowAnimeDetail={setShowAnimeDetail} airingData={airingData}
        updateEpisode={updateEpisode} updateUserRating={updateUserRating} updateAnimeLink={updateAnimeLink}
        updateAnimeNotes={updateAnimeNotes}
        markAsFinished={markAsFinished} dropAnime={dropAnime} setShowMoveDayPicker={setShowMoveDayPicker}
        setShowDayPicker={setShowDayPicker} resumeAnime={resumeAnime}
      />}

      {showDayPicker && <DayPickerModal
        showDayPicker={showDayPicker} setShowDayPicker={setShowDayPicker}
        watchLater={watchLater} addToSchedule={addToSchedule}
        moveFromWatchLaterToSchedule={moveFromWatchLaterToSchedule}
      />}

      {showMoveDayPicker && <MoveDayPickerModal
        showMoveDayPicker={showMoveDayPicker} setShowMoveDayPicker={setShowMoveDayPicker}
        moveAnimeToDay={moveAnimeToDay}
      />}
    </div>
  );
}

// --- SUB-COMPONENTES ---

const AiringSection = ({ schedule, airingData, onDetail }) => {
    const allAnime = daysOfWeek.flatMap(d => (schedule[d] || []).map(a => ({ ...a, _day: d })));
    const airingAnime = allAnime.filter(a => airingData[a.id]).map(a => ({
        ...a, airing: airingData[a.id]
    })).sort((a, b) => a.airing.airingAt - b.airing.airingAt);

    if (airingAnime.length === 0) return null;

    const formatAiringTime = (airing) => {
        if (airing.hasAired) return '¡Ya disponible!';
        if (airing.isToday) {
            const hours = Math.floor(airing.timeUntilAiring / 3600);
            const mins = Math.floor((airing.timeUntilAiring % 3600) / 60);
            return hours > 0 ? `En ${hours}h ${mins}m` : `En ${mins}m`;
        }
        if (airing.isTomorrow) return 'Mañana';
        const date = new Date(airing.airingAt * 1000);
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return dayNames[date.getDay()];
    };

    return (
        <div className="airing-section fade-in">
            <div className="airing-header">
                <span className="airing-icon">📡</span><h3>Próximos episodios</h3><span className="airing-count">{airingAnime.length}</span>
            </div>
            <div className="airing-list">
                {airingAnime.map(a => (
                    <div key={a.id} className={`airing-item ${a.airing.hasAired ? 'aired' : a.airing.isToday ? 'today' : ''}`}
                        onClick={() => onDetail(a)}>
                        <img src={a.image} alt={a.title} className="airing-img" />
                        <div className="airing-info">
                            <span className="airing-title">{a.title}</span>
                            <span className="airing-ep">Ep. {a.airing.episode}{a.airing.totalEpisodes ? ` / ${a.airing.totalEpisodes}` : ''}</span>
                        </div>
                        <div className={`airing-time ${a.airing.hasAired ? 'aired' : a.airing.isToday ? 'today' : a.airing.isTomorrow ? 'tomorrow' : 'later'}`}>
                            {formatAiringTime(a.airing)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SearchModal = ({ setShowSearch, searchQuery, handleSearch, searchResults, isSearching, setSearchResults, setSearchQuery, setShowDayPicker, addToWatchLater, markAsWatchedFromSearch }) => (
    <div className="modal-overlay" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-header">
          <input type="text" placeholder="🔍 Buscar anime o serie..." value={searchQuery} onChange={e => handleSearch(e.target.value)} autoFocus />
          <button className="close-btn" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>×</button>
        </div>
        <div className="search-results">
          {isSearching ? <div className="search-placeholder"><div className="spinner"></div><p>Buscando...</p></div>
          : searchResults.length > 0 ? searchResults.map(anime => (
            <div key={anime.id} className="search-result-item fade-in">
              <img src={anime.image} alt={anime.title} />
              <div className="search-result-info">
                <div className="search-result-title-row"><h4>{anime.title}</h4><span className="source-badge">{anime.source}</span></div>
                {anime.altTitles?.length > 0 && <p className="alt-titles">También: {anime.altTitles.slice(0, 3).join(' · ')}</p>}
                <div className="search-result-meta">
                  {anime.type && <span className="meta-tag type">{anime.type}</span>}
                  {anime.year && <span className="meta-tag year">{anime.year}</span>}
                  {anime.episodes && <span className="meta-tag eps">{anime.episodes} eps</span>}
                  {anime.rating > 0 && <span className="meta-tag score">⭐ {Number(anime.rating).toFixed(1)}</span>}
                </div>
                <div className="search-result-genres">{(anime.genres || []).slice(0, 3).map((g, i) => <span key={i} className="genre-tag-sm">{g}</span>)}</div>
                <a href={anime.malUrl} target="_blank" rel="noopener noreferrer" className="mal-link">Ver en {anime.source} ↗</a>
              </div>
              <div className="search-result-actions">
                <button className="add-btn schedule-btn" onClick={() => setShowDayPicker(anime)}>📅 Semana</button>
                <button className="add-btn later-btn" onClick={() => addToWatchLater(anime)}>🕐 Después</button>
                <button className="add-btn watched-btn" onClick={() => markAsWatchedFromSearch(anime)}>✓ Ya la vi</button>
              </div>
            </div>
          )) : searchQuery.length > 1 ? <div className="no-results"><span>😢</span><p>Sin resultados para "{searchQuery}"</p></div>
          : <div className="search-placeholder"><span>🎌</span><p>Buscá cualquier anime o serie</p><p className="search-hint">MyAnimeList · Kitsu · AniList · TVMaze</p></div>}
        </div>
      </div>
    </div>
);

const AnimeDetailModal = ({ showAnimeDetail, setShowAnimeDetail, airingData, updateEpisode, updateUserRating, updateAnimeLink, updateAnimeNotes, markAsFinished, dropAnime, setShowMoveDayPicker, setShowDayPicker, resumeAnime }) => {
    // Compute initial synopsis synchronously (Spanish detection + cache check)
    const getInitialSynopsis = () => {
        const syn = showAnimeDetail?.synopsis;
        if (!syn || syn.length < 10) return { text: null, needsFetch: false };
        const esPattern = /\b(que|los|las|una|del|por|con|para|como|pero|más|también|esta|este|sobre|tiene|hace|puede|entre|desde|hasta|cuando|donde|porque|aunque|mientras|después|antes|durante|hacia|según|mediante|ser|está|son|han|fue|muy|sin|hay|todo|cada|otro|ella|ellos|quien|cual|esto|eso|sus|nos|al|lo)\b/gi;
        const enPattern = /\b(the|and|but|with|for|that|this|from|are|was|were|been|have|has|had|will|would|could|should|their|they|them|which|when|where|who|what|into|about|after|before|between|through|during|being|each|other|than|then|some|only|also|very|just|over|such|more)\b/gi;
        const esMatches = (syn.match(esPattern) || []).length;
        const enMatches = (syn.match(enPattern) || []).length;
        const wordCount = syn.split(/\s+/).length;
        if (esMatches > enMatches && esMatches / wordCount > 0.06) return { text: syn, needsFetch: false };
        try { const cached = localStorage.getItem(`anitracker-tr-${showAnimeDetail.id}`); if (cached) return { text: cached, needsFetch: false }; } catch { /* empty */ }
        return { text: null, needsFetch: true };
    };
    const initialSynopsis = getInitialSynopsis();

    const [localRating, setLocalRating] = useState(showAnimeDetail?.userRating || 0);
    const [localLink, setLocalLink] = useState(showAnimeDetail?.watchLink || '');
    const [localNotes, setLocalNotes] = useState(showAnimeDetail?.notes || '');
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [translatedSynopsis, setTranslatedSynopsis] = useState(initialSynopsis.text);
    const [isTranslating, setIsTranslating] = useState(initialSynopsis.needsFetch);

    // Only fetch translation if needed (not already Spanish or cached)
    useEffect(() => {
        if (!initialSynopsis.needsFetch) return;
        let cancelled = false;
        const syn = showAnimeDetail?.synopsis;
        const cacheKey = `anitracker-tr-${showAnimeDetail?.id}`;
        fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent((syn || '').slice(0, 1500))}&langpair=en|es`)
            .then(r => r.json()).then(data => {
                if (cancelled) return;
                if (data.responseStatus === 200 && data.responseData?.translatedText) {
                    const tr = data.responseData.translatedText;
                    if (tr !== tr.toUpperCase() || tr.length < 50) {
                        setTranslatedSynopsis(tr);
                        try { localStorage.setItem(cacheKey, tr); } catch { /* empty */ }
                    } else setTranslatedSynopsis(syn);
                } else setTranslatedSynopsis(syn);
            }).catch(() => { if (!cancelled) setTranslatedSynopsis(syn); })
            .finally(() => { if (!cancelled) setIsTranslating(false); });
        return () => { cancelled = true; };
    }, [showAnimeDetail?.id, showAnimeDetail?.synopsis, initialSynopsis.needsFetch]);

    if (!showAnimeDetail) return null;
    const a = showAnimeDetail;
    const isSchedule = !a._isWatchLater && !a._isWatched && !a._isSeason;
    const closeAndDo = (fn) => { setShowAnimeDetail(null); fn(); };
    const airing = airingData[a.id];

    return (
        <div className="modal-overlay" onClick={() => setShowAnimeDetail(null)}>
            <div className="detail-modal fade-in" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={() => setShowAnimeDetail(null)}>×</button>
                <div className="detail-header">
                    <img src={a.image} alt={a.title} />
                    <div className="detail-info">
                        <h2>{a.title}</h2>
                        {a.titleJp && <p className="title-jp">{a.titleJp}</p>}
                        <div className="detail-meta">
                            {a.type && <span className="meta-tag type">{a.type}</span>}
                            {a.year && <span className="meta-tag year">{a.year}</span>}
                            {a.episodes && <span className="meta-tag eps">{a.episodes} episodios</span>}
                        </div>
                        <div className="detail-genres">{(a.genres || []).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}</div>
                        {a.rating > 0 && <div className="detail-score"><span className="score-label">Valoración:</span><span className="score-value">⭐ {Number(a.rating).toFixed(1)}</span></div>}
                    </div>
                </div>

                <div className="detail-synopsis">
                    <h4>📖 Sinopsis</h4>
                    {isTranslating ? <p className="synopsis-loading">Traduciendo<span className="dot-anim">...</span></p>
                    : <p>{translatedSynopsis || a.synopsis || 'Sin sinopsis.'}</p>}
                </div>

                {airing && (
                    <div className={`detail-section detail-airing ${airing.hasAired ? 'aired' : airing.isToday ? 'today' : ''}`}>
                        <h4>{airing.hasAired ? '🆕 ¡Episodio disponible!' : airing.isToday ? '🔴 Sale hoy' : airing.isTomorrow ? '📢 Sale mañana' : '📡 Próximamente'}</h4>
                        <div className="detail-airing-info">
                            <span className="detail-airing-ep">Episodio {airing.episode}</span>
                            <span className="detail-airing-date">{new Date(airing.airingAt * 1000).toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {isSchedule && (
                    <div className="detail-section">
                        <h4>📺 Episodio actual</h4>
                        <div className="episode-controls">
                            <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, -1); setShowAnimeDetail(p => ({ ...p, currentEp: Math.max(0, (p.currentEp || 0) - 1) })); }}>−</button>
                            <span className="ep-number">{a.currentEp || 0}</span>
                            <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, 1); setShowAnimeDetail(p => ({ ...p, currentEp: (p.currentEp || 0) + 1 })); }}>+</button>
                        </div>
                    </div>
                )}

                <div className="detail-section">
                    <h4>★ Tu valoración</h4>
                    <div className="detail-rating-row">
                        <StarRating rating={localRating} size={24} interactive onChange={(r) => { setLocalRating(r); updateUserRating(a.id, r); }} />
                    </div>
                </div>

                <div className="detail-section">
                    <h4>🔗 Link</h4>
                    {a.watchLink && !showLinkInput ? (
                        <div className="detail-link-row">
                            <a href={sanitizeUrl(a.watchLink)} target="_blank" rel="noopener noreferrer" className="platform-btn watch">▶ Ver ahora</a>
                            <button className="detail-action-sm" onClick={() => setShowLinkInput(true)}>✏️ Editar</button>
                        </div>
                    ) : (
                        <div className="detail-link-edit">
                            <input type="url" placeholder="URL..." value={localLink} onChange={e => setLocalLink(e.target.value)} />
                            <button className="save-link-btn" onClick={() => { updateAnimeLink(a.id, localLink); setShowLinkInput(false); }}>Guardar</button>
                        </div>
                    )}
                </div>

                <div className="detail-section">
                    <h4>📝 Notas</h4>
                    <textarea
                        className="notes-input"
                        placeholder="Escribí notas sobre este anime..."
                        value={localNotes}
                        onChange={e => setLocalNotes(e.target.value)}
                        onBlur={() => updateAnimeNotes(a.id, localNotes)}
                        rows={3}
                    />
                </div>

                <div className="detail-actions">
                    {isSchedule && <>
                        <button className="detail-action-btn finish" onClick={() => closeAndDo(() => markAsFinished(a, a._day))}>✓ Finalizar</button>
                        <button className="detail-action-btn drop" onClick={() => closeAndDo(() => dropAnime(a, a._day))}>✗ Dropear</button>
                        <button className="detail-action-btn move" onClick={() => closeAndDo(() => setShowMoveDayPicker({ anime: a, fromDay: a._day }))}>↔ Mover día</button>
                    </>}
                    {(a._isWatchLater || a._isSeason) && <button className="detail-action-btn schedule" onClick={() => closeAndDo(() => setShowDayPicker(a))}>📅 Añadir a semana</button>}
                    {a._isWatched && !a.finished && <button className="detail-action-btn resume" onClick={() => closeAndDo(() => resumeAnime(a))}>▶ Retomar</button>}
                </div>
            </div>
        </div>
    );
};

const SeasonSection = ({ seasonAnime, seasonLoading, schedule, watchedList, watchLater, setShowDayPicker, addToWatchLater, onDetail }) => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const seasonNames = { 1: 'Invierno', 2: 'Invierno', 3: 'Invierno', 4: 'Primavera', 5: 'Primavera', 6: 'Primavera', 7: 'Verano', 8: 'Verano', 9: 'Verano', 10: 'Otoño', 11: 'Otoño', 12: 'Otoño' };

    // Check which anime are already in user's lists
    const allUserIds = new Set([
        ...daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)),
        ...watchedList.map(a => a.id),
        ...watchLater.map(a => a.id)
    ]);

    return (
        <>
            <div className="section-header">
                <h2>🌸 Temporada {seasonNames[month]} {year}</h2>
                <span className="count">{seasonAnime.length}</span>
            </div>
            {seasonLoading ? (
                <div className="search-placeholder"><div className="spinner"></div><p>Cargando temporada...</p></div>
            ) : seasonAnime.length > 0 ? (
                <div className="season-grid">
                    {seasonAnime.map(anime => (
                        <div key={anime.id} className={`season-card fade-in ${allUserIds.has(anime.id) ? 'already-added' : ''}`}>
                            <div className="season-card-image" onClick={() => onDetail(anime)}>
                                <img src={anime.image} alt={anime.title} loading="lazy" onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }} />
                                <div className="img-fallback" style={{ display: 'none' }}>{anime.title?.charAt(0) || '?'}</div>
                                {anime.rating > 0 && <div className="anime-card-score">⭐ {Number(anime.rating).toFixed(1)}</div>}
                            </div>
                            <div className="season-card-content">
                                <h3 onClick={() => onDetail(anime)}>{anime.title}</h3>
                                <div className="anime-genres">
                                    {(anime.genres || []).slice(0, 2).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}
                                </div>
                                <div className="season-card-meta">
                                    {anime.type && <span className="meta-tag type">{anime.type}</span>}
                                    {anime.episodes && <span className="meta-tag eps">{anime.episodes} eps</span>}
                                </div>
                                {allUserIds.has(anime.id) ? (
                                    <div className="season-added-badge">✓ En tu lista</div>
                                ) : (
                                    <div className="season-card-actions">
                                        <button className="add-btn schedule-btn" onClick={() => setShowDayPicker(anime)}>📅</button>
                                        <button className="add-btn later-btn" onClick={() => addToWatchLater(anime)}>🕐</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : <div className="empty-state"><span>🌸</span><p>No se pudo cargar la temporada</p></div>}
        </>
    );
};

const StatsPanel = ({ stats }) => (
    <div className="stats-panel fade-in">
        <div className="section-header"><h2>📊 Estadísticas</h2></div>
        <div className="stats-grid">
            <div className="stat-card">
                <span className="stat-number">{stats.allTotal}</span>
                <span className="stat-label">Total animes</span>
            </div>
            <div className="stat-card">
                <span className="stat-number">{stats.totalSchedule}</span>
                <span className="stat-label">En semana</span>
            </div>
            <div className="stat-card">
                <span className="stat-number">{stats.finished}</span>
                <span className="stat-label">Completados</span>
            </div>
            <div className="stat-card">
                <span className="stat-number">{stats.dropped}</span>
                <span className="stat-label">Dropeados</span>
            </div>
            <div className="stat-card">
                <span className="stat-number">{stats.totalWatchLater}</span>
                <span className="stat-label">Ver después</span>
            </div>
            <div className="stat-card">
                <span className="stat-number">{stats.totalEps}</span>
                <span className="stat-label">Episodios vistos</span>
            </div>
            <div className="stat-card wide">
                <span className="stat-number">{stats.avgRating}</span>
                <span className="stat-label">Valoración promedio</span>
            </div>
        </div>
        {stats.topGenres.length > 0 && (
            <div className="stats-section">
                <h3>Géneros favoritos</h3>
                <div className="genre-bars">
                    {stats.topGenres.map(([genre, count]) => (
                        <div key={genre} className="genre-bar-row">
                            <span className="genre-bar-label">{genre}</span>
                            <div className="genre-bar-track">
                                <div className="genre-bar-fill" style={{ width: `${(count / stats.topGenres[0][1]) * 100}%` }}></div>
                            </div>
                            <span className="genre-bar-count">{count}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
);

const DayPickerModal = ({ showDayPicker, setShowDayPicker, watchLater, addToSchedule, moveFromWatchLaterToSchedule }) => (
    <div className="modal-overlay" onClick={() => setShowDayPicker(null)}>
        <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
            <h3>📅 ¿Qué día querés ver "{showDayPicker.title}"?</h3>
            <div className="days-grid">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
                <button key={d} className="day-btn" onClick={() => {
                    const fromWL = watchLater.some(a => a.id === showDayPicker.id);
                    if (fromWL) moveFromWatchLaterToSchedule(showDayPicker, d);
                    else addToSchedule(showDayPicker, d);
                }}>{d}</button>
            ))}</div>
        </div>
    </div>
);

const MoveDayPickerModal = ({ showMoveDayPicker, setShowMoveDayPicker, moveAnimeToDay }) => (
    <div className="modal-overlay" onClick={() => setShowMoveDayPicker(null)}>
        <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
            <h3>↔ Mover "{showMoveDayPicker.anime.title}" a otro día</h3>
            <div className="days-grid">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].filter(d => d !== showMoveDayPicker.fromDay).map(d => (
                <button key={d} className="day-btn" onClick={() => moveAnimeToDay(showMoveDayPicker.anime, showMoveDayPicker.fromDay, d)}>{d}</button>
            ))}</div>
        </div>
    </div>
);
