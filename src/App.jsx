import React, { useState, useEffect, useRef, useCallback } from 'react';

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const dayEmojis = ['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'];

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
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('anitracker-theme') !== 'light'; } catch { return true; }
  });
  const [watchedFilter, setWatchedFilter] = useState('all');
  const [watchedSort, setWatchedSort] = useState('date');
  const [user, setUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const searchTimeout = useRef(null);
  const [dragState, setDragState] = useState({ anime: null, fromDay: null });
  const [dropTarget, setDropTarget] = useState(null);
  const dropTargetRef = useRef(null);
  const [dropIndex, setDropIndex] = useState(null);
  const dropIndexRef = useRef(null);

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
  const [airingData, setAiringData] = useState({});

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

  // ============ AIRING DATA (AniList) ============
  const airingCheckRef = useRef(null);
  useEffect(() => {
    // Recolectar todos los anime del schedule que tengan MAL ID (id < 100000)
    const allAnime = daysOfWeek.flatMap(d => schedule[d] || []);
    const malIds = allAnime.filter(a => a.id && a.id < 100000).map(a => a.id);
    // También animes de AniList (id entre 300000-400000, restar offset)
    const anilistIds = allAnime.filter(a => a.id >= 300000 && a.id < 400000).map(a => a.id - 300000);

    if (malIds.length === 0 && anilistIds.length === 0) return;

    // Evitar spam: solo consultar cada 15 min
    const cacheKey = 'anitracker-airing-cache';
    const cacheTimeKey = 'anitracker-airing-time';
    try {
      const cached = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(cacheTimeKey);
      if (cached && cachedTime && Date.now() - parseInt(cachedTime) < 15 * 60 * 1000) {
        setAiringData(JSON.parse(cached));
        return;
      }
    } catch (e) {}

    if (airingCheckRef.current) clearTimeout(airingCheckRef.current);
    airingCheckRef.current = setTimeout(async () => {
      try {
        const queries = [];

        // Query por MAL IDs
        if (malIds.length > 0) {
          queries.push(`malQuery: Page(page: 1, perPage: 50) {
            media(idMal_in: [${malIds.join(',')}], type: ANIME) {
              id idMal status
              title { romaji english }
              nextAiringEpisode { airingAt episode timeUntilAiring }
              episodes
            }
          }`);
        }

        // Query por AniList IDs
        if (anilistIds.length > 0) {
          queries.push(`alQuery: Page(page: 1, perPage: 50) {
            media(id_in: [${anilistIds.join(',')}], type: ANIME) {
              id idMal status
              title { romaji english }
              nextAiringEpisode { airingAt episode timeUntilAiring }
              episodes
            }
          }`);
        }

        const gqlQuery = `query { ${queries.join('\n')} }`;
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: gqlQuery })
        }).then(r => r.json());

        const newAiring = {};
        const processMedia = (media) => {
          if (!media) return;
          media.forEach(m => {
            // Mapear al ID que usamos en la app
            const appId = m.idMal && m.idMal < 100000 ? m.idMal : (m.id + 300000);
            const airing = m.nextAiringEpisode;
            if (airing) {
              const airingDate = new Date(airing.airingAt * 1000);
              const now = new Date();
              const diffHours = (airingDate - now) / (1000 * 60 * 60);
              const isToday = airingDate.toDateString() === now.toDateString();
              const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
              const isTomorrow = airingDate.toDateString() === tomorrow.toDateString();
              const isThisWeek = diffHours > 0 && diffHours <= 7 * 24;
              const hasAired = diffHours <= 0 && diffHours > -24; // Aired in last 24h

              newAiring[appId] = {
                episode: airing.episode,
                airingAt: airing.airingAt,
                timeUntilAiring: airing.timeUntilAiring,
                isToday, isTomorrow, isThisWeek, hasAired,
                totalEpisodes: m.episodes,
                title: m.title?.english || m.title?.romaji || ''
              };
            }
          });
        };

        if (res.data?.malQuery?.media) processMedia(res.data.malQuery.media);
        if (res.data?.alQuery?.media) processMedia(res.data.alQuery.media);

        setAiringData(newAiring);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(newAiring));
          localStorage.setItem(cacheTimeKey, Date.now().toString());
        } catch (e) {}
        console.log('[AniTracker] Airing data loaded:', Object.keys(newAiring).length, 'anime with upcoming episodes');
      } catch (err) {
        console.error('[AniTracker] Airing check failed:', err);
      }
    }, 1000);
  }, [schedule]);

  // ============ BÚSQUEDA ============
  const searchAnime = useCallback(async (query) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      // AniList GraphQL query - busca por títulos en todos los idiomas incluyendo español
      const anilistQuery = `query ($search: String) {
        Page(page: 1, perPage: 12) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id idMal title { romaji english native userPreferred }
            coverImage { large } bannerImage
            genres averageScore episodes status seasonYear format
            description(asHtml: false)
            siteUrl
            synonyms
          }
        }
      }`;

      const [jikanRes, kitsuRes, anilistRes, tvmazeRes] = await Promise.allSettled([
        fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=10&sfw=true`).then(r => r.json()),
        fetch(`https://kitsu.app/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=10`).then(r => r.json()),
        fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: anilistQuery, variables: { search: query } })
        }).then(r => r.json()),
        fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`).then(r => {
          if (!r.ok) throw new Error(`TVMaze HTTP ${r.status}`);
          return r.json();
        })
      ]);
      const combined = new Map();

      // Procesar Jikan (MAL)
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

      // Procesar Kitsu
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

      // Procesar AniList
      if (anilistRes.status === 'fulfilled' && anilistRes.value?.data?.Page?.media) {
        anilistRes.value.data.Page.media.forEach(a => {
          const titleEn = a.title?.english || a.title?.userPreferred || '';
          const titleRomaji = a.title?.romaji || '';
          const titleNative = a.title?.native || '';
          const allTitles = [titleEn, titleRomaji, titleNative, ...(a.synonyms || [])].filter(Boolean);

          // Verificar si ya existe en MAL (por mal_id) o por título similar
          if (a.idMal && combined.has(`mal-${a.idMal}`)) return;
          const isDup = [...combined.values()].some(e =>
            (e.title || '').toLowerCase() === (titleEn || '').toLowerCase() ||
            (e.title || '').toLowerCase() === (titleRomaji || '').toLowerCase() ||
            (e.titleJp && titleNative && e.titleJp === titleNative)
          );
          if (isDup) return;

          // Limpiar sinopsis (quitar tags HTML)
          const cleanSynopsis = (a.description || 'Sin sinopsis disponible.').replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim();

          const formatMap = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Película', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
          const statusMap = { FINISHED: 'Finished', RELEASING: 'En emisión', NOT_YET_RELEASED: 'No estrenado', CANCELLED: 'Cancelado', HIATUS: 'En pausa' };

          combined.set(`anilist-${a.id}`, {
            id: a.id + 300000, source: 'AniList',
            title: titleEn || titleRomaji, titleOriginal: titleRomaji,
            titleJp: titleNative, titleEn,
            altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== (titleEn || titleRomaji)),
            image: a.coverImage?.large || '',
            genres: a.genres || [],
            synopsis: cleanSynopsis,
            rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : 0,
            episodes: a.episodes || '?',
            status: statusMap[a.status] || a.status || '',
            year: a.seasonYear || '',
            type: formatMap[a.format] || a.format || '',
            malUrl: a.siteUrl || `https://anilist.co/anime/${a.id}`,
            watchLink: '', currentEp: 0, userRating: 0
          });
        });
      }

      // Procesar TVMaze (series occidentales, animación, TV en general)
      if (tvmazeRes.status === 'fulfilled' && Array.isArray(tvmazeRes.value)) {
        tvmazeRes.value.slice(0, 10).forEach(result => {
          const s = result.show;
          if (!s) return;
          const title = s.name || '';
          // Deduplicar contra lo que ya tenemos
          const isDup = [...combined.values()].some(e =>
            (e.title || '').toLowerCase() === title.toLowerCase() ||
            (e.titleEn || '').toLowerCase() === title.toLowerCase() ||
            (e.titleOriginal || '').toLowerCase() === title.toLowerCase()
          );
          if (isDup) return;

          const genres = s.genres || [];
          const year = s.premiered ? s.premiered.split('-')[0] : '';
          const statusMap = { Running: 'En emisión', Ended: 'Finalizado', 'To Be Determined': 'Por determinar', 'In Development': 'En desarrollo' };
          const synopsis = (s.summary || 'Sin sinopsis disponible.').replace(/<[^>]*>/g, '').trim();

          combined.set(`tvmaze-${s.id}`, {
            id: s.id + 400000, source: 'TVMaze',
            title: title, titleOriginal: title,
            titleJp: '', titleEn: title,
            altTitles: [],
            image: s.image?.original || s.image?.medium || '',
            genres: genres,
            synopsis: synopsis,
            rating: s.rating?.average || 0,
            episodes: '?',
            status: statusMap[s.status] || s.status || '',
            year: year,
            type: s.type || 'Serie',
            malUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
            watchLink: '', currentEp: 0, userRating: 0
          });
        });
      }

      // Ronda 2 (puente Wikipedia): si hay pocos resultados o ninguno coincide bien con la query,
      // buscar en Wikipedia español para encontrar el nombre original del anime
      const queryLower = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const hasGoodMatch = [...combined.values()].some(v => {
        const titles = [v.title, v.titleOriginal, v.titleJp, v.titleEn, ...(v.altTitles || [])].filter(Boolean);
        return titles.some(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(queryLower) || queryLower.includes(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
      });

      if (!hasGoodMatch && query.length >= 4) {
        try {
          // Buscar en Wikipedia en español
          const wikiRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' anime')}&srlimit=3&format=json&origin=*`).then(r => r.json());
          const wikiResults = wikiRes?.query?.search || [];

          for (const result of wikiResults) {
            // Obtener los interwiki links para sacar el título en japonés/inglés
            try {
              const pageRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(result.title)}&prop=langlinks&lllimit=10&lllang=ja|en&format=json&origin=*`).then(r => r.json());
              const pages = pageRes?.query?.pages || {};
              const page = Object.values(pages)[0];
              const langlinks = page?.langlinks || [];

              // Buscar título en inglés o japonés
              const enTitle = langlinks.find(l => l.lang === 'en')?.['*'] || '';
              const jaTitle = langlinks.find(l => l.lang === 'ja')?.['*'] || '';
              const searchTitle = enTitle || jaTitle;

              if (searchTitle && searchTitle.length > 2) {
                // Re-buscar en Jikan (anime) y TVMaze (series) con el título original
                const [bridgeRes, bridgeTvRes] = await Promise.allSettled([
                  fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchTitle)}&limit=3&sfw=true`).then(r => r.json()),
                  fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(searchTitle)}`).then(r => r.json())
                ]);
                let foundSomething = false;

                // Resultados Jikan bridge
                if (bridgeRes.status === 'fulfilled' && bridgeRes.value?.data) {
                  bridgeRes.value.data.forEach(a => {
                    if (combined.has(`mal-${a.mal_id}`) || combined.has(`mal-bridge-${a.mal_id}`)) return;
                    const titleEn = a.title_english || '';
                    const allTitles = [a.title, titleEn, a.title_japanese, ...(a.title_synonyms || [])].filter(Boolean);
                    combined.set(`mal-bridge-${a.mal_id}`, {
                      id: a.mal_id, source: 'MAL',
                      title: titleEn || a.title, titleOriginal: a.title,
                      titleJp: a.title_japanese || '', titleEn,
                      altTitles: [...allTitles, result.title].filter((t, i, arr) => Boolean(t) && arr.indexOf(t) === i && t !== (titleEn || a.title)),
                      image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
                      genres: a.genres?.map(g => g.name) || [],
                      synopsis: a.synopsis || 'Sin sinopsis disponible.',
                      rating: a.score || 0, episodes: a.episodes || '?',
                      status: a.status || '', year: a.year || a.aired?.prop?.from?.year || '',
                      type: a.type || '', malUrl: `https://myanimelist.net/anime/${a.mal_id}`,
                      watchLink: '', currentEp: 0, userRating: 0
                    });
                    foundSomething = true;
                  });
                }

                // Resultados TVMaze bridge (para series occidentales)
                if (bridgeTvRes.status === 'fulfilled' && Array.isArray(bridgeTvRes.value)) {
                  bridgeTvRes.value.slice(0, 3).forEach(r => {
                    const s = r.show;
                    if (!s) return;
                    const isDup = [...combined.values()].some(e =>
                      (e.title || '').toLowerCase() === (s.name || '').toLowerCase()
                    );
                    if (isDup || combined.has(`tvmaze-${s.id}`)) return;
                    const synopsis = (s.summary || 'Sin sinopsis disponible.').replace(/<[^>]*>/g, '').trim();
                    const statusMap2 = { Running: 'En emisión', Ended: 'Finalizado', 'To Be Determined': 'Por determinar', 'In Development': 'En desarrollo' };
                    combined.set(`tvmaze-bridge-${s.id}`, {
                      id: s.id + 400000, source: 'TVMaze',
                      title: s.name, titleOriginal: s.name,
                      titleJp: '', titleEn: s.name,
                      altTitles: [result.title].filter(Boolean),
                      image: s.image?.original || s.image?.medium || '',
                      genres: s.genres || [], synopsis: synopsis,
                      rating: s.rating?.average || 0, episodes: '?',
                      status: statusMap2[s.status] || s.status || '',
                      year: s.premiered ? s.premiered.split('-')[0] : '',
                      type: s.type || 'Serie',
                      malUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
                      watchLink: '', currentEp: 0, userRating: 0
                    });
                    foundSomething = true;
                  });
                }

                if (foundSomething) break;
              }
            } catch (e) { /* ignorar errores de páginas individuales */ }
          }
        } catch (e) { console.log('Wikipedia bridge failed:', e); }
      }

      // Ordenar por relevancia: resultados cuyo título coincide mejor con la query van primero
      const results = [...combined.values()];
      const qNorm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      results.sort((a, b) => {
        const scoreRelevance = (item) => {
          const titles = [item.title, item.titleOriginal, item.titleEn, item.titleJp, ...(item.altTitles || [])].filter(Boolean).map(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          // Coincidencia exacta
          if (titles.some(t => t === qNorm)) return 100;
          // Título empieza con la query
          if (titles.some(t => t.startsWith(qNorm))) return 80;
          // Query empieza con el título
          if (titles.some(t => qNorm.startsWith(t))) return 70;
          // Título contiene la query completa
          if (titles.some(t => t.includes(qNorm))) return 60;
          // Query contenida en título
          if (titles.some(t => qNorm.includes(t))) return 40;
          // Alguna palabra de la query aparece en el título
          const qWords = qNorm.split(/\s+/);
          const matchCount = qWords.filter(w => titles.some(t => t.includes(w))).length;
          return (matchCount / qWords.length) * 30;
        };
        return scoreRelevance(b) - scoreRelevance(a);
      });

      setSearchResults(results);
    } catch (err) { console.error('[AniTracker] Error:', err); setSearchResults([]); }
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

  // ============ DRAG & DROP ============
  const handleDragStart = (e, anime, fromDay) => {
    setDragState({ anime, fromDay });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', anime.id.toString());
    requestAnimationFrame(() => {
      if (e.target) e.target.style.opacity = '0.4';
    });
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDragState({ anime: null, fromDay: null });
    setDropTarget(null);
    setDropIndex(null);
  };

  const handleDragOverRow = (e, day) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== day) setDropTarget(day);
    // Si no hay cards en este día, index = 0
    if (!schedule[day] || schedule[day].length === 0) {
      setDropIndex(0);
    }
  };

  const handleDragOverCard = (e, day, cardIndex) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== day) setDropTarget(day);
    // Detectar mitad izquierda o derecha de la card
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const idx = e.clientX < midX ? cardIndex : cardIndex + 1;
    setDropIndex(idx);
  };

  const handleDragLeave = (e, day) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = e;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      if (dropTarget === day) { setDropTarget(null); setDropIndex(null); }
    }
  };

  const insertAnimeAtPosition = (anime, fromDay, toDay, index) => {
    setSchedule(prev => {
      const next = { ...prev };
      // Remover del día origen
      if (fromDay) {
        next[fromDay] = next[fromDay].filter(a => a.id !== anime.id);
      }
      // Insertar en posición del día destino
      const targetList = [...(next[toDay] || []).filter(a => a.id !== anime.id)];
      const clampedIdx = Math.min(index ?? targetList.length, targetList.length);
      targetList.splice(clampedIdx, 0, anime);
      next[toDay] = targetList;
      return next;
    });
  };

  const handleDrop = (e, toDay) => {
    e.preventDefault();
    const { anime, fromDay } = dragState;
    if (!anime) { setDropTarget(null); setDropIndex(null); return; }
    insertAnimeAtPosition(anime, fromDay, toDay, dropIndex);
    setDragState({ anime: null, fromDay: null });
    setDropTarget(null);
    setDropIndex(null);
    setShowMoveDayPicker(null);
  };

  // Touch drag (mobile)
  const touchRef = useRef({ timer: null, active: false, anime: null, fromDay: null, startY: 0, ghost: null });
  const dayRowRefs = useRef({});
  const cardRefs = useRef({});

  const handleTouchStart = (e, anime, day) => {
    const touch = e.touches[0];
    touchRef.current.startY = touch.clientY;
    touchRef.current.startX = touch.clientX;
    touchRef.current.moved = false;
    touchRef.current.timer = setTimeout(() => {
      touchRef.current.active = true;
      touchRef.current.anime = anime;
      touchRef.current.fromDay = day;
      const ghost = document.createElement('div');
      ghost.className = 'touch-drag-ghost';
      ghost.textContent = anime.title;
      ghost.style.cssText = `position:fixed;top:${touch.clientY - 20}px;left:${touch.clientX - 60}px;z-index:9999;
        padding:8px 14px;border-radius:10px;font-size:0.8rem;font-weight:600;max-width:180px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;
        background:linear-gradient(135deg,#a855f7,#4ecdc4);color:#fff;box-shadow:0 8px 25px rgba(168,85,247,0.5);`;
      document.body.appendChild(ghost);
      touchRef.current.ghost = ghost;
      if (navigator.vibrate) navigator.vibrate(30);
      setDragState({ anime, fromDay: day });
    }, 400);
  };

  const handleTouchMove = (e, day) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchRef.current.startX);
    const dy = Math.abs(touch.clientY - touchRef.current.startY);
    if (dx > 10 || dy > 10) touchRef.current.moved = true;

    if (!touchRef.current.active) {
      if (touchRef.current.moved && touchRef.current.timer) {
        clearTimeout(touchRef.current.timer);
        touchRef.current.timer = null;
      }
      return;
    }
    e.preventDefault();
    if (touchRef.current.ghost) {
      touchRef.current.ghost.style.top = (touch.clientY - 20) + 'px';
      touchRef.current.ghost.style.left = (touch.clientX - 60) + 'px';
    }
    // Detectar día
    let foundDay = null;
    for (const d of daysOfWeek) {
      const el = dayRowRefs.current[d];
      if (el) {
        const rect = el.getBoundingClientRect();
        if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
          foundDay = d;
          break;
        }
      }
    }
    dropTargetRef.current = foundDay;
    setDropTarget(foundDay);

    // Detectar posición entre cards
    if (foundDay) {
      const cards = cardRefs.current[foundDay] || [];
      let foundIdx = cards.length; // default: al final
      for (let i = 0; i < cards.length; i++) {
        const el = cards[i];
        if (el) {
          const rect = el.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;
          if (touch.clientX < midX) { foundIdx = i; break; }
        }
      }
      dropIndexRef.current = foundIdx;
      setDropIndex(foundIdx);
    } else {
      dropIndexRef.current = null;
      setDropIndex(null);
    }
  };

  const handleTouchEnd = () => {
    if (touchRef.current.timer) {
      clearTimeout(touchRef.current.timer);
      touchRef.current.timer = null;
    }
    if (touchRef.current.ghost) {
      touchRef.current.ghost.remove();
      touchRef.current.ghost = null;
    }
    const target = dropTargetRef.current;
    const idx = dropIndexRef.current;
    if (touchRef.current.active && touchRef.current.anime && target) {
      insertAnimeAtPosition(touchRef.current.anime, touchRef.current.fromDay, target, idx);
    }
    touchRef.current.active = false;
    touchRef.current.anime = null;
    touchRef.current.fromDay = null;
    dropTargetRef.current = null;
    dropIndexRef.current = null;
    setDragState({ anime: null, fromDay: null });
    setDropTarget(null);
    setDropIndex(null);
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

  const AnimeCard = ({ anime, day, isWatchLater = false, isWatched = false }) => {
    const airing = airingData[anime.id];
    const airingBadge = airing ? (
      airing.hasAired ? 'airing-new' :
      airing.isToday ? 'airing-today' :
      airing.isTomorrow ? 'airing-tomorrow' : null
    ) : null;
    const airingText = airing ? (
      airing.hasAired ? `🆕 Ep. ${airing.episode} disponible` :
      airing.isToday ? `🔴 Ep. ${airing.episode} hoy` :
      airing.isTomorrow ? `📢 Ep. ${airing.episode} mañana` : null
    ) : null;

    const isDraggable = !isWatchLater && !isWatched && !!day;

    return (
      <div
        className={`anime-card fade-in ${airingBadge ? 'has-airing' : ''} ${isDraggable ? 'draggable' : ''}`}
        onClick={() => {
          if (touchRef.current.moved || touchRef.current.active) return;
          setShowAnimeDetail({ ...anime, _day: day, _isWatchLater: isWatchLater, _isWatched: isWatched });
        }}
        draggable={isDraggable}
        onDragStart={isDraggable ? (e) => handleDragStart(e, anime, day) : undefined}
        onDragEnd={isDraggable ? handleDragEnd : undefined}
        onTouchStart={isDraggable ? (e) => handleTouchStart(e, anime, day) : undefined}
        onTouchMove={isDraggable ? (e) => handleTouchMove(e, day) : undefined}
        onTouchEnd={isDraggable ? handleTouchEnd : undefined}
      >
        <div className="anime-card-image">
          <img src={anime.image} alt={anime.title} loading="lazy" />
          {anime.rating > 0 && (
            <div className="anime-card-score">⭐ {Number(anime.rating).toFixed ? Number(anime.rating).toFixed(1) : anime.rating}</div>
          )}
          {anime.currentEp > 0 && (
            <div className="anime-card-ep">EP {anime.currentEp}</div>
          )}
          {airingBadge && (
            <div className={`anime-card-airing ${airingBadge}`}>{airingText}</div>
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
          {(() => {
            const ep = anime.currentEp || 0;
            const total = parseInt(anime.episodes) || 0;
            if (ep <= 0 && total <= 0) return null;
            const pct = total > 0 ? Math.min((ep / total) * 100, 100) : 0;
            const isComplete = total > 0 && ep >= total;
            return (
              <div className="card-progress">
                <div className="card-progress-bar">
                  <div className={`card-progress-fill ${isComplete ? 'complete' : ''}`} style={{ width: total > 0 ? `${pct}%` : '0%' }}></div>
                </div>
                <span className="card-progress-text">{ep}{total > 0 ? ` / ${total}` : ''}</span>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

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
            <div className="search-placeholder"><span>🎌</span><p>Buscá cualquier anime o serie</p><p className="search-hint">MyAnimeList · Kitsu · AniList · TVMaze</p></div>
          )}
        </div>
      </div>
    </div>
  );

  const AnimeDetailModal = () => {
    const [localRating, setLocalRating] = useState(showAnimeDetail?.userRating || 0);
    const [localLink, setLocalLink] = useState(showAnimeDetail?.watchLink || '');
    const [showLinkInput, setShowLinkInput] = useState(false);

    // Reset local state when anime changes
    useEffect(() => {
      if (showAnimeDetail) {
        setLocalRating(showAnimeDetail.userRating || 0);
        setLocalLink(showAnimeDetail.watchLink || '');
        setShowLinkInput(false);
      }
    }, [showAnimeDetail?.id]);

    if (!showAnimeDetail) return null;
    const a = showAnimeDetail;
    const isSchedule = !a._isWatchLater && !a._isWatched;

    const closeAndDo = (fn) => { setShowAnimeDetail(null); fn(); };

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
            </div>
          </div>

          <div className="detail-synopsis"><h4>📖 Sinopsis</h4><p>{a.synopsis}</p></div>

          {/* PRÓXIMO EPISODIO */}
          {airingData[a.id] && (() => {
            const air = airingData[a.id];
            const airDate = new Date(air.airingAt * 1000);
            const formatDate = (d) => {
              const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
              const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
              return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
            };
            const label = air.hasAired ? '🆕 ¡Episodio disponible!' :
              air.isToday ? '🔴 Sale hoy' :
              air.isTomorrow ? '📢 Sale mañana' : '📡 Próximamente';
            return (
              <div className={`detail-section detail-airing ${air.hasAired ? 'aired' : air.isToday ? 'today' : ''}`}>
                <h4>{label}</h4>
                <div className="detail-airing-info">
                  <span className="detail-airing-ep">Episodio {air.episode}{air.totalEpisodes ? ` de ${air.totalEpisodes}` : ''}</span>
                  <span className="detail-airing-date">{formatDate(airDate)}</span>
                </div>
              </div>
            );
          })()}

          {/* EPISODIO */}
          {isSchedule && (
            <div className="detail-section">
              <h4>📺 Episodio actual</h4>
              <div className="episode-controls">
                <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, -1); setShowAnimeDetail({ ...a, currentEp: Math.max(0, (a.currentEp || 0) - 1) }); }}>−</button>
                <span className="ep-number">{a.currentEp || 0}</span>
                <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, 1); setShowAnimeDetail({ ...a, currentEp: (a.currentEp || 0) + 1 }); }}>+</button>
              </div>
              {(() => {
                const ep = a.currentEp || 0;
                const total = parseInt(a.episodes) || 0;
                if (total <= 0 && ep <= 0) return null;
                const pct = total > 0 ? Math.min((ep / total) * 100, 100) : 0;
                const isComplete = total > 0 && ep >= total;
                return (
                  <div className="detail-progress">
                    <div className="detail-progress-bar">
                      <div className={`detail-progress-fill ${isComplete ? 'complete' : ''}`} style={{ width: total > 0 ? `${pct}%` : '0%' }}></div>
                    </div>
                    <div className="detail-progress-label">
                      {total > 0 ? (
                        <>
                          <span>{ep} de {total} episodios</span>
                          <span className={`detail-progress-pct ${isComplete ? 'complete' : ''}`}>{Math.round(pct)}%</span>
                        </>
                      ) : (
                        <span>{ep} episodios vistos</span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* VALORACIÓN PERSONAL */}
          <div className="detail-section">
            <h4>★ Tu valoración</h4>
            <div className="detail-rating-row">
              <StarRating rating={localRating} size={24} interactive onChange={(r) => { setLocalRating(r); updateUserRating(a.id, r); setShowAnimeDetail({ ...a, userRating: r }); }} />
              {localRating > 0 && <span className="rating-text">{localRating}/5</span>}
            </div>
          </div>

          {/* LINK */}
          <div className="detail-section">
            <h4>🔗 Link de streaming</h4>
            {a.watchLink && !showLinkInput ? (
              <div className="detail-link-row">
                <a href={a.watchLink} target="_blank" rel="noopener noreferrer" className="platform-btn watch">▶ Ver ahora</a>
                <button className="detail-action-sm" onClick={() => setShowLinkInput(true)}>✏️ Editar</button>
                <button className="detail-action-sm danger" onClick={() => { updateAnimeLink(a.id, ''); setShowAnimeDetail({ ...a, watchLink: '' }); }}>🗑</button>
              </div>
            ) : (
              <div className="detail-link-edit">
                <input type="url" placeholder="https://crunchyroll.com/..." value={localLink} onChange={e => setLocalLink(e.target.value)} />
                <button className="save-link-btn" onClick={() => { updateAnimeLink(a.id, localLink); setShowAnimeDetail({ ...a, watchLink: localLink }); setShowLinkInput(false); }}>Guardar</button>
                {showLinkInput && <button className="cancel-link-btn" onClick={() => setShowLinkInput(false)}>Cancelar</button>}
              </div>
            )}
          </div>

          {/* INFO LINK */}
          <div className="detail-section">
            <a href={a.malUrl} target="_blank" rel="noopener noreferrer" className="platform-btn mal">📊 Ver en {a.source || 'Info'}</a>
          </div>

          {/* ACCIONES PRINCIPALES */}
          <div className="detail-actions">
            {isSchedule && (
              <>
                <button className="detail-action-btn finish" onClick={() => closeAndDo(() => markAsFinished(a, a._day))}>✓ Finalizar</button>
                <button className="detail-action-btn drop" onClick={() => closeAndDo(() => dropAnime(a, a._day))}>✗ Dropear</button>
                <button className="detail-action-btn move" onClick={() => closeAndDo(() => setShowMoveDayPicker({ anime: a, fromDay: a._day }))}>↔ Mover día</button>
              </>
            )}
            {a._isWatchLater && (
              <button className="detail-action-btn schedule" onClick={() => closeAndDo(() => setShowDayPicker(a))}>📅 Añadir a semana</button>
            )}
            {a._isWatched && !a.finished && (
              <button className="detail-action-btn resume" onClick={() => closeAndDo(() => resumeAnime(a))}>▶ Retomar</button>
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

        /* DRAG & DROP */
        .day-row.drop-target {
          border-color: rgba(168,85,247,0.6) !important;
          background: rgba(168,85,247,0.08) !important;
          box-shadow: inset 0 0 20px rgba(168,85,247,0.1), 0 0 15px rgba(168,85,247,0.15);
          transform: scale(1.01);
        }
        .day-row.drag-source { opacity: 0.6; }
        .anime-card.draggable { cursor: grab; }
        .anime-card.draggable:active { cursor: grabbing; }

        .card-drag-wrapper { flex-shrink: 0; }

        .drop-indicator {
          width: 3px; min-height: 80px; align-self: stretch; flex-shrink: 0;
          border-radius: 3px;
          background: linear-gradient(180deg, #a855f7, #4ecdc4);
          box-shadow: 0 0 10px rgba(168,85,247,0.5);
          animation: dropPulse 1s ease-in-out infinite;
        }
        @keyframes dropPulse { 0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(168,85,247,0.5); } 50% { opacity: 0.7; box-shadow: 0 0 20px rgba(168,85,247,0.8); } }

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

        .anime-card-airing {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 0.3rem 0.5rem; font-size: 0.65rem; font-weight: 700;
          text-align: center; color: #fff;
        }
        .anime-card-airing.airing-new {
          background: linear-gradient(135deg, rgba(34,197,94,0.9), rgba(16,185,129,0.9));
          animation: airingPulse 2s ease-in-out infinite;
        }
        .anime-card-airing.airing-today {
          background: linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9));
          animation: airingPulse 2s ease-in-out infinite;
        }
        .anime-card-airing.airing-tomorrow {
          background: linear-gradient(135deg, rgba(251,191,36,0.85), rgba(245,158,11,0.85));
          color: #1a1a2e;
        }
        @keyframes airingPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }

        .anime-card.has-airing { border-color: rgba(168,85,247,0.4); }

        /* AIRING SECTION */
        .airing-section {
          border-radius: 20px; padding: 1.25rem; margin-bottom: 1.25rem;
          border: 1px solid;
        }
        .dark .airing-section {
          background: linear-gradient(135deg, rgba(239,68,68,0.05), rgba(168,85,247,0.05));
          border-color: rgba(239,68,68,0.15);
        }
        .light .airing-section {
          background: linear-gradient(135deg, rgba(239,68,68,0.05), rgba(168,85,247,0.05));
          border-color: rgba(239,68,68,0.2);
        }
        .airing-header {
          display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;
        }
        .airing-icon { font-size: 1.3rem; }
        .airing-header h3 {
          font-size: 1.1rem; font-weight: 700;
          background: linear-gradient(135deg, #ef4444, #a855f7);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .airing-count {
          background: rgba(239,68,68,0.2); padding: 0.15rem 0.6rem;
          border-radius: 20px; font-size: 0.75rem; font-weight: 600; color: #f87171;
        }
        .airing-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .airing-item {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.6rem 0.75rem; border-radius: 12px;
          cursor: pointer; transition: all 0.2s ease;
          border: 1px solid transparent;
        }
        .dark .airing-item { background: rgba(255,255,255,0.03); }
        .light .airing-item { background: rgba(0,0,0,0.03); }
        .airing-item:hover { transform: translateX(4px); border-color: rgba(168,85,247,0.3); }
        .airing-item.today { border-left: 3px solid #ef4444; }
        .airing-item.aired { border-left: 3px solid #22c55e; }
        .airing-img {
          width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex-shrink: 0;
        }
        .airing-info { flex: 1; min-width: 0; }
        .airing-title {
          font-size: 0.85rem; font-weight: 600; display: block;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .airing-ep { font-size: 0.7rem; opacity: 0.6; }
        .airing-time {
          font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem;
          border-radius: 8px; white-space: nowrap; flex-shrink: 0;
        }
        .airing-time.aired { background: rgba(34,197,94,0.2); color: #4ade80; }
        .airing-time.today { background: rgba(239,68,68,0.2); color: #f87171; animation: airingPulse 2s ease-in-out infinite; }
        .airing-time.tomorrow { background: rgba(251,191,36,0.2); color: #fbbf24; }
        .airing-time.later { background: rgba(168,85,247,0.15); color: #c4b5fd; }

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

        /* CARD PROGRESS BAR */
        .card-progress { margin-top: 0.4rem; }
        .card-progress-bar {
          height: 4px; border-radius: 2px; overflow: hidden;
          background: rgba(128,128,128,0.15);
        }
        .card-progress-fill {
          height: 100%; border-radius: 2px;
          background: linear-gradient(90deg, #a855f7, #4ecdc4);
          transition: width 0.5s ease;
        }
        .card-progress-fill.complete {
          background: linear-gradient(90deg, #22c55e, #4ade80);
        }
        .card-progress-text {
          font-size: 0.6rem; opacity: 0.5; margin-top: 0.15rem; display: block;
        }

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

        .detail-synopsis { margin-bottom: 1rem; }
        .detail-synopsis h4 { font-size: 0.85rem; opacity: 0.5; margin-bottom: 0.4rem; }
        .detail-synopsis p { line-height: 1.6; opacity: 0.8; font-size: 0.85rem; }

        .detail-section {
          padding: 1rem 0; border-top: 1px solid rgba(128,128,128,0.15);
        }
        .detail-section h4 { font-size: 0.85rem; opacity: 0.5; margin-bottom: 0.6rem; }

        .detail-airing {
          border-radius: 12px; padding: 0.85rem 1rem !important;
          margin-top: 0.5rem;
        }
        .detail-airing h4 { opacity: 1 !important; font-size: 0.9rem !important; }
        .dark .detail-airing { background: rgba(168,85,247,0.08); }
        .light .detail-airing { background: rgba(168,85,247,0.06); }
        .detail-airing.today h4 { color: #ef4444; }
        .dark .detail-airing.today { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.2); }
        .light .detail-airing.today { background: rgba(239,68,68,0.06); }
        .detail-airing.aired h4 { color: #22c55e; }
        .dark .detail-airing.aired { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.2); }
        .light .detail-airing.aired { background: rgba(34,197,94,0.06); }
        .detail-airing-info {
          display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
        }
        .detail-airing-ep { font-weight: 700; font-size: 0.95rem; }
        .detail-airing-date { font-size: 0.8rem; opacity: 0.6; }

        .episode-controls {
          display: flex; align-items: center; gap: 1rem;
        }
        .ep-control-btn {
          width: 40px; height: 40px; border-radius: 50%; border: none;
          font-size: 1.2rem; font-weight: 700; cursor: pointer;
          transition: all 0.2s; display: flex; align-items: center; justify-content: center;
        }
        .dark .ep-control-btn { background: rgba(99,102,241,0.2); color: #818cf8; }
        .light .ep-control-btn { background: rgba(99,102,241,0.1); color: #6366f1; }
        .ep-control-btn:hover { transform: scale(1.1); filter: brightness(1.3); }
        .ep-number {
          font-size: 1.5rem; font-weight: 700; min-width: 40px; text-align: center;
          background: linear-gradient(135deg, #818cf8, #4ecdc4);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }

        /* DETAIL PROGRESS BAR */
        .detail-progress { margin-top: 0.85rem; }
        .detail-progress-bar {
          height: 8px; border-radius: 4px; overflow: hidden;
          background: rgba(128,128,128,0.15);
        }
        .detail-progress-fill {
          height: 100%; border-radius: 4px;
          background: linear-gradient(90deg, #a855f7, #4ecdc4);
          transition: width 0.5s ease;
        }
        .detail-progress-fill.complete {
          background: linear-gradient(90deg, #22c55e, #4ade80);
        }
        .detail-progress-label {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 0.35rem; font-size: 0.8rem; opacity: 0.6;
        }
        .detail-progress-pct { font-weight: 700; opacity: 1; }
        .detail-progress-pct.complete { color: #4ade80; }

        .detail-rating-row { display: flex; align-items: center; gap: 0.75rem; }
        .rating-text { font-size: 0.85rem; opacity: 0.5; }

        .detail-link-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .detail-action-sm {
          padding: 0.4rem 0.75rem; border-radius: 8px; border: none;
          font-size: 0.8rem; cursor: pointer; transition: all 0.2s;
        }
        .dark .detail-action-sm { background: rgba(255,255,255,0.08); color: #fff; }
        .light .detail-action-sm { background: rgba(0,0,0,0.06); color: #333; }
        .detail-action-sm.danger { color: #f87171; }
        .detail-action-sm:hover { filter: brightness(1.3); }

        .detail-link-edit { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
        .detail-link-edit input {
          flex: 1; min-width: 200px; padding: 0.6rem 0.85rem;
          border: 1px solid; border-radius: 10px;
          font-size: 0.85rem; font-family: inherit;
        }
        .dark .detail-link-edit input { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.15); color: #fff; }
        .light .detail-link-edit input { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.15); color: #1a1a2e; }
        .detail-link-edit input:focus { outline: none; border-color: rgba(168,85,247,0.5); }

        .detail-actions {
          display: flex; gap: 0.6rem; flex-wrap: wrap;
          margin-top: 1.25rem; padding-top: 1.25rem;
          border-top: 1px solid rgba(128,128,128,0.15);
        }
        .detail-action-btn {
          flex: 1; min-width: 120px; padding: 0.75rem 1rem;
          border: none; border-radius: 12px; font-family: inherit;
          font-size: 0.9rem; font-weight: 600; cursor: pointer;
          transition: all 0.2s;
        }
        .detail-action-btn:hover { transform: translateY(-2px); filter: brightness(1.2); }
        .detail-action-btn.finish { background: linear-gradient(135deg, rgba(34,197,94,0.3), rgba(34,197,94,0.15)); color: #4ade80; }
        .detail-action-btn.drop { background: linear-gradient(135deg, rgba(239,68,68,0.3), rgba(239,68,68,0.15)); color: #f87171; }
        .detail-action-btn.move { background: linear-gradient(135deg, rgba(236,72,153,0.3), rgba(236,72,153,0.15)); color: #f472b6; }
        .detail-action-btn.schedule { background: linear-gradient(135deg, rgba(168,85,247,0.3), rgba(168,85,247,0.15)); color: #c4b5fd; }
        .detail-action-btn.resume { background: linear-gradient(135deg, rgba(99,102,241,0.3), rgba(99,102,241,0.15)); color: #818cf8; }

        .platform-btn { padding: 0.6rem 1rem; border-radius: 10px; color: #fff; text-decoration: none; font-weight: 500; transition: all 0.2s; font-size: 0.85rem; display: inline-block; }
        .platform-btn:hover { transform: translateY(-2px); }
        .platform-btn.mal { background: linear-gradient(135deg, #2E51A2, #4267B2); }
        .platform-btn.watch { background: linear-gradient(135deg, #22c55e, #16a34a); }

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

        .save-link-btn, .cancel-link-btn {
          padding: 0.6rem 1rem; border: none; border-radius: 10px;
          color: #fff; font-family: inherit; cursor: pointer; transition: all 0.2s; font-size: 0.85rem;
        }
        .save-link-btn { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .save-link-btn:hover { transform: translateY(-2px); }
        .cancel-link-btn { background: rgba(128,128,128,0.2); }
        .cancel-link-btn:hover { filter: brightness(1.3); }

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
            {/* Sección: Episodios esta semana */}
            {Object.keys(airingData).length > 0 && (() => {
              const allAnime = daysOfWeek.flatMap(d => (schedule[d] || []).map(a => ({ ...a, _day: d })));
              const airingAnime = allAnime.filter(a => airingData[a.id]).map(a => ({
                ...a,
                airing: airingData[a.id]
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
                    <span className="airing-icon">📡</span>
                    <h3>Próximos episodios</h3>
                    <span className="airing-count">{airingAnime.length}</span>
                  </div>
                  <div className="airing-list">
                    {airingAnime.map(a => (
                      <div key={a.id} className={`airing-item ${a.airing.hasAired ? 'aired' : a.airing.isToday ? 'today' : ''}`}
                        onClick={() => setShowAnimeDetail({ ...a, _day: a._day, _isWatchLater: false, _isWatched: false })}>
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
            })()}
            {daysOfWeek.map((day, i) => (
              <div key={day}
                ref={el => { dayRowRefs.current[day] = el; }}
                className={`day-row fade-in ${dropTarget === day ? 'drop-target' : ''} ${dragState.fromDay === day && dragState.anime ? 'drag-source' : ''}`}
                onDragOver={(e) => handleDragOverRow(e, day)}
                onDragLeave={(e) => handleDragLeave(e, day)}
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
                      {dropTarget === day && dropIndex === idx && dragState.anime && dragState.anime.id !== a.id && (
                        <div className="drop-indicator"></div>
                      )}
                      <div
                        ref={el => { if (!cardRefs.current[day]) cardRefs.current[day] = []; cardRefs.current[day][idx] = el; }}
                        onDragOver={(e) => handleDragOverCard(e, day, idx)}
                        className="card-drag-wrapper"
                      >
                        <AnimeCard anime={a} day={day} />
                      </div>
                      {dropTarget === day && dropIndex === idx + 1 && idx === schedule[day].length - 1 && dragState.anime && (
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
    </div>
  );
}
