import React, { useState, useEffect, useRef, useCallback } from 'react';

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const dayEmojis = ['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'];
const TMDB_KEY = '4ee01aed05036e4a540afae6f3a8e6c2';

// ============ FIREBASE CONFIG ============
// Para activar login con Google, necesitás crear un proyecto en https://console.firebase.google.com
// 1. Crear proyecto → 2. Authentication → Sign-in method → Google → Habilitar
// 3. Firestore Database → Crear base de datos
// 4. Copiar tu config aquí abajo:
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB3AcPFUO8DMBGUdM1emaOEzGtwrZ4BQ0Y",
  authDomain: "animetracker-47abf.firebaseapp.com",
  projectId: "animetracker-47abf",
  storageBucket: "animetracker-47abf.firebasestorage.app",
  messagingSenderId: "757726364049",
  appId: "1:757726364049:web:045a512ed19c25924f5a30"
};
const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "";
// ==========================================

let firebaseApp = null, firebaseAuth = null, firebaseDb = null;
let auth = null, db = null;

const initFirebase = async () => {
  if (!FIREBASE_ENABLED || firebaseApp) return;
  try {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } = await import('firebase/auth');
    const { getFirestore, doc, setDoc, getDoc } = await import('firebase/firestore');
    firebaseApp = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    firebaseAuth = { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged };
    firebaseDb = { doc, setDoc, getDoc };
  } catch (e) { console.error('Firebase init error:', e); }
};

const emptySchedule = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };

export default function AnimeTracker() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showDayPicker, setShowDayPicker] = useState(null);
  const [showMoveDayPicker, setShowMoveDayPicker] = useState(null);
  const [showAnimeDetail, setShowAnimeDetail] = useState(null);
  const [showLinkEditor, setShowLinkEditor] = useState(null);
  const [showRatingEditor, setShowRatingEditor] = useState(null);
  const [linkInput, setLinkInput] = useState('');
  const [ratingInput, setRatingInput] = useState(0);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('anitracker-theme') !== 'light'; } catch { return true; }
  });
  const [watchedFilter, setWatchedFilter] = useState('all');
  const [watchedSort, setWatchedSort] = useState('date');
  const [user, setUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const searchTimeout = useRef(null);

  const [schedule, setSchedule] = useState(() => {
    try { const s = localStorage.getItem('animeSchedule'); return s ? JSON.parse(s) : { ...emptySchedule }; }
    catch { return { ...emptySchedule }; }
  });
  const [watchedList, setWatchedList] = useState(() => {
    try { const s = localStorage.getItem('watchedAnimes'); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [watchLater, setWatchLater] = useState(() => {
    try { const s = localStorage.getItem('watchLater'); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });

  useEffect(() => { localStorage.setItem('animeSchedule', JSON.stringify(schedule)); }, [schedule]);
  useEffect(() => { localStorage.setItem('watchedAnimes', JSON.stringify(watchedList)); }, [watchedList]);
  useEffect(() => { localStorage.setItem('watchLater', JSON.stringify(watchLater)); }, [watchLater]);
  useEffect(() => { localStorage.setItem('anitracker-theme', darkMode ? 'dark' : 'light'); }, [darkMode]);

  // Firebase Auth
  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    initFirebase().then(() => {
      if (!firebaseAuth || !auth) return;
      firebaseAuth.onAuthStateChanged(auth, (u) => { setUser(u); if (u) loadFromCloud(u.uid); });
    });
  }, []);

  const loginWithGoogle = async () => {
    if (!FIREBASE_ENABLED) { alert('Firebase no está configurado.'); return; }
    await initFirebase();
    if (!firebaseAuth || !auth) return;
    const provider = new firebaseAuth.GoogleAuthProvider();
    try { await firebaseAuth.signInWithPopup(auth, provider); } catch (e) { console.error('Login error:', e); }
  };

  const logout = async () => {
    if (!firebaseAuth || !auth) return;
    await firebaseAuth.signOut(auth);
    setUser(null);
  };

  const saveToCloud = async (uid) => {
    if (!firebaseDb || !db || !uid) return;
    setSyncing(true);
    try {
      await firebaseDb.setDoc(firebaseDb.doc(db, 'users', uid), {
        schedule: JSON.stringify(schedule),
        watchedList: JSON.stringify(watchedList),
        watchLater: JSON.stringify(watchLater),
        updatedAt: new Date().toISOString()
      });
    } catch (e) { console.error('Save error:', e); }
    setSyncing(false);
  };

  const loadFromCloud = async (uid) => {
    if (!firebaseDb || !db || !uid) return;
    setSyncing(true);
    try {
      const snap = await firebaseDb.getDoc(firebaseDb.doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.schedule) setSchedule(JSON.parse(data.schedule));
        if (data.watchedList) setWatchedList(JSON.parse(data.watchedList));
        if (data.watchLater) setWatchLater(JSON.parse(data.watchLater));
      }
    } catch (e) { console.error('Load error:', e); }
    setSyncing(false);
  };

  // Auto-sync when data changes and user is logged in
  const syncTimer = useRef(null);
  useEffect(() => {
    if (!user) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => saveToCloud(user.uid), 2000);
  }, [schedule, watchedList, watchLater, user]);

  // ============ BÚSQUEDA ============
  const searchAnime = useCallback(async (query) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const [jikanRes, kitsuRes, tmdbRes] = await Promise.allSettled([
        fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=10&sfw=true`).then(r => r.json()),
        fetch(`https://kitsu.app/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=10`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&language=es-ES&page=1`).then(r => r.json())
      ]);
      const combined = new Map();

      if (jikanRes.status === 'fulfilled' && jikanRes.value?.data) {
        jikanRes.value.data.forEach(a => {
          const titleEn = a.title_english || '';
          const allTitles = [a.title, titleEn, a.title_japanese, ...(a.title_synonyms || [])].filter(Boolean);
          combined.set(`mal-${a.mal_id}`, {
            id: a.mal_id, source: 'MAL',
            title: titleEn || a.title, titleOriginal: a.title,
            titleJp: a.title_japanese || '', titleEn,
            altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== (titleEn || a.title)),
            image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
            genres: a.genres?.map(g => g.name) || [],
            synopsis: a.synopsis || 'Sin sinopsis disponible.',
            rating: a.score || 0, episodes: a.episodes || '?',
            status: a.status || '', year: a.year || a.aired?.prop?.from?.year || '',
            type: a.type || '', malUrl: `https://myanimelist.net/anime/${a.mal_id}`,
            watchLink: '', currentEp: 0, userRating: 0
          });
        });
      }

      if (kitsuRes.status === 'fulfilled' && kitsuRes.value?.data) {
        kitsuRes.value.data.forEach(a => {
          const at = a.attributes;
          const titleEn = at.titles?.en || at.titles?.en_us || at.canonicalTitle || '';
          const titleJp = at.titles?.ja_jp || '';
          const allTitles = [titleEn, titleJp, at.canonicalTitle, ...(at.abbreviatedTitles || [])].filter(Boolean);
          const isDup = [...combined.values()].some(e => (e.title || '').toLowerCase() === (titleEn || at.canonicalTitle || '').toLowerCase() || (e.titleJp && titleJp && e.titleJp === titleJp));
          if (!isDup) combined.set(`kitsu-${a.id}`, {
            id: parseInt(a.id) + 100000, source: 'Kitsu',
            title: titleEn || at.canonicalTitle, titleOriginal: at.canonicalTitle || '',
            titleJp: titleJp, titleEn,
            altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== (titleEn || at.canonicalTitle)),
            image: at.posterImage?.large || at.posterImage?.medium || '', genres: [],
            synopsis: at.synopsis || 'Sin sinopsis disponible.',
            rating: at.averageRating ? (parseFloat(at.averageRating) / 10).toFixed(1) : 0,
            episodes: at.episodeCount || '?', status: at.status || '',
            year: at.startDate ? at.startDate.split('-')[0] : '', type: at.showType || '',
            malUrl: `https://kitsu.app/anime/${a.id}`, watchLink: '', currentEp: 0, userRating: 0
          });
        });
      }

      if (tmdbRes.status === 'fulfilled' && tmdbRes.value?.results) {
        tmdbRes.value.results.filter(i => i.media_type === 'tv' || i.media_type === 'movie').slice(0, 10).forEach(item => {
          const isMovie = item.media_type === 'movie';
          const title = isMovie ? (item.title || item.original_title) : (item.name || item.original_name);
          const orig = isMovie ? (item.original_title || '') : (item.original_name || '');
          const titleEs = isMovie ? (item.title || '') : (item.name || '');
          const year = isMovie ? (item.release_date || '').split('-')[0] : (item.first_air_date || '').split('-')[0];
          const isDup = [...combined.values()].some(e => (e.title || '').toLowerCase() === (title || '').toLowerCase() || (e.title || '').toLowerCase() === (orig || '').toLowerCase());
          if (!isDup) combined.set(`tmdb-${item.id}`, {
            id: item.id + 200000, source: 'TMDB',
            title: titleEs || title, titleOriginal: orig,
            titleJp: '', titleEn: orig,
            altTitles: [title, orig, titleEs].filter((t, i, a) => Boolean(t) && a.indexOf(t) === i && t !== (titleEs || title)),
            image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
            genres: [], synopsis: item.overview || 'Sin sinopsis disponible.',
            rating: item.vote_average || 0, episodes: isMovie ? 'Película' : '?',
            status: '', year, type: isMovie ? 'Película' : 'Serie',
            malUrl: `https://www.themoviedb.org/${item.media_type}/${item.id}`,
            watchLink: '', currentEp: 0, userRating: 0
          });
        });
      }
      setSearchResults([...combined.values()]);
    } catch (err) { console.error('Error:', err); setSearchResults([]); }
    setIsSearching(false);
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchAnime(query), 500);
  };

  // ============ ACCIONES ============
  const addToSchedule = (anime, day) => {
    const a = { ...anime, currentEp: anime.currentEp || 0, userRating: anime.userRating || 0 };
    setSchedule(prev => ({ ...prev, [day]: [...prev[day].filter(x => x.id !== a.id), a] }));
    setShowDayPicker(null); setShowSearch(false); setSearchQuery(''); setSearchResults([]);
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
    const a = { ...anime, currentEp: anime.currentEp || 0, userRating: anime.userRating || 0 };
    setWatchLater(prev => [...prev.filter(x => x.id !== a.id), a]);
    setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const markAsWatchedFromSearch = (anime) => {
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: true, finishedDate: new Date().toLocaleDateString(), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0 }]);
    setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const moveFromWatchLaterToSchedule = (anime, day) => {
    setWatchLater(prev => prev.filter(a => a.id !== anime.id));
    setSchedule(prev => ({ ...prev, [day]: [...prev[day].filter(a => a.id !== anime.id), anime] }));
  };

  const resumeAnime = (anime) => {
    setWatchedList(prev => prev.filter(a => a.id !== anime.id));
    setShowDayPicker(anime);
  };

  const moveAnimeToDay = (anime, fromDay, toDay) => {
    removeFromSchedule(anime.id, fromDay);
    setSchedule(prev => ({ ...prev, [toDay]: [...prev[toDay].filter(a => a.id !== anime.id), anime] }));
    setShowMoveDayPicker(null);
  };

  const updateEpisode = (animeId, delta) => {
    const update = (list) => list.map(a => a.id === animeId ? { ...a, currentEp: Math.max(0, (a.currentEp || 0) + delta) } : a);
    setSchedule(prev => {
      const n = { ...prev }; daysOfWeek.forEach(d => { n[d] = update(n[d]); }); return n;
    });
    setWatchLater(prev => update(prev));
    setWatchedList(prev => update(prev));
  };

  const updateAnimeLink = (animeId, link) => {
    const update = (list) => list.map(a => a.id === animeId ? { ...a, watchLink: link } : a);
    setSchedule(prev => { const n = { ...prev }; daysOfWeek.forEach(d => { n[d] = update(n[d]); }); return n; });
    setWatchLater(prev => update(prev));
    setWatchedList(prev => update(prev));
    setShowLinkEditor(null); setLinkInput('');
  };

  const updateUserRating = (animeId, rating) => {
    const update = (list) => list.map(a => a.id === animeId ? { ...a, userRating: rating } : a);
    setSchedule(prev => { const n = { ...prev }; daysOfWeek.forEach(d => { n[d] = update(n[d]); }); return n; });
    setWatchLater(prev => update(prev));
    setWatchedList(prev => update(prev));
    setShowRatingEditor(null);
  };

  // ============ FILTRADO SERIES VISTAS ============
  const getFilteredWatched = () => {
    let list = [...watchedList];
    if (watchedFilter === 'finished') list = list.filter(a => a.finished);
    else if (watchedFilter === 'dropped') list = list.filter(a => !a.finished);
    if (watchedSort === 'date') list.sort((a, b) => new Date(b.finishedDate || b.droppedDate || 0) - new Date(a.finishedDate || a.droppedDate || 0));
    else if (watchedSort === 'rating') list.sort((a, b) => (b.userRating || 0) - (a.userRating || 0));
    else if (watchedSort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    return list;
  };

  // ============ COMPONENTES ============
  const StarRating = ({ rating, size = 16, interactive = false, onChange }) => (
    <div className="star-rating" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} className={`star ${s <= rating ? 'filled' : ''}`}
          onClick={interactive ? (e) => { e.stopPropagation(); onChange?.(s === rating ? 0 : s); } : undefined}
          style={interactive ? { cursor: 'pointer' } : {}}
        >{s <= rating ? '★' : '☆'}</span>
      ))}
    </div>
  );

  const AnimeCard = ({ anime, day, showActions = true, isWatchLater = false, isWatched = false }) => (
    <div className="anime-card fade-in" onClick={() => setShowAnimeDetail(anime)}>
      <div className="anime-card-image">
        <img src={anime.image} alt={anime.title} loading="lazy" />
        {anime.rating > 0 && (
          <div className="anime-card-score">⭐ {Number(anime.rating).toFixed ? Number(anime.rating).toFixed(1) : anime.rating}</div>
        )}
        {anime.currentEp > 0 && (
          <div className="anime-card-ep">EP {anime.currentEp}</div>
        )}
      </div>
      <div className="anime-card-content">
        <h3>{anime.title}</h3>
        <div className="anime-genres">
          {(anime.genres || []).slice(0, 2).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}
        </div>
        {anime.userRating > 0 && <StarRating rating={anime.userRating} size={12} />}
        {anime.watchLink && (
          <a href={anime.watchLink} target="_blank" rel="noopener noreferrer" className="watch-link-badge" onClick={e => e.stopPropagation()}>▶ Ver</a>
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
              <button className="action-btn ep-btn" onClick={() => updateEpisode(anime.id, 1)} title="EP +1">+1</button>
              <button className="action-btn finish" onClick={() => markAsFinished(anime, day)} title="Finalizar">✓</button>
              <button className="action-btn drop" onClick={() => dropAnime(anime, day)} title="Dropear">✗</button>
              <button className="action-btn move-btn" onClick={() => setShowMoveDayPicker({ anime, fromDay: day })} title="Mover día">↔</button>
              <button className="action-btn link-btn" onClick={() => { setShowLinkEditor(anime); setLinkInput(anime.watchLink || ''); }} title="Link">🔗</button>
              <button className="action-btn rate-btn" onClick={() => { setShowRatingEditor(anime); setRatingInput(anime.userRating || 0); }} title="Valorar">★</button>
            </>
          )}
          {isWatchLater && (
            <>
              <button className="action-btn schedule" onClick={() => setShowDayPicker(anime)} title="Añadir a semana">📅</button>
              <button className="action-btn link-btn" onClick={() => { setShowLinkEditor(anime); setLinkInput(anime.watchLink || ''); }} title="Link">🔗</button>
              <button className="action-btn rate-btn" onClick={() => { setShowRatingEditor(anime); setRatingInput(anime.userRating || 0); }} title="Valorar">★</button>
            </>
          )}
          {isWatched && (
            <>
              {!anime.finished && <button className="action-btn resume" onClick={() => resumeAnime(anime)} title="Retomar">▶</button>}
              <button className="action-btn rate-btn" onClick={() => { setShowRatingEditor(anime); setRatingInput(anime.userRating || 0); }} title="Valorar">★</button>
            </>
          )}
        </div>
      )}
    </div>
  );

  // ============ MODALS ============
  const SearchModal = () => (
    <div className="modal-overlay" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-header">
          <input type="text" placeholder="🔍 Buscar anime o serie..." value={searchQuery} onChange={e => handleSearch(e.target.value)} autoFocus />
          <button className="close-btn" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>×</button>
        </div>
        <div className="search-results">
          {isSearching ? (
            <div className="search-placeholder"><div className="spinner"></div><p>Buscando...</p></div>
          ) : searchResults.length > 0 ? searchResults.map(anime => (
            <div key={anime.id} className="search-result-item fade-in">
              <img src={anime.image} alt={anime.title} />
              <div className="search-result-info">
                <div className="search-result-title-row">
                  <h4>{anime.title}</h4>
                  <span className="source-badge">{anime.source}</span>
                </div>
                {anime.altTitles?.length > 0 && <p className="alt-titles">También: {anime.altTitles.slice(0, 3).join(' · ')}</p>}
                <div className="search-result-meta">
                  {anime.type && <span className="meta-tag type">{anime.type}</span>}
                  {anime.year && <span className="meta-tag year">{anime.year}</span>}
                  {anime.episodes && <span className="meta-tag eps">{anime.episodes} eps</span>}
                  {anime.rating > 0 && <span className="meta-tag score">⭐ {Number(anime.rating).toFixed(1)}</span>}
                </div>
                <div className="search-result-genres">
                  {(anime.genres || []).slice(0, 3).map((g, i) => <span key={i} className="genre-tag-sm">{g}</span>)}
                </div>
                <a href={anime.malUrl} target="_blank" rel="noopener noreferrer" className="mal-link">Ver en {anime.source} ↗</a>
              </div>
              <div className="search-result-actions">
                <button className="add-btn schedule-btn" onClick={() => setShowDayPicker(anime)}>📅 Semana</button>
                <button className="add-btn later-btn" onClick={() => addToWatchLater(anime)}>🕐 Después</button>
                <button className="add-btn watched-btn" onClick={() => markAsWatchedFromSearch(anime)}>✓ Ya la vi</button>
              </div>
            </div>
          )) : searchQuery.length > 1 ? (
            <div className="no-results"><span>😢</span><p>Sin resultados para "{searchQuery}"</p></div>
          ) : (
            <div className="search-placeholder"><span>🎌</span><p>Buscá cualquier anime o serie</p><p className="search-hint">MyAnimeList · Kitsu · TMDB</p></div>
          )}
        </div>
      </div>
    </div>
  );

  const AnimeDetailModal = () => {
    if (!showAnimeDetail) return null;
    const a = showAnimeDetail;
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
                {a.status && <span className="meta-tag status">{a.status}</span>}
              </div>
              <div className="detail-genres">{(a.genres || []).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}</div>
              {a.rating > 0 && (
                <div className="detail-score">
                  <span className="score-label">Valoración:</span>
                  <span className="score-value">⭐ {Number(a.rating).toFixed(1)} / 10</span>
                  <div className="score-bar"><div style={{ width: `${(a.rating / 10) * 100}%` }}></div></div>
                </div>
              )}
              {a.currentEp > 0 && <p className="detail-ep">📺 Episodio actual: {a.currentEp}</p>}
              {a.userRating > 0 && <div className="detail-user-rating"><span>Tu valoración: </span><StarRating rating={a.userRating} size={16} /></div>}
            </div>
          </div>
          <div className="detail-synopsis"><h4>📖 Sinopsis:</h4><p>{a.synopsis}</p></div>
          <div className="detail-links">
            <h4>🔗 Links:</h4>
            <div className="link-buttons">
              <a href={a.malUrl} target="_blank" rel="noopener noreferrer" className="platform-btn mal">📊 {a.source || 'Info'}</a>
              {a.watchLink && <a href={a.watchLink} target="_blank" rel="noopener noreferrer" className="platform-btn watch">▶ Ver anime</a>}
            </div>
            {!a.watchLink && <p className="no-link-hint">Usá 🔗 en la tarjeta para agregar un link.</p>}
          </div>
        </div>
      </div>
    );
  };

  const DayPickerModal = () => {
    if (!showDayPicker) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowDayPicker(null)}>
        <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
          <h3>📅 ¿Qué día querés ver "{showDayPicker.title}"?</h3>
          <div className="days-grid">{daysOfWeek.map(d => (
            <button key={d} className="day-btn" onClick={() => {
              const fromWL = watchLater.some(a => a.id === showDayPicker.id);
              if (fromWL) moveFromWatchLaterToSchedule(showDayPicker, d);
              else addToSchedule(showDayPicker, d);
              setShowDayPicker(null);
            }}>{dayEmojis[daysOfWeek.indexOf(d)]} {d}</button>
          ))}</div>
        </div>
      </div>
    );
  };

  const MoveDayPickerModal = () => {
    if (!showMoveDayPicker) return null;
    const { anime, fromDay } = showMoveDayPicker;
    return (
      <div className="modal-overlay" onClick={() => setShowMoveDayPicker(null)}>
        <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
          <h3>↔ Mover "{anime.title}" a otro día</h3>
          <div className="days-grid">{daysOfWeek.filter(d => d !== fromDay).map(d => (
            <button key={d} className="day-btn" onClick={() => moveAnimeToDay(anime, fromDay, d)}>
              {dayEmojis[daysOfWeek.indexOf(d)]} {d}
            </button>
          ))}</div>
        </div>
      </div>
    );
  };

  const LinkEditorModal = () => {
    if (!showLinkEditor) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowLinkEditor(null)}>
        <div className="link-editor-modal fade-in" onClick={e => e.stopPropagation()}>
          <h3>🔗 Link para "{showLinkEditor.title}"</h3>
          <p className="link-hint">Pegá el link de donde lo estés viendo</p>
          <input type="url" placeholder="https://..." value={linkInput} onChange={e => setLinkInput(e.target.value)} autoFocus />
          <div className="link-editor-actions">
            <button className="save-link-btn" onClick={() => updateAnimeLink(showLinkEditor.id, linkInput)}>💾 Guardar</button>
            {showLinkEditor.watchLink && <button className="remove-link-btn" onClick={() => updateAnimeLink(showLinkEditor.id, '')}>🗑 Quitar</button>}
            <button className="cancel-link-btn" onClick={() => setShowLinkEditor(null)}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  };

  const RatingEditorModal = () => {
    if (!showRatingEditor) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowRatingEditor(null)}>
        <div className="link-editor-modal fade-in" onClick={e => e.stopPropagation()}>
          <h3>★ Valorar "{showRatingEditor.title}"</h3>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '1.5rem 0' }}>
            <StarRating rating={ratingInput} size={32} interactive onChange={setRatingInput} />
          </div>
          <div className="link-editor-actions">
            <button className="save-link-btn" onClick={() => updateUserRating(showRatingEditor.id, ratingInput)}>💾 Guardar</button>
            <button className="cancel-link-btn" onClick={() => setShowRatingEditor(null)}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  };

  const t = darkMode;

  return (
    <div className={`anime-tracker ${t ? 'dark' : 'light'}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Zen+Dots&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.3s ease-out; }

        .anime-tracker {
          min-height: 100vh;
          font-family: 'Outfit', sans-serif;
          position: relative; overflow-x: hidden;
          transition: background 0.4s ease, color 0.4s ease;
        }
        .anime-tracker.dark {
          background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
          color: #fff;
        }
        .anime-tracker.light {
          background: linear-gradient(135deg, #f0f4ff 0%, #e8ecf5 50%, #f5f0ff 100%);
          color: #1a1a2e;
        }
        .anime-tracker.dark::before {
          content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: radial-gradient(circle at 20% 80%, rgba(255,107,107,0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(78,205,196,0.1) 0%, transparent 50%);
          pointer-events: none; z-index: 0;
        }

        .header {
          position: sticky; top: 0; z-index: 100;
          backdrop-filter: blur(20px);
          border-bottom: 1px solid;
          padding: 1rem 2rem;
          transition: all 0.4s ease;
        }
        .dark .header { background: rgba(15,15,26,0.95); border-color: rgba(255,255,255,0.1); }
        .light .header { background: rgba(240,244,255,0.95); border-color: rgba(0,0,0,0.1); }

        .header-content {
          max-width: 1400px; margin: 0 auto;
          display: flex; justify-content: space-between; align-items: center; gap: 1rem;
          flex-wrap: wrap;
        }
        .header-left { display: flex; align-items: center; gap: 1rem; }
        .header-right { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

        .logo {
          font-family: 'Zen Dots', cursive; font-size: 1.8rem;
          background: linear-gradient(135deg, #ff6b6b, #4ecdc4, #a855f7);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }

        .theme-toggle, .sync-btn, .auth-btn {
          padding: 0.5rem 1rem; border-radius: 50px; border: 1px solid;
          font-family: inherit; font-size: 0.85rem; cursor: pointer;
          transition: all 0.3s ease; display: flex; align-items: center; gap: 0.4rem;
        }
        .dark .theme-toggle, .dark .sync-btn, .dark .auth-btn {
          background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.15); color: #fff;
        }
        .light .theme-toggle, .light .sync-btn, .light .auth-btn {
          background: rgba(0,0,0,0.05); border-color: rgba(0,0,0,0.15); color: #1a1a2e;
        }
        .theme-toggle:hover, .sync-btn:hover, .auth-btn:hover { transform: translateY(-2px); }
        .auth-btn.google { background: linear-gradient(135deg, rgba(66,133,244,0.2), rgba(234,67,53,0.2)); }

        .user-info { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
        .user-info img { width: 28px; height: 28px; border-radius: 50%; }

        .search-btn {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.6rem 1.25rem;
          background: linear-gradient(135deg, rgba(168,85,247,0.2), rgba(78,205,196,0.2));
          border: 1px solid rgba(168,85,247,0.3);
          border-radius: 50px; color: inherit; font-size: 0.95rem; cursor: pointer;
          transition: all 0.3s ease;
        }
        .search-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(168,85,247,0.3); }

        .nav-tabs {
          display: flex; gap: 0.5rem; padding: 1rem 2rem;
          max-width: 1400px; margin: 0 auto; position: relative; z-index: 1; flex-wrap: wrap;
        }
        .nav-tab {
          padding: 0.7rem 1.25rem;
          border: 1px solid; border-radius: 12px;
          font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease;
        }
        .dark .nav-tab { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
        .light .nav-tab { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.5); }
        .nav-tab:hover { opacity: 0.8; }
        .nav-tab.active {
          background: linear-gradient(135deg, #a855f7, #4ecdc4);
          border-color: transparent; color: #fff !important;
          box-shadow: 0 5px 20px rgba(168,85,247,0.4);
        }

        .main-content { max-width: 1400px; margin: 0 auto; padding: 1rem 2rem 3rem; position: relative; z-index: 1; }

        /* SCHEDULE ROWS */
        .schedule-rows { display: flex; flex-direction: column; gap: 1rem; }
        .day-row {
          display: flex; gap: 1.25rem; align-items: stretch;
          border-radius: 20px; padding: 1rem;
          border: 1px solid; min-height: 120px;
          transition: all 0.3s ease;
        }
        .dark .day-row { background: rgba(255,255,255,0.02); border-color: rgba(255,255,255,0.06); }
        .light .day-row { background: rgba(255,255,255,0.6); border-color: rgba(0,0,0,0.08); }

        .day-label {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          min-width: 90px; width: 90px; flex-shrink: 0;
          padding: 0.75rem 0.5rem; border-radius: 14px;
          background: linear-gradient(135deg, rgba(168,85,247,0.1), rgba(78,205,196,0.1));
          border: 1px solid rgba(168,85,247,0.15); gap: 0.3rem;
        }
        .day-emoji { font-size: 1.4rem; }
        .day-name {
          font-size: 0.85rem; font-weight: 600;
          background: linear-gradient(135deg, #a855f7, #4ecdc4);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .day-count {
          font-size: 0.7rem; padding: 0.15rem 0.5rem;
          background: rgba(168,85,247,0.25); border-radius: 10px; color: #c4b5fd;
        }

        .day-animes { display: flex; gap: 1rem; overflow-x: auto; flex: 1; padding: 0.25rem 0; align-items: flex-start; }
        .day-animes::-webkit-scrollbar { height: 6px; }
        .day-animes::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.2); border-radius: 3px; }
        .day-empty { display: flex; align-items: center; justify-content: center; flex: 1; opacity: 0.3; font-size: 0.85rem; font-style: italic; }

        /* ANIME CARD */
        .anime-card {
          border-radius: 16px; overflow: hidden; cursor: pointer;
          transition: all 0.3s ease; border: 1px solid;
          position: relative; min-width: 150px; width: 150px; flex-shrink: 0;
        }
        .dark .anime-card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); }
        .light .anime-card { background: #fff; border-color: rgba(0,0,0,0.1); box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .anime-card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(168,85,247,0.2); border-color: rgba(168,85,247,0.3); }

        .anime-card-image { position: relative; aspect-ratio: 3/4; overflow: hidden; }
        .anime-card-image img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
        .anime-card:hover .anime-card-image img { transform: scale(1.1); }

        .anime-card-score {
          position: absolute; top: 0.4rem; right: 0.4rem;
          background: rgba(0,0,0,0.75); backdrop-filter: blur(5px);
          padding: 0.15rem 0.4rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; color: #fff;
        }
        .anime-card-ep {
          position: absolute; top: 0.4rem; left: 0.4rem;
          background: rgba(168,85,247,0.85); backdrop-filter: blur(5px);
          padding: 0.15rem 0.4rem; border-radius: 6px; font-size: 0.65rem; font-weight: 700; color: #fff;
        }

        .anime-card-content { padding: 0.6rem; }
        .anime-card-content h3 { font-size: 0.8rem; font-weight: 600; margin-bottom: 0.35rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .anime-genres { display: flex; flex-wrap: wrap; gap: 0.25rem; }
        .genre-tag { font-size: 0.6rem; padding: 0.15rem 0.4rem; background: rgba(168,85,247,0.2); border-radius: 20px; color: #c4b5fd; }
        .light .genre-tag { background: rgba(168,85,247,0.1); color: #7c3aed; }

        .star-rating { display: flex; gap: 1px; }
        .star { color: rgba(255,255,255,0.2); transition: color 0.2s; }
        .star.filled { color: #fbbf24; }
        .light .star { color: rgba(0,0,0,0.15); }

        .watch-link-badge {
          display: inline-block; margin-top: 0.35rem;
          padding: 0.2rem 0.5rem; border-radius: 6px;
          background: rgba(34,197,94,0.2); color: #4ade80;
          font-size: 0.65rem; font-weight: 600; text-decoration: none;
        }

        .status-badge { margin-top: 0.35rem; padding: 0.2rem 0.5rem; border-radius: 6px; font-size: 0.65rem; font-weight: 600; }
        .status-badge.finished { background: rgba(34,197,94,0.2); color: #4ade80; }
        .status-badge.dropped { background: rgba(251,191,36,0.2); color: #fcd34d; }

        .anime-card-actions {
          display: flex; gap: 0.3rem; padding: 0.4rem 0.5rem 0.5rem;
          opacity: 0; transition: opacity 0.3s ease; flex-wrap: wrap;
        }
        .anime-card:hover .anime-card-actions { opacity: 1; }

        .action-btn {
          flex: 1; padding: 0.35rem; border: none; border-radius: 6px;
          cursor: pointer; font-size: 0.8rem; transition: all 0.2s ease; min-width: 28px;
        }
        .action-btn.finish { background: rgba(34,197,94,0.2); color: #4ade80; }
        .action-btn.drop { background: rgba(239,68,68,0.2); color: #f87171; }
        .action-btn.schedule, .action-btn.resume { background: rgba(168,85,247,0.2); color: #c4b5fd; }
        .action-btn.link-btn { background: rgba(78,205,196,0.2); color: #4ecdc4; }
        .action-btn.rate-btn { background: rgba(251,191,36,0.2); color: #fbbf24; }
        .action-btn.ep-btn { background: rgba(99,102,241,0.2); color: #818cf8; font-weight: 700; font-size: 0.7rem; }
        .action-btn.move-btn { background: rgba(236,72,153,0.2); color: #f472b6; }
        .action-btn:hover { filter: brightness(1.3); }

        /* SECTIONS */
        .section-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .section-header h2 {
          font-size: 1.5rem; font-weight: 700;
          background: linear-gradient(135deg, #a855f7, #4ecdc4);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .section-header .count { background: rgba(168,85,247,0.3); padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.85rem; color: #c4b5fd; }

        .filter-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .filter-btn, .sort-btn {
          padding: 0.5rem 1rem; border-radius: 10px; border: 1px solid;
          font-family: inherit; font-size: 0.8rem; cursor: pointer; transition: all 0.2s ease;
        }
        .dark .filter-btn, .dark .sort-btn { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6); }
        .light .filter-btn, .light .sort-btn { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); color: rgba(0,0,0,0.5); }
        .filter-btn.active, .sort-btn.active { background: rgba(168,85,247,0.3); border-color: rgba(168,85,247,0.5); color: #c4b5fd; }

        .anime-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; }
        .anime-grid .anime-card { width: auto; min-width: unset; }

        .empty-state { grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; opacity: 0.4; }
        .empty-state span { font-size: 4rem; display: block; margin-bottom: 1rem; }

        /* MODALS */
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8); backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 1rem;
        }

        .search-modal {
          width: 100%; max-width: 700px; max-height: 85vh;
          border-radius: 24px; border: 1px solid;
          overflow: hidden; display: flex; flex-direction: column;
        }
        .dark .search-modal { background: linear-gradient(135deg, #1a1a2e, #16213e); border-color: rgba(255,255,255,0.1); }
        .light .search-modal { background: #fff; border-color: rgba(0,0,0,0.1); }

        .search-header { display: flex; gap: 1rem; padding: 1.5rem; border-bottom: 1px solid rgba(128,128,128,0.2); }
        .search-header input {
          flex: 1; padding: 0.85rem 1.25rem; border: 1px solid; border-radius: 50px;
          font-size: 1rem; font-family: inherit; transition: all 0.3s;
        }
        .dark .search-header input { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); color: #fff; }
        .light .search-header input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.1); color: #1a1a2e; }
        .search-header input:focus { outline: none; border-color: rgba(168,85,247,0.5); }
        .search-header input::placeholder { opacity: 0.4; }

        .close-btn {
          width: 44px; height: 44px; border-radius: 50%; border: none;
          font-size: 1.4rem; cursor: pointer; transition: all 0.2s; flex-shrink: 0;
        }
        .dark .close-btn { background: rgba(255,255,255,0.1); color: #fff; }
        .light .close-btn { background: rgba(0,0,0,0.08); color: #333; }
        .close-btn:hover { background: rgba(239,68,68,0.3); }

        .search-results { flex: 1; overflow-y: auto; padding: 1rem; }

        .search-result-item {
          display: flex; gap: 1rem; padding: 1rem; border-radius: 16px;
          margin-bottom: 0.75rem; border: 1px solid; flex-wrap: wrap; transition: all 0.2s;
        }
        .dark .search-result-item { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.05); }
        .light .search-result-item { background: rgba(0,0,0,0.02); border-color: rgba(0,0,0,0.06); }

        .search-result-item img { width: 70px; height: 100px; object-fit: cover; border-radius: 10px; flex-shrink: 0; }
        .search-result-info { flex: 1; min-width: 180px; }
        .search-result-info h4 { font-size: 1rem; margin-bottom: 0; }
        .search-result-title-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap; }
        .source-badge { font-size: 0.55rem; padding: 0.1rem 0.35rem; border-radius: 4px; font-weight: 600; background: rgba(78,205,196,0.2); color: #4ecdc4; text-transform: uppercase; }
        .alt-titles { font-size: 0.7rem; opacity: 0.4; margin-bottom: 0.3rem; font-style: italic; }
        .search-result-meta { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.3rem; }
        .meta-tag { font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 5px; font-weight: 500; }
        .meta-tag.type { background: rgba(168,85,247,0.2); color: #c4b5fd; }
        .meta-tag.year { background: rgba(78,205,196,0.2); color: #4ecdc4; }
        .meta-tag.eps { background: rgba(251,191,36,0.2); color: #fcd34d; }
        .meta-tag.score { background: rgba(255,107,107,0.2); color: #ff6b6b; }
        .meta-tag.status { background: rgba(34,197,94,0.2); color: #4ade80; }
        .search-result-genres { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.3rem; }
        .genre-tag-sm { font-size: 0.55rem; padding: 0.1rem 0.35rem; background: rgba(128,128,128,0.15); border-radius: 8px; opacity: 0.6; }
        .mal-link { font-size: 0.7rem; color: #4ecdc4; text-decoration: none; }

        .search-result-actions { display: flex; gap: 0.4rem; width: 100%; margin-top: 0.4rem; }
        .add-btn {
          flex: 1; padding: 0.5rem 0.75rem; border: none; border-radius: 8px;
          color: #fff; font-family: inherit; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;
        }
        .add-btn:hover { transform: translateY(-2px); }
        .schedule-btn { background: rgba(168,85,247,0.35); }
        .later-btn { background: rgba(251,191,36,0.35); }
        .watched-btn { background: rgba(34,197,94,0.35); }

        .spinner { width: 36px; height: 36px; border: 3px solid rgba(168,85,247,0.2); border-top-color: #a855f7; border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .search-placeholder, .no-results { text-align: center; padding: 3rem; opacity: 0.4; }
        .search-placeholder span, .no-results span { font-size: 3rem; display: block; margin-bottom: 1rem; }
        .search-hint { font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.6; }

        /* DETAIL MODAL */
        .detail-modal {
          width: 100%; max-width: 600px; max-height: 85vh;
          border-radius: 24px; border: 1px solid;
          overflow-y: auto; position: relative; padding: 2rem;
        }
        .dark .detail-modal { background: linear-gradient(135deg, #1a1a2e, #16213e); border-color: rgba(255,255,255,0.1); }
        .light .detail-modal { background: #fff; border-color: rgba(0,0,0,0.1); }
        .detail-modal .close-btn { position: absolute; top: 1rem; right: 1rem; }

        .detail-header { display: flex; gap: 1.5rem; margin-bottom: 1.5rem; }
        .detail-header img { width: 140px; height: 200px; object-fit: cover; border-radius: 16px; flex-shrink: 0; }
        .detail-info h2 { font-size: 1.3rem; margin-bottom: 0.3rem; background: linear-gradient(135deg, #a855f7, #4ecdc4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .title-jp { font-size: 0.75rem; opacity: 0.4; margin-bottom: 0.5rem; }
        .detail-meta { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
        .detail-genres { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.6rem; }
        .detail-score { margin-top: 0.4rem; }
        .score-label { font-size: 0.75rem; opacity: 0.5; }
        .score-value { font-size: 1rem; font-weight: 700; color: #fcd34d; margin-left: 0.5rem; }
        .score-bar { margin-top: 0.3rem; height: 5px; background: rgba(128,128,128,0.2); border-radius: 3px; overflow: hidden; }
        .score-bar > div { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #ff6b6b, #fcd34d, #4ade80); }
        .detail-ep { margin-top: 0.5rem; font-size: 0.85rem; color: #818cf8; }
        .detail-user-rating { margin-top: 0.4rem; display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
        .detail-synopsis { margin-bottom: 1.5rem; }
        .detail-synopsis h4 { font-size: 0.85rem; opacity: 0.5; margin-bottom: 0.4rem; }
        .detail-synopsis p { line-height: 1.6; opacity: 0.8; font-size: 0.85rem; }
        .detail-links h4 { font-size: 0.85rem; opacity: 0.5; margin-bottom: 0.6rem; }
        .link-buttons { display: flex; flex-wrap: wrap; gap: 0.6rem; }
        .platform-btn { padding: 0.6rem 1rem; border-radius: 10px; color: #fff; text-decoration: none; font-weight: 500; transition: all 0.2s; font-size: 0.85rem; }
        .platform-btn:hover { transform: translateY(-2px); }
        .platform-btn.mal { background: linear-gradient(135deg, #2E51A2, #4267B2); }
        .platform-btn.watch { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .no-link-hint { margin-top: 0.6rem; font-size: 0.75rem; opacity: 0.4; font-style: italic; }

        /* DAY PICKER / LINK / RATING MODALS */
        .day-picker-modal, .link-editor-modal {
          border-radius: 24px; border: 1px solid; padding: 2rem; max-width: 400px; width: 100%;
        }
        .dark .day-picker-modal, .dark .link-editor-modal { background: linear-gradient(135deg, #1a1a2e, #16213e); border-color: rgba(255,255,255,0.1); }
        .light .day-picker-modal, .light .link-editor-modal { background: #fff; border-color: rgba(0,0,0,0.1); }

        .day-picker-modal h3, .link-editor-modal h3 { text-align: center; margin-bottom: 1.25rem; font-size: 1.05rem; }
        .days-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; }
        .day-btn {
          padding: 0.85rem; background: rgba(168,85,247,0.15);
          border: 1px solid rgba(168,85,247,0.3); border-radius: 12px;
          color: inherit; font-family: inherit; font-size: 0.95rem; cursor: pointer; transition: all 0.2s;
        }
        .day-btn:hover { background: rgba(168,85,247,0.4); }
        .day-btn:last-child { grid-column: 1 / -1; }

        .link-hint { font-size: 0.75rem; opacity: 0.4; margin-bottom: 0.75rem; }
        .link-editor-modal input {
          width: 100%; padding: 0.75rem 0.85rem; border: 1px solid; border-radius: 12px;
          font-size: 0.9rem; font-family: inherit; margin-bottom: 0.75rem;
        }
        .dark .link-editor-modal input { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.15); color: #fff; }
        .light .link-editor-modal input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.15); color: #1a1a2e; }
        .link-editor-modal input:focus { outline: none; border-color: rgba(168,85,247,0.5); }

        .link-editor-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .save-link-btn, .remove-link-btn, .cancel-link-btn {
          padding: 0.6rem 1rem; border: none; border-radius: 10px;
          color: #fff; font-family: inherit; cursor: pointer; transition: all 0.2s; font-size: 0.85rem;
        }
        .save-link-btn { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .remove-link-btn { background: rgba(239,68,68,0.3); }
        .cancel-link-btn { background: rgba(128,128,128,0.2); }

        /* SCROLLBAR */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.25); border-radius: 3px; }

        @media (max-width: 768px) {
          .header-content { flex-direction: column; }
          .header-right { justify-content: center; }
          .day-row { flex-direction: column; }
          .day-label { flex-direction: row; width: 100%; min-width: unset; padding: 0.5rem 1rem; gap: 0.6rem; }
          .anime-card { min-width: 130px; width: 130px; }
          .anime-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
          .detail-header { flex-direction: column; align-items: center; text-align: center; }
          .search-result-item { flex-direction: column; align-items: center; text-align: center; }
          .search-result-actions { flex-direction: column; }
          .anime-card-actions { opacity: 1; }
        }
      `}</style>

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
        <button className={`nav-tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>📅 Mi Semana</button>
        <button className={`nav-tab ${activeTab === 'watchLater' ? 'active' : ''}`} onClick={() => setActiveTab('watchLater')}>🕐 Ver más tarde ({watchLater.length})</button>
        <button className={`nav-tab ${activeTab === 'watched' ? 'active' : ''}`} onClick={() => setActiveTab('watched')}>✓ Vistas ({watchedList.length})</button>
      </nav>

      <main className="main-content">
        {activeTab === 'schedule' && (
          <div className="schedule-rows">
            {daysOfWeek.map((day, i) => (
              <div key={day} className="day-row fade-in">
                <div className="day-label">
                  <span className="day-emoji">{dayEmojis[i]}</span>
                  <span className="day-name">{day}</span>
                  <span className="day-count">{schedule[day].length}</span>
                </div>
                <div className="day-animes">
                  {schedule[day].length > 0 ? schedule[day].map(a => (
                    <AnimeCard key={a.id} anime={a} day={day} />
                  )) : <div className="day-empty">Sin animes</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'watchLater' && (
          <>
            <div className="section-header">
              <h2>🕐 Ver más tarde</h2>
              <span className="count">{watchLater.length}</span>
            </div>
            <div className="anime-grid">
              {watchLater.length > 0 ? watchLater.map(a => (
                <AnimeCard key={a.id} anime={a} isWatchLater />
              )) : <div className="empty-state"><span>📺</span><p>No hay animes guardados</p></div>}
            </div>
          </>
        )}

        {activeTab === 'watched' && (
          <>
            <div className="section-header">
              <h2>✓ Series vistas</h2>
              <span className="count">{watchedList.length}</span>
            </div>
            <div className="filter-bar">
              <button className={`filter-btn ${watchedFilter === 'all' ? 'active' : ''}`} onClick={() => setWatchedFilter('all')}>Todas</button>
              <button className={`filter-btn ${watchedFilter === 'finished' ? 'active' : ''}`} onClick={() => setWatchedFilter('finished')}>✓ Completadas</button>
              <button className={`filter-btn ${watchedFilter === 'dropped' ? 'active' : ''}`} onClick={() => setWatchedFilter('dropped')}>⏸ Dropeadas</button>
              <span style={{ opacity: 0.3 }}>|</span>
              <button className={`sort-btn ${watchedSort === 'date' ? 'active' : ''}`} onClick={() => setWatchedSort('date')}>Fecha</button>
              <button className={`sort-btn ${watchedSort === 'rating' ? 'active' : ''}`} onClick={() => setWatchedSort('rating')}>Valoración</button>
              <button className={`sort-btn ${watchedSort === 'title' ? 'active' : ''}`} onClick={() => setWatchedSort('title')}>A-Z</button>
            </div>
            <div className="anime-grid">
              {getFilteredWatched().length > 0 ? getFilteredWatched().map(a => (
                <AnimeCard key={a.id} anime={a} isWatched />
              )) : <div className="empty-state"><span>🎬</span><p>No hay resultados</p></div>}
            </div>
          </>
        )}
      </main>

      {showSearch && <SearchModal />}
      {showAnimeDetail && <AnimeDetailModal />}
      {showDayPicker && <DayPickerModal />}
      {showMoveDayPicker && <MoveDayPickerModal />}
      {showLinkEditor && <LinkEditorModal />}
      {showRatingEditor && <RatingEditorModal />}
    </div>
  );
}
