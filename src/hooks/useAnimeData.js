import { useState, useRef, useEffect } from 'react';

export function useAnimeData(schedule) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPartial, setSearchPartial] = useState([]);
  const [airingData, setAiringData] = useState({});
  const searchTimeout = useRef(null);
  const searchIdRef = useRef(0);
  const airingCheckRef = useRef(null);

  const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // --- 1. Lógica de "Airing" (Próximos episodios - AniList) ---
  useEffect(() => {
    // Recolectar todos los anime del schedule que tengan MAL ID (id < 100000)
    const allAnime = daysOfWeek.flatMap(d => schedule[d] || []);
    const malIds = allAnime.filter(a => a.id && a.id < 100000).map(a => a.id);
    // También animes de AniList (id entre 300000-400000, restar offset)
    const anilistIds = allAnime.filter(a => a.id >= 300000 && a.id < 400000).map(a => a.id - 300000);

    if (malIds.length === 0 && anilistIds.length === 0) { setAiringData({}); return; }

    // Evitar spam: solo consultar cada 15 min, pero invalidar si hay IDs nuevos
    const cacheKey = 'anitracker-airing-cache';
    const cacheTimeKey = 'anitracker-airing-time';
    const cacheIdsKey = 'anitracker-airing-ids';
    const currentIds = [...malIds, ...anilistIds].sort().join(',');
    
    try {
      const cached = localStorage.getItem(cacheKey);
      const cachedTime = localStorage.getItem(cacheTimeKey);
      const cachedIds = localStorage.getItem(cacheIdsKey) || '';
      const cacheValid = cached && cachedTime && Date.now() - parseInt(cachedTime) < 15 * 60 * 1000;
      const idsMatch = cachedIds === currentIds;
      if (cacheValid && idsMatch) {
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
          localStorage.setItem(cacheIdsKey, currentIds);
        } catch (e) {}
      } catch (err) {
        console.error('[AniTracker] Airing check failed:', err);
      }
    }, 1000);

    return () => {
      if (airingCheckRef.current) clearTimeout(airingCheckRef.current);
    };
  }, [schedule]); // Se ejecuta cuando cambia el horario

  // --- 2. Lógica de Búsqueda (Jikan, Kitsu, AniList, TVMaze, Wiki) ---
  const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return Math.abs(hash) % 100000;
  };

  const parseEpisodes = (val) => {
    if (val === null || val === undefined || val === '?' || val === '') return null;
    const n = parseInt(val);
    return isNaN(n) || n <= 0 ? null : n;
  };

  const performSearch = async (query) => {
    if (query.length < 2) { setSearchResults([]); return; }
    const currentSearchId = ++searchIdRef.current;
    setIsSearching(true);
    try {
      // AniList GraphQL query
      const anilistQuery = `query ($search: String) {
        Page(page: 1, perPage: 12) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
            id idMal title { romaji english native userPreferred }
            coverImage { large medium } bannerImage
            genres averageScore episodes status seasonYear format
            description(asHtml: false)
            siteUrl
            synonyms
          }
        }
      }`;

      const [jikanRes, kitsuRes, anilistRes, tvmazeRes, itunesRes] = await Promise.allSettled([
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
        }),
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=movie&entity=movie,tvSeason&limit=10&country=US`).then(r => r.json())
      ]);
      const combined = new Map();
      const usedNumericIds = new Set();
      const addToCombined = (key, entry) => { combined.set(key, entry); usedNumericIds.add(entry.id); };
      const hasNumericId = (id) => usedNumericIds.has(id);
      const apiNames = ['MAL', 'Kitsu', 'AniList', 'TVMaze', 'iTunes'];
      const failedApis = [jikanRes, kitsuRes, anilistRes, tvmazeRes, itunesRes]
        .map((r, i) => r.status === 'rejected' ? apiNames[i] : null).filter(Boolean);

      // Procesar Jikan (MAL)
      if (jikanRes.status === 'fulfilled' && jikanRes.value?.data) {
        jikanRes.value.data.forEach(a => {
          const titleEn = a.title_english || '';
          const allTitles = [a.title, titleEn, a.title_japanese, ...(a.title_synonyms || [])].filter(Boolean);
          addToCombined(`mal-${a.mal_id}`, {
            id: a.mal_id, source: 'MAL',
            title: titleEn || a.title, titleOriginal: a.title,
            titleJp: a.title_japanese || '', titleEn,
            altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== (titleEn || a.title)),
            image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
            imageSm: a.images?.jpg?.image_url || a.images?.jpg?.small_image_url || '',
            genres: a.genres?.map(g => g.name) || [],
            synopsis: a.synopsis || 'Sin sinopsis disponible.',
            rating: a.score || 0, episodes: parseEpisodes(a.episodes),
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
          if (!isDup) addToCombined(`kitsu-${a.id}`, {
            id: parseInt(a.id) + 100000, source: 'Kitsu',
            title: titleEn || at.canonicalTitle, titleOriginal: at.canonicalTitle || '',
            titleJp: titleJp, titleEn,
            altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== (titleEn || at.canonicalTitle)),
            image: at.posterImage?.large || at.posterImage?.medium || '',
            imageSm: at.posterImage?.small || at.posterImage?.medium || '', genres: [],
            synopsis: at.synopsis || 'Sin sinopsis disponible.',
            rating: at.averageRating ? Number((parseFloat(at.averageRating) / 10).toFixed(1)) : 0,
            episodes: parseEpisodes(at.episodeCount), status: at.status || '',
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

          if (a.idMal && combined.has(`mal-${a.idMal}`)) return;
          const isDup = [...combined.values()].some(e =>
            (e.title || '').toLowerCase() === (titleEn || '').toLowerCase() ||
            (e.title || '').toLowerCase() === (titleRomaji || '').toLowerCase() ||
            (e.titleJp && titleNative && e.titleJp === titleNative)
          );
          if (isDup) return;

          const cleanSynopsis = (a.description || 'Sin sinopsis disponible.').replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim();
          const formatMap = { TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Película', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' };
          const statusMap = { FINISHED: 'Finished', RELEASING: 'En emisión', NOT_YET_RELEASED: 'No estrenado', CANCELLED: 'Cancelado', HIATUS: 'En pausa' };

          addToCombined(`anilist-${a.id}`, {
            id: a.id + 300000, source: 'AniList',
            title: titleEn || titleRomaji, titleOriginal: titleRomaji,
            titleJp: titleNative, titleEn,
            altTitles: allTitles.filter((t, i, arr) => arr.indexOf(t) === i && t !== (titleEn || titleRomaji)),
            image: a.coverImage?.large || '',
            imageSm: a.coverImage?.medium || a.coverImage?.large || '',
            genres: a.genres || [],
            synopsis: cleanSynopsis,
            rating: a.averageScore ? Number((a.averageScore / 10).toFixed(1)) : 0,
            episodes: parseEpisodes(a.episodes),
            status: statusMap[a.status] || a.status || '',
            year: a.seasonYear || '',
            type: formatMap[a.format] || a.format || '',
            malUrl: a.siteUrl || `https://anilist.co/anime/${a.id}`,
            watchLink: '', currentEp: 0, userRating: 0
          });
        });
      }

      // Procesar TVMaze
      if (tvmazeRes.status === 'fulfilled' && Array.isArray(tvmazeRes.value)) {
        tvmazeRes.value.slice(0, 10).forEach(result => {
          const s = result.show;
          if (!s) return;
          const title = s.name || '';
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

          addToCombined(`tvmaze-${s.id}`, {
            id: s.id + 400000, source: 'TVMaze',
            title: title, titleOriginal: title,
            titleJp: '', titleEn: title,
            altTitles: [],
            image: s.image?.original || s.image?.medium || '',
            imageSm: s.image?.medium || '',
            genres: genres,
            synopsis: synopsis,
            rating: s.rating?.average || 0,
            episodes: null,
            status: statusMap[s.status] || s.status || '',
            year: year,
            type: s.type || 'Serie',
            malUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
            watchLink: '', currentEp: 0, userRating: 0
          });
        });
      }

      // Procesar iTunes (películas y series)
      if (itunesRes.status === 'fulfilled' && itunesRes.value?.results) {
        itunesRes.value.results.forEach(item => {
          const title = item.trackName || item.collectionName || '';
          if (!title) return;
          const isDup = [...combined.values()].some(e =>
            (e.title || '').toLowerCase() === title.toLowerCase() ||
            (e.titleEn || '').toLowerCase() === title.toLowerCase()
          );
          if (isDup) return;
          const isMovie = item.kind === 'feature-movie';
          const year = item.releaseDate ? item.releaseDate.split('-')[0] : '';
          const genre = item.primaryGenreName || '';
          const synopsis = item.longDescription || item.shortDescription || 'Sin sinopsis disponible.';
          const artUrl = (item.artworkUrl100 || '').replace('100x100', '600x600');
          const artUrlSm = item.artworkUrl100 || '';
          const itunesId = (item.trackId || item.collectionId || hashString(title)) + 500000;
          if (hasNumericId(itunesId)) return;
          addToCombined(`itunes-${item.trackId || item.collectionId || hashString(title)}`, {
            id: itunesId, source: 'iTunes',
            title: title, titleOriginal: title,
            titleJp: '', titleEn: title,
            altTitles: [],
            image: artUrl,
            imageSm: artUrlSm,
            genres: genre ? [genre] : [],
            synopsis: synopsis,
            rating: 0, episodes: null,
            status: '', year: year,
            type: isMovie ? 'Película' : 'Serie',
            malUrl: item.trackViewUrl || item.collectionViewUrl || '',
            watchLink: '', currentEp: 0, userRating: 0, notes: ''
          });
        });
      }

      // Ronda 2 (Wikipedia Bridge)
      const queryLower = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const hasGoodMatch = [...combined.values()].some(v => {
        const titles = [v.title, v.titleOriginal, v.titleJp, v.titleEn, ...(v.altTitles || [])].filter(Boolean);
        return titles.some(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(queryLower) || queryLower.includes(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
      });

      if (!hasGoodMatch && query.length >= 4) {
        try {
          // Search Wikipedia in Spanish for the query (try multiple terms for broader coverage)
          const wikiSearches = await Promise.allSettled([
            fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' serie')}&srlimit=3&format=json&origin=*`).then(r => r.json()),
            fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' película')}&srlimit=2&format=json&origin=*`).then(r => r.json()),
            fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' anime')}&srlimit=2&format=json&origin=*`).then(r => r.json())
          ]);
          const seen = new Set();
          const wikiResults = [];
          wikiSearches.forEach(s => {
            if (s.status === 'fulfilled') (s.value?.query?.search || []).forEach(r => {
              if (!seen.has(r.title)) { seen.add(r.title); wikiResults.push(r); }
            });
          });

          for (const result of wikiResults) {
            try {
              const pageRes = await fetch(`https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(result.title)}&prop=langlinks&lllimit=10&lllang=ja|en&format=json&origin=*`).then(r => r.json());
              const pages = pageRes?.query?.pages || {};
              const page = Object.values(pages)[0];
              const langlinks = page?.langlinks || [];
              const enTitle = langlinks.find(l => l.lang === 'en')?.['*'] || '';
              const jaTitle = langlinks.find(l => l.lang === 'ja')?.['*'] || '';
              const wikiPageTitle = result.title;
              const searchTitle = enTitle || jaTitle || wikiPageTitle;

              if (searchTitle && searchTitle.length > 2) {
                const bridgeQueries = [
                  fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchTitle)}&limit=3&sfw=true`).then(r => r.json()),
                  fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(searchTitle)}`).then(r => r.json())
                ];
                // Also search TVMaze with the Wikipedia page title (often the localized name)
                if (wikiPageTitle !== searchTitle) {
                  bridgeQueries.push(fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(wikiPageTitle)}`).then(r => r.json()));
                }
                const [bridgeRes, bridgeTvRes, bridgeTvAltRes] = await Promise.allSettled(bridgeQueries);
                let foundSomething = false;

                if (bridgeRes.status === 'fulfilled' && bridgeRes.value?.data) {
                  bridgeRes.value.data.forEach(a => {
                    if (combined.has(`mal-${a.mal_id}`) || combined.has(`mal-bridge-${a.mal_id}`) || hasNumericId(a.mal_id)) return;
                    const titleEn = a.title_english || '';
                    const allTitles = [a.title, titleEn, a.title_japanese, ...(a.title_synonyms || [])].filter(Boolean);
                    addToCombined(`mal-bridge-${a.mal_id}`, {
                      id: a.mal_id, source: 'MAL',
                      title: titleEn || a.title, titleOriginal: a.title,
                      titleJp: a.title_japanese || '', titleEn,
                      altTitles: [...allTitles, result.title].filter((t, i, arr) => Boolean(t) && arr.indexOf(t) === i && t !== (titleEn || a.title)),
                      image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
            imageSm: a.images?.jpg?.image_url || a.images?.jpg?.small_image_url || '',
                      genres: a.genres?.map(g => g.name) || [],
                      synopsis: a.synopsis || 'Sin sinopsis disponible.',
                      rating: a.score || 0, episodes: parseEpisodes(a.episodes),
                      status: a.status || '', year: a.year || a.aired?.prop?.from?.year || '',
                      type: a.type || '', malUrl: `https://myanimelist.net/anime/${a.mal_id}`,
                      watchLink: '', currentEp: 0, userRating: 0
                    });
                    foundSomething = true;
                  });
                }

                // Process TVMaze results from both bridge queries
                const tvBridgeResults = [];
                if (bridgeTvRes.status === 'fulfilled' && Array.isArray(bridgeTvRes.value)) tvBridgeResults.push(...bridgeTvRes.value);
                if (bridgeTvAltRes && bridgeTvAltRes.status === 'fulfilled' && Array.isArray(bridgeTvAltRes.value)) tvBridgeResults.push(...bridgeTvAltRes.value);

                const statusMap2 = { Running: 'En emisión', Ended: 'Finalizado', 'To Be Determined': 'Por determinar', 'In Development': 'En desarrollo' };
                tvBridgeResults.slice(0, 5).forEach(r => {
                    const s = r.show;
                    if (!s) return;
                    const isDup = [...combined.values()].some(e => (e.title || '').toLowerCase() === (s.name || '').toLowerCase());
                    if (isDup || combined.has(`tvmaze-${s.id}`) || combined.has(`tvmaze-bridge-${s.id}`) || hasNumericId(s.id + 400000)) return;
                    const synopsis = (s.summary || 'Sin sinopsis disponible.').replace(/<[^>]*>/g, '').trim();
                    addToCombined(`tvmaze-bridge-${s.id}`, {
                      id: s.id + 400000, source: 'TVMaze',
                      title: s.name, titleOriginal: s.name,
                      titleJp: '', titleEn: s.name,
                      altTitles: [result.title].filter(Boolean),
                      image: s.image?.original || s.image?.medium || '',
                      imageSm: s.image?.medium || '',
                      genres: s.genres || [], synopsis: synopsis,
                      rating: s.rating?.average || 0, episodes: null,
                      status: statusMap2[s.status] || s.status || '',
                      year: s.premiered ? s.premiered.split('-')[0] : '',
                      type: s.type || 'Serie',
                      malUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
                      watchLink: '', currentEp: 0, userRating: 0
                    });
                    foundSomething = true;
                });
                if (foundSomething) break;
              }
            } catch (e) {}
          }
        } catch (e) { console.log('Wikipedia bridge failed:', e); }
      }

      // Ronda 3 (English Wikipedia fallback) - if still no good match
      const hasGoodMatchNow = [...combined.values()].some(v => {
        const titles = [v.title, v.titleOriginal, v.titleJp, v.titleEn, ...(v.altTitles || [])].filter(Boolean);
        return titles.some(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(queryLower) || queryLower.includes(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
      });
      if (!hasGoodMatchNow && query.length >= 4) {
        try {
          const enWikiSearches = await Promise.allSettled([
            fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' TV series')}&srlimit=3&format=json&origin=*`).then(r => r.json()),
            fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' film')}&srlimit=2&format=json&origin=*`).then(r => r.json())
          ]);
          const enSeen = new Set();
          const enWikiResults = [];
          enWikiSearches.forEach(s => {
            if (s.status === 'fulfilled') (s.value?.query?.search || []).forEach(r => {
              if (!enSeen.has(r.title)) { enSeen.add(r.title); enWikiResults.push(r); }
            });
          });
          for (const result of enWikiResults) {
            try {
              const enTitle = result.title;
              const [tvRes, itunesRes2] = await Promise.allSettled([
                fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(enTitle)}`).then(r => r.json()),
                fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(enTitle)}&media=movie&entity=movie,tvSeason&limit=3&country=US`).then(r => r.json())
              ]);
              let foundSomething = false;
              const statusMap3 = { Running: 'En emisión', Ended: 'Finalizado', 'To Be Determined': 'Por determinar', 'In Development': 'En desarrollo' };
              if (tvRes.status === 'fulfilled' && Array.isArray(tvRes.value)) {
                tvRes.value.slice(0, 3).forEach(r => {
                  const s = r.show;
                  if (!s || combined.has(`tvmaze-${s.id}`) || combined.has(`tvmaze-bridge-${s.id}`) || hasNumericId(s.id + 400000)) return;
                  const isDup = [...combined.values()].some(e => (e.title || '').toLowerCase() === (s.name || '').toLowerCase());
                  if (isDup) return;
                  const synopsis = (s.summary || 'Sin sinopsis disponible.').replace(/<[^>]*>/g, '').trim();
                  addToCombined(`tvmaze-en-${s.id}`, {
                    id: s.id + 400000, source: 'TVMaze',
                    title: s.name, titleOriginal: s.name,
                    titleJp: '', titleEn: s.name,
                    altTitles: [query].filter(Boolean),
                    image: s.image?.original || s.image?.medium || '',
                    imageSm: s.image?.medium || '',
                    genres: s.genres || [], synopsis: synopsis,
                    rating: s.rating?.average || 0, episodes: null,
                    status: statusMap3[s.status] || s.status || '',
                    year: s.premiered ? s.premiered.split('-')[0] : '',
                    type: s.type || 'Serie',
                    malUrl: s.url || `https://www.tvmaze.com/shows/${s.id}`,
                    watchLink: '', currentEp: 0, userRating: 0, notes: ''
                  });
                  foundSomething = true;
                });
              }
              if (itunesRes2.status === 'fulfilled' && itunesRes2.value?.results) {
                itunesRes2.value.results.slice(0, 3).forEach(item => {
                  const title = item.trackName || item.collectionName || '';
                  if (!title) return;
                  const isDup = [...combined.values()].some(e => (e.title || '').toLowerCase() === title.toLowerCase());
                  if (isDup) return;
                  const artUrl = (item.artworkUrl100 || '').replace('100x100', '600x600');
                  const itunesEnId = (item.trackId || item.collectionId || hashString(title)) + 500000;
                  if (hasNumericId(itunesEnId)) return;
                  addToCombined(`itunes-en-${item.trackId || item.collectionId || hashString(title)}`, {
                    id: itunesEnId, source: 'iTunes',
                    title: title, titleOriginal: title,
                    titleJp: '', titleEn: title,
                    altTitles: [query].filter(Boolean),
                    image: artUrl, imageSm: item.artworkUrl100 || '',
                    genres: item.primaryGenreName ? [item.primaryGenreName] : [],
                    synopsis: item.longDescription || item.shortDescription || 'Sin sinopsis disponible.',
                    rating: 0, episodes: null, status: '', year: item.releaseDate ? item.releaseDate.split('-')[0] : '',
                    type: item.kind === 'feature-movie' ? 'Película' : 'Serie',
                    malUrl: item.trackViewUrl || item.collectionViewUrl || '',
                    watchLink: '', currentEp: 0, userRating: 0, notes: ''
                  });
                  foundSomething = true;
                });
              }
              if (foundSomething) break;
            } catch (e) {}
          }
        } catch (e) { console.log('English Wikipedia bridge failed:', e); }
      }

      // Ordenar resultados
      const results = [...combined.values()];
      const qNorm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      results.sort((a, b) => {
        const scoreRelevance = (item) => {
          const titles = [item.title, item.titleOriginal, item.titleEn, item.titleJp, ...(item.altTitles || [])].filter(Boolean).map(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
          if (titles.some(t => t === qNorm)) return 100;
          if (titles.some(t => t.startsWith(qNorm))) return 80;
          if (titles.some(t => qNorm.startsWith(t))) return 70;
          if (titles.some(t => t.includes(qNorm))) return 60;
          if (titles.some(t => qNorm.includes(t))) return 40;
          const qWords = qNorm.split(/\s+/);
          const matchCount = qWords.filter(w => titles.some(t => t.includes(w))).length;
          return (matchCount / qWords.length) * 30;
        };
        return scoreRelevance(b) - scoreRelevance(a);
      });

      if (currentSearchId === searchIdRef.current) {
        setSearchResults(results);
        setSearchPartial(failedApis);
      }
    } catch (err) { console.error('[AniTracker] Error:', err); if (currentSearchId === searchIdRef.current) { setSearchResults([]); setSearchPartial([]); } }
    if (currentSearchId === searchIdRef.current) setIsSearching(false);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => performSearch(query), 500);
  };

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    isSearching,
    searchPartial,
    airingData,
    handleSearch,
    performSearch
  };
}