import React, { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

import AnimeCard from './components/AnimeCard';
import AiringSection from './components/AiringSection';
import SeasonSection from './components/SeasonSection';
import StatsPanel from './components/StatsPanel';
import CustomListsTab from './components/CustomListsTab';
import SearchModal from './components/modals/SearchModal';
import AnimeDetailModal from './components/modals/AnimeDetailModal';
import DayPickerModal from './components/modals/DayPickerModal';
import MoveDayPickerModal from './components/modals/MoveDayPickerModal';
import ImportModal from './components/modals/ImportModal';
import { useFirebase } from './hooks/useFirebase';
import { useAnimeData } from './hooks/useAnimeData';
import { useDragDrop } from './hooks/useDragDrop';
import { useNotifications } from './hooks/useNotifications';
import { daysOfWeek, dayEmojis } from './constants';

const emptySchedule = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };

export default function AnimeTracker() {
  // --- Estados ---
  const [activeTab, setActiveTab] = useState('schedule');
  const [showSearch, setShowSearch] = useState(false);
  const [showAnimeDetail, setShowAnimeDetail] = useState(null);
  const [showDayPicker, setShowDayPicker] = useState(null);
  const [showMoveDayPicker, setShowMoveDayPicker] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [watchedFilter, setWatchedFilter] = useState('all');
  const [watchedSort, setWatchedSort] = useState('date');
  const [toast, setToast] = useState(null);
  const [localSearch, setLocalSearch] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [seasonAnime, setSeasonAnime] = useState([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(() => {
    const m = new Date().getMonth() + 1;
    return { season: m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL', year: new Date().getFullYear() };
  });
  const toastTimer = useRef(null);

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
  const [customLists, setCustomLists] = useState(() => {
    try { const s = localStorage.getItem('anitracker-custom-lists'); return s ? JSON.parse(s) : []; } catch { return []; }
  });

  // Persistencia
  useEffect(() => { localStorage.setItem('animeSchedule', JSON.stringify(schedule)); }, [schedule]);
  useEffect(() => { localStorage.setItem('watchedAnimes', JSON.stringify(watchedList)); }, [watchedList]);
  useEffect(() => { localStorage.setItem('watchLater', JSON.stringify(watchLater)); }, [watchLater]);
  useEffect(() => { localStorage.setItem('anitracker-custom-lists', JSON.stringify(customLists)); }, [customLists]);
  useEffect(() => { localStorage.setItem('anitracker-theme', darkMode ? 'dark' : 'light'); }, [darkMode]);

  // --- Hooks ---
  const { user, syncing, loginWithGoogle, logout, FIREBASE_ENABLED } = useFirebase(schedule, watchedList, watchLater, setSchedule, setWatchedList, setWatchLater);
  const { searchQuery, setSearchQuery, searchResults, setSearchResults, isSearching, searchPartial, airingData, handleSearch } = useAnimeData(schedule);
  const { isDragging, dropTarget, dropIndex, handleDragStart, handleDragEnd, handleDragOverRow, handleDragOverCard, handleDrop, handleTouchStart, handleTouchMove, handleTouchEnd, touchRef, dragState } = useDragDrop(schedule, setSchedule, daysOfWeek);
  const { notifEnabled, notifPermission, toggleNotifications } = useNotifications(airingData);
  const dayRowRefs = useRef({});

  // --- Toast ---
  const showToast = (message, undoFn) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
    setToast({ message, undoFn });
  };
  const dismissToast = () => { if (toastTimer.current) clearTimeout(toastTimer.current); setToast(null); };
  const undoToast = () => { if (toast?.undoFn) toast.undoFn(); dismissToast(); };

  // --- Acciones ---
  const clean = ({ _day, _isWatchLater, _isWatched, _isSeason, ...rest }) => rest;

  const addToSchedule = (anime, day) => {
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setSchedule(prev => ({ ...prev, [day]: [...prev[day].filter(x => x.id !== a.id), a] }));
    setShowDayPicker(null); setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const removeFromSchedule = (animeId, day) => {
    setSchedule(prev => ({ ...prev, [day]: prev[day].filter(a => a.id !== animeId) }));
  };

  const markAsFinished = (anime, day) => {
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevWatched = JSON.parse(JSON.stringify(watchedList));
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...clean(anime), finished: true, finishedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" marcado como finalizado`, () => { setSchedule(prevSchedule); setWatchedList(prevWatched); });
  };

  const dropAnime = (anime, day) => {
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevWatched = JSON.parse(JSON.stringify(watchedList));
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...clean(anime), finished: false, droppedDate: new Date().toISOString() }]);
    showToast(`"${anime.title}" dropeado`, () => { setSchedule(prevSchedule); setWatchedList(prevWatched); });
  };

  const addToWatchLater = (anime) => {
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setWatchLater(prev => [...prev.filter(x => x.id !== a.id), a]);
    setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const markAsWatched = (anime) => {
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...clean(anime), finished: true, finishedDate: new Date().toISOString(), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' }]);
  };

  const markAsWatchedFromSearch = (anime) => {
    markAsWatched(anime);
    setShowSearch(false); setSearchQuery(''); setSearchResults([]);
  };

  const moveFromWatchLaterToSchedule = (anime, day) => {
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setWatchLater(prev => prev.filter(x => x.id !== anime.id));
    setSchedule(prev => ({ ...prev, [day]: [...prev[day].filter(x => x.id !== a.id), a] }));
  };

  const resumeAnime = (anime) => {
    const prevWatched = JSON.parse(JSON.stringify(watchedList));
    setWatchedList(prev => prev.filter(a => a.id !== anime.id));
    setShowDayPicker(anime);
    showToast(`"${anime.title}" retomado`, () => { setWatchedList(prevWatched); });
  };

  const deleteAnime = (anime) => {
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const prevWatched = JSON.parse(JSON.stringify(watchedList));
    const prevLater = JSON.parse(JSON.stringify(watchLater));
    if (anime._day) removeFromSchedule(anime.id, anime._day);
    if (anime._isWatchLater) setWatchLater(prev => prev.filter(a => a.id !== anime.id));
    if (anime._isWatched) setWatchedList(prev => prev.filter(a => a.id !== anime.id));
    showToast(`"${anime.title}" eliminado`, () => { setSchedule(prevSchedule); setWatchedList(prevWatched); setWatchLater(prevLater); });
  };

  const handleImport = (data) => {
    // Pre-calcular count usando estados actuales para evitar race condition con setState
    let count = 0;
    const allScheduleIds = new Set(daysOfWeek.flatMap(d => (schedule[d] || []).map(a => a.id)));
    const watchLaterIds = new Set(watchLater.map(a => a.id));
    const watchedIds = new Set(watchedList.map(a => a.id));

    if (data.schedule?.length) {
      data.schedule.forEach(a => { if (!allScheduleIds.has(a.id)) count++; });
      setSchedule(prev => {
        const next = { ...prev };
        const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        data.schedule.forEach((a, i) => {
          const day = days[i % 7];
          const exists = next[day].some(x => x.id === a.id);
          if (!exists) { next[day] = [...next[day], { ...a, _importStatus: undefined, _finished: undefined, _dropped: undefined }]; }
        });
        return next;
      });
    }
    if (data.watchLater?.length) {
      count += data.watchLater.filter(a => !watchLaterIds.has(a.id)).length;
      setWatchLater(prev => {
        const existing = new Set(prev.map(a => a.id));
        const newItems = data.watchLater.filter(a => !existing.has(a.id)).map(a => ({ ...a, _importStatus: undefined, _finished: undefined, _dropped: undefined }));
        return [...prev, ...newItems];
      });
    }
    if (data.watched?.length) {
      count += data.watched.filter(a => !watchedIds.has(a.id)).length;
      setWatchedList(prev => {
        const existing = new Set(prev.map(a => a.id));
        const newItems = data.watched.filter(a => !existing.has(a.id)).map(a => ({
          ...a, finished: a._finished ?? true, finishedDate: new Date().toISOString(),
          droppedDate: a._dropped ? new Date().toISOString() : undefined,
          _importStatus: undefined, _finished: undefined, _dropped: undefined
        }));
        return [...prev, ...newItems];
      });
    }
    showToast(`Importados ${count} animes desde AniList`);
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

  // --- Bulk Operations ---
  const toggleBulkSelect = (id) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSelectAll = (list) => {
    setBulkSelected(new Set(list.map(a => a.id)));
  };

  const bulkDeselectAll = () => {
    setBulkSelected(new Set());
  };

  const exitBulkMode = () => {
    setBulkMode(false);
    setBulkSelected(new Set());
  };

  const bulkDelete = () => {
    if (bulkSelected.size === 0) return;
    const prevWatched = JSON.parse(JSON.stringify(watchedList));
    const prevLater = JSON.parse(JSON.stringify(watchLater));
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const count = bulkSelected.size;

    if (activeTab === 'watched') {
      setWatchedList(prev => prev.filter(a => !bulkSelected.has(a.id)));
    } else if (activeTab === 'watchLater') {
      setWatchLater(prev => prev.filter(a => !bulkSelected.has(a.id)));
    } else if (activeTab === 'schedule') {
      setSchedule(prev => {
        const next = { ...prev };
        daysOfWeek.forEach(d => { next[d] = next[d].filter(a => !bulkSelected.has(a.id)); });
        return next;
      });
    }
    exitBulkMode();
    showToast(`${count} anime${count > 1 ? 's' : ''} eliminado${count > 1 ? 's' : ''}`, () => {
      setSchedule(prevSchedule); setWatchedList(prevWatched); setWatchLater(prevLater);
    });
  };

  const bulkMarkWatched = () => {
    if (bulkSelected.size === 0) return;
    const prevLater = JSON.parse(JSON.stringify(watchLater));
    const prevWatched = JSON.parse(JSON.stringify(watchedList));
    const count = bulkSelected.size;

    const toMove = watchLater.filter(a => bulkSelected.has(a.id));
    setWatchLater(prev => prev.filter(a => !bulkSelected.has(a.id)));
    setWatchedList(prev => {
      const existing = new Set(prev.map(a => a.id));
      const newItems = toMove.filter(a => !existing.has(a.id)).map(a => ({
        ...clean(a), finished: true, finishedDate: new Date().toISOString(),
        currentEp: a.currentEp || 0, userRating: a.userRating || 0, notes: a.notes || ''
      }));
      return [...prev, ...newItems];
    });
    exitBulkMode();
    showToast(`${count} anime${count > 1 ? 's' : ''} marcado${count > 1 ? 's' : ''} como visto${count > 1 ? 's' : ''}`, () => {
      setWatchLater(prevLater); setWatchedList(prevWatched);
    });
  };

  const [showBulkDayPicker, setShowBulkDayPicker] = useState(false);

  const bulkMoveToSchedule = (day) => {
    if (bulkSelected.size === 0) return;
    const prevLater = JSON.parse(JSON.stringify(watchLater));
    const prevSchedule = JSON.parse(JSON.stringify(schedule));
    const count = bulkSelected.size;

    const toMove = watchLater.filter(a => bulkSelected.has(a.id));
    setWatchLater(prev => prev.filter(a => !bulkSelected.has(a.id)));
    setSchedule(prev => {
      const next = { ...prev };
      toMove.forEach(a => {
        const cleaned = { ...clean(a), currentEp: a.currentEp || 0, userRating: a.userRating || 0, notes: a.notes || '' };
        next[day] = [...next[day].filter(x => x.id !== cleaned.id), cleaned];
      });
      return next;
    });
    setShowBulkDayPicker(false);
    exitBulkMode();
    showToast(`${count} anime${count > 1 ? 's' : ''} movido${count > 1 ? 's' : ''} a ${day}`, () => {
      setWatchLater(prevLater); setSchedule(prevSchedule);
    });
  };

  // --- Custom Lists ---
  const createCustomList = (name, emoji) => {
    setCustomLists(prev => [...prev, { id: `list-${Date.now()}`, name, emoji, items: [] }]);
  };

  const deleteCustomList = (listId) => {
    const prev = JSON.parse(JSON.stringify(customLists));
    setCustomLists(lists => lists.filter(l => l.id !== listId));
    showToast('Lista eliminada', () => setCustomLists(prev));
  };

  const renameCustomList = (listId, newName) => {
    setCustomLists(lists => lists.map(l => l.id === listId ? { ...l, name: newName } : l));
  };

  const addToCustomList = (listId, anime) => {
    const a = { ...clean(anime), currentEp: anime.currentEp || 0, userRating: anime.userRating || 0, notes: anime.notes || '' };
    setCustomLists(lists => lists.map(l => l.id === listId ? { ...l, items: [...l.items.filter(x => x.id !== a.id), a] } : l));
  };

  const removeFromCustomList = (listId, animeId) => {
    const prev = JSON.parse(JSON.stringify(customLists));
    setCustomLists(lists => lists.map(l => l.id === listId ? { ...l, items: l.items.filter(x => x.id !== animeId) } : l));
    showToast('Anime removido de la lista', () => setCustomLists(prev));
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

  // --- Temporada ---
  const seasonCacheRef = useRef({});
  const fetchSeason = (s, y) => {
    const key = `${s}-${y}`;
    if (seasonCacheRef.current[key]) { setSeasonAnime(seasonCacheRef.current[key]); return; }
    setSeasonLoading(true);
    setSeasonAnime([]);
    const query = `query { Page(page: 1, perPage: 30) { media(season: ${s}, seasonYear: ${y}, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
      id idMal title { romaji english native } coverImage { large medium } genres averageScore episodes format status seasonYear description(asHtml: false) siteUrl
    } } }`;
    const formatMap = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Película', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
    fetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    }).then(r => r.json()).then(data => {
      const results = (data?.data?.Page?.media || []).map(m => ({
        id: m.idMal || (m.id + 300000), title: m.title?.english || m.title?.romaji || '', titleJp: m.title?.native || '',
        image: m.coverImage?.large || '', imageSm: m.coverImage?.medium || m.coverImage?.large || '',
        genres: m.genres || [],
        synopsis: (m.description || '').replace(/<[^>]*>/g, '').trim() || 'Sin sinopsis.',
        rating: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 0, episodes: m.episodes || null,
        type: formatMap[m.format] || m.format || '', year: m.seasonYear || y, status: m.status || '',
        source: 'AniList', malUrl: m.siteUrl || '', watchLink: '', currentEp: 0, userRating: 0, notes: ''
      }));
      seasonCacheRef.current[key] = results;
      setSeasonAnime(results);
    }).catch(() => {}).finally(() => setSeasonLoading(false));
  };
  const changeSeason = (s, y) => { setSelectedSeason({ season: s, year: y }); fetchSeason(s, y); };

  // --- Estadísticas ---
  const stats = useMemo(() => {
    const allSchedule = daysOfWeek.flatMap(d => schedule[d] || []);
    const allAnime = [...allSchedule, ...watchedList, ...watchLater];
    const genreCount = {};
    allAnime.forEach(a => (a.genres || []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; }));
    const rated = allAnime.filter(a => a.userRating > 0);
    return {
      totalSchedule: allSchedule.length,
      totalWatched: watchedList.length,
      totalWatchLater: watchLater.length,
      finished: watchedList.filter(a => a.finished).length,
      dropped: watchedList.filter(a => !a.finished).length,
      totalEps: allAnime.reduce((sum, a) => sum + (a.currentEp || 0), 0),
      avgRating: rated.length > 0 ? (rated.reduce((s, a) => s + a.userRating, 0) / rated.length).toFixed(1) : '—',
      topGenres: Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 8),
      allTotal: allAnime.length,
    };
  }, [schedule, watchedList, watchLater]);

  // --- RENDER ---
  return (
    <div className={`anime-tracker ${darkMode ? 'dark' : 'light'}`}>
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="logo">AniTracker</h1>
            <button className="search-btn" onClick={() => setShowSearch(true)}>🔍 Buscar...</button>
            <button className="import-btn" onClick={() => setShowImport(true)}>📥 Importar</button>
          </div>
          <div className="header-right">
            {notifPermission !== 'unsupported' && (
              <button className={`notif-toggle ${notifEnabled ? 'active' : ''}`} onClick={toggleNotifications} title={notifPermission === 'denied' ? 'Notificaciones bloqueadas en el navegador' : notifEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}>
                {notifEnabled ? '🔔' : '🔕'}{notifPermission === 'denied' && ' ⚠'}
              </button>
            )}
            <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? '☀️ Claro' : '🌙 Oscuro'}
            </button>
            {FIREBASE_ENABLED && !user && <button className="auth-btn google" onClick={loginWithGoogle}>🔑 Google</button>}
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
        <button className={`nav-tab ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => { setActiveTab('schedule'); setLocalSearch(''); exitBulkMode(); }}>📅 Semana</button>
        <button className={`nav-tab ${activeTab === 'watchLater' ? 'active' : ''}`} onClick={() => { setActiveTab('watchLater'); setLocalSearch(''); exitBulkMode(); }}>🕐 Después ({watchLater.length})</button>
        <button className={`nav-tab ${activeTab === 'watched' ? 'active' : ''}`} onClick={() => { setActiveTab('watched'); setLocalSearch(''); exitBulkMode(); }}>✓ Vistas ({watchedList.length})</button>
        <button className={`nav-tab ${activeTab === 'lists' ? 'active' : ''}`} onClick={() => { setActiveTab('lists'); setLocalSearch(''); exitBulkMode(); }}>📋 Listas{customLists.length > 0 ? ` (${customLists.length})` : ''}</button>
        <button className={`nav-tab ${activeTab === 'season' ? 'active' : ''}`} onClick={() => { setActiveTab('season'); setLocalSearch(''); exitBulkMode(); fetchSeason(selectedSeason.season, selectedSeason.year); }}>🌸 Temporada</button>
        <button className={`nav-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => { setActiveTab('stats'); setLocalSearch(''); exitBulkMode(); }}>📊 Stats</button>
      </nav>

      <main className="main-content">
        {activeTab === 'schedule' && (
          <div className="schedule-rows">
            {Object.keys(airingData).length > 0 && (
              <AiringSection schedule={schedule} airingData={airingData} onDetail={(a) => setShowAnimeDetail({ ...a, _day: a._day, _isWatchLater: false, _isWatched: false, _isSeason: false })} />
            )}
            {daysOfWeek.map((day, i) => (
              <div key={day} ref={el => { dayRowRefs.current[day] = el; }}
                className={`day-row fade-in ${dropTarget === day ? 'drop-target' : ''} ${isDragging && dragState.fromDay === day ? 'drag-source' : ''}`}
                onDragOver={(e) => handleDragOverRow(e, day)} onDrop={(e) => handleDrop(e, day)}>
                <div className="day-label">
                  <span className="day-emoji">{dayEmojis[i]}</span>
                  <span className="day-name">{day}</span>
                  <span className="day-count">{schedule[day].length}</span>
                </div>
                <div className="day-animes">
                  {schedule[day].length > 0 ? schedule[day].map((a, idx) => (
                    <React.Fragment key={a.id}>
                      {dropTarget === day && dropIndex === idx && isDragging && dragState.anime?.id !== a.id && <div className="drop-indicator"></div>}
                      <AnimeCard
                        anime={a} day={day} cardIndex={idx} cardDay={day} airingData={airingData} isDraggable={true}
                        onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOverCard}
                        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                        onClick={() => { if (touchRef.current.moved || touchRef.current.active) return; setShowAnimeDetail({ ...a, _day: day, _isWatchLater: false, _isWatched: false, _isSeason: false }); }}
                      />
                      {dropTarget === day && dropIndex === idx + 1 && idx === schedule[day].length - 1 && isDragging && <div className="drop-indicator"></div>}
                    </React.Fragment>
                  )) : <div className="day-empty">{dropTarget === day ? '⬇️ Soltar aquí' : 'Sin animes'}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'watchLater' && (
          <>
            <div className="section-header">
              <h2>🕐 Ver más tarde</h2><span className="count">{watchLater.length}</span>
              {watchLater.length > 0 && (
                <button className={`bulk-mode-btn ${bulkMode ? 'active' : ''}`} onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}>
                  {bulkMode ? '✕ Cancelar' : '☑ Seleccionar'}
                </button>
              )}
            </div>
            {bulkMode && (
              <div className="bulk-toolbar fade-in">
                <div className="bulk-toolbar-left">
                  <button className="bulk-select-all" onClick={() => {
                    const filtered = filterByLocalSearch(watchLater);
                    bulkSelected.size === filtered.length ? bulkDeselectAll() : bulkSelectAll(filtered);
                  }}>
                    {bulkSelected.size === filterByLocalSearch(watchLater).length ? '☐ Deseleccionar' : '☑ Seleccionar todo'}
                  </button>
                  <span className="bulk-count">{bulkSelected.size} seleccionado{bulkSelected.size !== 1 ? 's' : ''}</span>
                </div>
                <div className="bulk-toolbar-actions">
                  <button className="bulk-action-btn schedule" onClick={() => setShowBulkDayPicker(true)} disabled={bulkSelected.size === 0}>📅 Mover a semana</button>
                  <button className="bulk-action-btn watched" onClick={bulkMarkWatched} disabled={bulkSelected.size === 0}>✓ Marcar vistos</button>
                  <button className="bulk-action-btn delete" onClick={bulkDelete} disabled={bulkSelected.size === 0}>🗑 Eliminar</button>
                </div>
              </div>
            )}
            {watchLater.length > 3 && <div className="local-search"><input type="text" placeholder="🔍 Filtrar por nombre..." value={localSearch} onChange={e => setLocalSearch(e.target.value)} /></div>}
            <div className="anime-grid">
              {(() => {
                const filtered = filterByLocalSearch(watchLater);
                return filtered.length > 0 ? filtered.map(a => (
                  <div key={a.id} className={`bulk-card-wrapper ${bulkMode ? 'selectable' : ''} ${bulkSelected.has(a.id) ? 'selected' : ''}`}
                    onClick={bulkMode ? (e) => { e.stopPropagation(); toggleBulkSelect(a.id); } : undefined}>
                    {bulkMode && <div className={`bulk-checkbox ${bulkSelected.has(a.id) ? 'checked' : ''}`}>{bulkSelected.has(a.id) ? '✓' : ''}</div>}
                    <AnimeCard anime={a} isWatchLater airingData={airingData} onClick={bulkMode ? undefined : () => setShowAnimeDetail({ ...a, _isWatchLater: true, _isWatched: false, _isSeason: false })} />
                  </div>
                )) : <div className="empty-state"><span>📺</span><p>{localSearch ? 'Sin resultados' : 'No hay animes guardados'}</p></div>;
              })()}
            </div>
          </>
        )}

        {activeTab === 'watched' && (
          <>
            <div className="section-header">
              <h2>✓ Series vistas</h2><span className="count">{watchedList.length}</span>
              {watchedList.length > 0 && (
                <button className={`bulk-mode-btn ${bulkMode ? 'active' : ''}`} onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}>
                  {bulkMode ? '✕ Cancelar' : '☑ Seleccionar'}
                </button>
              )}
            </div>
            {bulkMode && (
              <div className="bulk-toolbar fade-in">
                <div className="bulk-toolbar-left">
                  <button className="bulk-select-all" onClick={() => {
                    const filtered = getFilteredWatched();
                    bulkSelected.size === filtered.length ? bulkDeselectAll() : bulkSelectAll(filtered);
                  }}>
                    {bulkSelected.size === getFilteredWatched().length ? '☐ Deseleccionar' : '☑ Seleccionar todo'}
                  </button>
                  <span className="bulk-count">{bulkSelected.size} seleccionado{bulkSelected.size !== 1 ? 's' : ''}</span>
                </div>
                <div className="bulk-toolbar-actions">
                  <button className="bulk-action-btn delete" onClick={bulkDelete} disabled={bulkSelected.size === 0}>🗑 Eliminar</button>
                </div>
              </div>
            )}
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
            {watchedList.length > 3 && <div className="local-search"><input type="text" placeholder="🔍 Filtrar por nombre..." value={localSearch} onChange={e => setLocalSearch(e.target.value)} /></div>}
            <div className="anime-grid">
              {(() => {
                const filtered = getFilteredWatched();
                return filtered.length > 0 ? filtered.map(a => (
                  <div key={a.id} className={`bulk-card-wrapper ${bulkMode ? 'selectable' : ''} ${bulkSelected.has(a.id) ? 'selected' : ''}`}
                    onClick={bulkMode ? (e) => { e.stopPropagation(); toggleBulkSelect(a.id); } : undefined}>
                    {bulkMode && <div className={`bulk-checkbox ${bulkSelected.has(a.id) ? 'checked' : ''}`}>{bulkSelected.has(a.id) ? '✓' : ''}</div>}
                    <AnimeCard anime={a} isWatched airingData={airingData} onClick={bulkMode ? undefined : () => setShowAnimeDetail({ ...a, _isWatched: true, _isWatchLater: false, _isSeason: false })} />
                  </div>
                )) : <div className="empty-state"><span>🎬</span><p>No hay resultados</p></div>;
              })()}
            </div>
          </>
        )}

        {activeTab === 'lists' && (
          <CustomListsTab customLists={customLists} onCreateList={createCustomList} onDeleteList={deleteCustomList}
            onRenameList={renameCustomList} onRemoveFromList={removeFromCustomList} airingData={airingData}
            onDetail={(a) => setShowAnimeDetail(a)} />
        )}

        {activeTab === 'season' && (
          <SeasonSection seasonAnime={seasonAnime} seasonLoading={seasonLoading} schedule={schedule} watchedList={watchedList} watchLater={watchLater}
            selectedSeason={selectedSeason} onChangeSeason={changeSeason}
            setShowDayPicker={setShowDayPicker} addToWatchLater={addToWatchLater} markAsWatched={markAsWatched}
            onDetail={(a) => setShowAnimeDetail({ ...a, _isWatchLater: false, _isWatched: false, _isSeason: true })} />
        )}

        {activeTab === 'stats' && <StatsPanel stats={stats} />}
      </main>

      {toast && (
        <div className="toast fade-in">
          <span className="toast-message">{toast.message}</span>
          <div className="toast-actions">
            {toast.undoFn && <button className="toast-undo" onClick={undoToast}>Deshacer</button>}
            <button className="toast-close" onClick={dismissToast}>✕</button>
          </div>
        </div>
      )}

      {showSearch && <SearchModal setShowSearch={setShowSearch} searchQuery={searchQuery} handleSearch={handleSearch}
        searchResults={searchResults} isSearching={isSearching} searchPartial={searchPartial} setSearchResults={setSearchResults} setSearchQuery={setSearchQuery}
        setShowDayPicker={setShowDayPicker} addToWatchLater={addToWatchLater} markAsWatchedFromSearch={markAsWatchedFromSearch} />}

      {showAnimeDetail && <AnimeDetailModal key={showAnimeDetail.id} showAnimeDetail={showAnimeDetail} setShowAnimeDetail={setShowAnimeDetail}
        airingData={airingData} updateEpisode={updateEpisode} updateUserRating={updateUserRating} updateAnimeLink={updateAnimeLink}
        updateAnimeNotes={updateAnimeNotes} markAsFinished={markAsFinished} dropAnime={dropAnime} deleteAnime={deleteAnime}
        addToWatchLater={addToWatchLater} markAsWatched={markAsWatched}
        setShowMoveDayPicker={setShowMoveDayPicker} setShowDayPicker={setShowDayPicker} resumeAnime={resumeAnime}
        customLists={customLists} addToCustomList={addToCustomList} removeFromCustomList={removeFromCustomList} />}

      {showDayPicker && <DayPickerModal showDayPicker={showDayPicker} setShowDayPicker={setShowDayPicker}
        watchLater={watchLater} addToSchedule={addToSchedule} moveFromWatchLaterToSchedule={moveFromWatchLaterToSchedule} />}

      {showMoveDayPicker && <MoveDayPickerModal showMoveDayPicker={showMoveDayPicker} setShowMoveDayPicker={setShowMoveDayPicker}
        moveAnimeToDay={moveAnimeToDay} />}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} />}

      {showBulkDayPicker && (
        <div className="modal-overlay" onClick={() => setShowBulkDayPicker(false)}>
          <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
            <div className="bottom-sheet-handle"></div>
            <h3 style={{ marginBottom: '1rem', textAlign: 'center' }}>Mover {bulkSelected.size} anime{bulkSelected.size > 1 ? 's' : ''} a...</h3>
            <div className="days-grid">
              {daysOfWeek.map(day => (
                <button key={day} className="day-btn" onClick={() => bulkMoveToSchedule(day)}>{dayEmojis[daysOfWeek.indexOf(day)]} {day}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
