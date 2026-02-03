import React, { useState, useEffect } from 'react';

// Anime Database (simulada - en producción conectarías a APIs reales)
const animeDatabase = [
  {
    id: 1,
    title: "Jujutsu Kaisen",
    image: "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg",
    genres: ["Acción", "Fantasía", "Sobrenatural"],
    synopsis: "Yuji Itadori es un estudiante con habilidades físicas excepcionales. Un día, para salvar a sus amigos de un maleficio, ingiere el dedo de Ryomen Sukuna, el Rey de las Maldiciones, convirtiéndose en su huésped.",
    rating: { animeflv: 4.8, crunchyroll: 4.9, netflix: 4.7 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/jujutsu-kaisen",
      crunchyroll: "https://www.crunchyroll.com/es/jujutsu-kaisen",
      netflix: "https://www.netflix.com/title/81278456"
    }
  },
  {
    id: 2,
    title: "Demon Slayer",
    image: "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg",
    genres: ["Acción", "Fantasía", "Histórico"],
    synopsis: "Tanjiro Kamado es un joven bondadoso que vive en las montañas con su familia. Un día, su vida cambia drásticamente cuando los demonios asesinan a su familia y convierten a su hermana Nezuko en un demonio.",
    rating: { animeflv: 4.9, crunchyroll: 4.9, prime: 4.8 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/kimetsu-no-yaiba",
      crunchyroll: "https://www.crunchyroll.com/es/demon-slayer-kimetsu-no-yaiba",
      prime: "https://www.primevideo.com/detail/Demon-Slayer"
    }
  },
  {
    id: 3,
    title: "One Piece",
    image: "https://cdn.myanimelist.net/images/anime/1244/138851l.jpg",
    genres: ["Acción", "Aventura", "Comedia"],
    synopsis: "Monkey D. Luffy se embarca en una aventura épica para encontrar el legendario tesoro One Piece y convertirse en el Rey de los Piratas.",
    rating: { animeflv: 4.9, crunchyroll: 4.8, netflix: 4.7 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/one-piece",
      crunchyroll: "https://www.crunchyroll.com/es/one-piece",
      netflix: "https://www.netflix.com/title/80107103"
    }
  },
  {
    id: 4,
    title: "Attack on Titan",
    image: "https://cdn.myanimelist.net/images/anime/10/47347l.jpg",
    genres: ["Acción", "Drama", "Fantasía"],
    synopsis: "En un mundo donde la humanidad vive tras enormes muros para protegerse de los Titanes, Eren Yeager jura exterminarlos después de presenciar la muerte de su madre.",
    rating: { animeflv: 4.9, crunchyroll: 4.9, prime: 4.8 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/shingeki-no-kyojin",
      crunchyroll: "https://www.crunchyroll.com/es/attack-on-titan",
      prime: "https://www.primevideo.com/detail/Attack-on-Titan"
    }
  },
  {
    id: 5,
    title: "My Hero Academia",
    image: "https://cdn.myanimelist.net/images/anime/10/78745l.jpg",
    genres: ["Acción", "Comedia", "Superpoderes"],
    synopsis: "En un mundo donde el 80% de la población tiene superpoderes, Izuku Midoriya nace sin ninguno. Sin embargo, su sueño de convertirse en héroe no se desvanece.",
    rating: { animeflv: 4.7, crunchyroll: 4.8, netflix: 4.6 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/boku-no-hero-academia",
      crunchyroll: "https://www.crunchyroll.com/es/my-hero-academia",
      netflix: "https://www.netflix.com/title/80135674"
    }
  },
  {
    id: 6,
    title: "Spy x Family",
    image: "https://cdn.myanimelist.net/images/anime/1441/122795l.jpg",
    genres: ["Acción", "Comedia", "Slice of Life"],
    synopsis: "Un espía debe formar una familia falsa para cumplir su misión, sin saber que su hija adoptiva es telépata y su esposa es una asesina.",
    rating: { animeflv: 4.8, crunchyroll: 4.9, netflix: 4.8 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/spy-x-family",
      crunchyroll: "https://www.crunchyroll.com/es/spy-x-family",
      netflix: "https://www.netflix.com/title/81511883"
    }
  },
  {
    id: 7,
    title: "Chainsaw Man",
    image: "https://cdn.myanimelist.net/images/anime/1806/126216l.jpg",
    genres: ["Acción", "Fantasía", "Horror"],
    synopsis: "Denji, un joven cazador de demonios, se fusiona con su demonio mascota Pochita para convertirse en Chainsaw Man, un híbrido humano-demonio.",
    rating: { animeflv: 4.7, crunchyroll: 4.8, prime: 4.7 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/chainsaw-man",
      crunchyroll: "https://www.crunchyroll.com/es/chainsaw-man",
      prime: "https://www.primevideo.com/detail/Chainsaw-Man"
    }
  },
  {
    id: 8,
    title: "Bocchi the Rock!",
    image: "https://cdn.myanimelist.net/images/anime/1448/127956l.jpg",
    genres: ["Comedia", "Música", "Slice of Life"],
    synopsis: "Hitori Gotoh es una chica con ansiedad social extrema que sueña con ser guitarrista en una banda. Su vida cambia cuando conoce a las integrantes de Kessoku Band.",
    rating: { animeflv: 4.8, crunchyroll: 4.9 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/bocchi-the-rock",
      crunchyroll: "https://www.crunchyroll.com/es/bocchi-the-rock"
    }
  },
  {
    id: 9,
    title: "Frieren: Beyond Journey's End",
    image: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg",
    genres: ["Aventura", "Drama", "Fantasía"],
    synopsis: "Después de derrotar al Rey Demonio, la elfa maga Frieren comienza un viaje para entender las emociones humanas y el significado de la vida.",
    rating: { animeflv: 4.9, crunchyroll: 4.9, netflix: 4.8 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/sousou-no-frieren",
      crunchyroll: "https://www.crunchyroll.com/es/frieren-beyond-journeys-end",
      netflix: "https://www.netflix.com/title/81726323"
    }
  },
  {
    id: 10,
    title: "Solo Leveling",
    image: "https://cdn.myanimelist.net/images/anime/1826/138412l.jpg",
    genres: ["Acción", "Aventura", "Fantasía"],
    synopsis: "Sung Jinwoo, el cazador más débil de todos, obtiene un sistema único que le permite subir de nivel sin límites tras un evento misterioso.",
    rating: { animeflv: 4.8, crunchyroll: 4.9, prime: 4.8 },
    links: {
      animeflv: "https://www3.animeflv.net/anime/solo-leveling",
      crunchyroll: "https://www.crunchyroll.com/es/solo-leveling",
      prime: "https://www.primevideo.com/detail/Solo-Leveling"
    }
  }
];

const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const platformIcons = {
  animeflv: '🎬',
  crunchyroll: '🍥',
  netflix: '📺',
  prime: '📦'
};

const platformColors = {
  animeflv: '#4CAF50',
  crunchyroll: '#F47521',
  netflix: '#E50914',
  prime: '#00A8E1'
};

export default function AnimeTracker() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [showDayPicker, setShowDayPicker] = useState(null);
  const [showAnimeDetail, setShowAnimeDetail] = useState(null);
  
  const [schedule, setSchedule] = useState(() => {
    const saved = localStorage.getItem('animeSchedule');
    return saved ? JSON.parse(saved) : {
      'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [],
      'Viernes': [], 'Sábado': [], 'Domingo': []
    };
  });
  
  const [watchedList, setWatchedList] = useState(() => {
    const saved = localStorage.getItem('watchedAnimes');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [watchLater, setWatchLater] = useState(() => {
    const saved = localStorage.getItem('watchLater');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('animeSchedule', JSON.stringify(schedule));
  }, [schedule]);

  useEffect(() => {
    localStorage.setItem('watchedAnimes', JSON.stringify(watchedList));
  }, [watchedList]);

  useEffect(() => {
    localStorage.setItem('watchLater', JSON.stringify(watchLater));
  }, [watchLater]);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.length > 1) {
      const results = animeDatabase.filter(anime =>
        anime.title.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const addToSchedule = (anime, day, platform) => {
    const animeWithPlatform = { ...anime, selectedPlatform: platform };
    setSchedule(prev => ({
      ...prev,
      [day]: [...prev[day].filter(a => a.id !== anime.id), animeWithPlatform]
    }));
    setShowDayPicker(null);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeFromSchedule = (animeId, day) => {
    setSchedule(prev => ({
      ...prev,
      [day]: prev[day].filter(a => a.id !== animeId)
    }));
  };

  const markAsFinished = (anime, day) => {
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: true, finishedDate: new Date().toLocaleDateString() }]);
  };

  const dropAnime = (anime, day) => {
    removeFromSchedule(anime.id, day);
    setWatchedList(prev => [...prev.filter(a => a.id !== anime.id), { ...anime, finished: false, droppedDate: new Date().toLocaleDateString() }]);
  };

  const addToWatchLater = (anime, platform) => {
    const animeWithPlatform = { ...anime, selectedPlatform: platform };
    setWatchLater(prev => [...prev.filter(a => a.id !== anime.id), animeWithPlatform]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const moveFromWatchLaterToSchedule = (anime, day) => {
    setWatchLater(prev => prev.filter(a => a.id !== anime.id));
    setSchedule(prev => ({
      ...prev,
      [day]: [...prev[day].filter(a => a.id !== anime.id), anime]
    }));
  };

  const resumeAnime = (anime) => {
    setWatchedList(prev => prev.filter(a => a.id !== anime.id));
    setShowDayPicker(anime);
  };

  const AnimeCard = ({ anime, day, showActions = true, isWatchLater = false, isWatched = false }) => {
    const [showOptions, setShowOptions] = useState(false);
    const [showPlatformSelect, setShowPlatformSelect] = useState(false);

    return (
      <div className="anime-card" onClick={() => setShowAnimeDetail(anime)}>
        <div className="anime-card-image">
          <img src={anime.image} alt={anime.title} />
          <div className="anime-card-overlay">
            {anime.selectedPlatform && (
              <span className="platform-badge" style={{ background: platformColors[anime.selectedPlatform] }}>
                {platformIcons[anime.selectedPlatform]} {anime.selectedPlatform}
              </span>
            )}
          </div>
        </div>
        <div className="anime-card-content">
          <h3>{anime.title}</h3>
          <div className="anime-genres">
            {anime.genres.slice(0, 2).map((genre, i) => (
              <span key={i} className="genre-tag">{genre}</span>
            ))}
          </div>
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
                <button className="action-btn finish" onClick={() => markAsFinished(anime, day)} title="Finalizar">
                  ✓
                </button>
                <button className="action-btn drop" onClick={() => dropAnime(anime, day)} title="Dropear">
                  ✗
                </button>
              </>
            )}
            {isWatchLater && (
              <button 
                className="action-btn schedule" 
                onClick={() => setShowDayPicker(anime)}
                title="Añadir a la semana"
              >
                📅
              </button>
            )}
            {isWatched && !anime.finished && (
              <button 
                className="action-btn resume" 
                onClick={() => resumeAnime(anime)}
                title="Retomar"
              >
                ▶
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const SearchModal = () => (
    <div className="modal-overlay" onClick={() => setShowSearch(false)}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-header">
          <input
            type="text"
            placeholder="🔍 Buscar anime o serie..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            autoFocus
          />
          <button className="close-btn" onClick={() => setShowSearch(false)}>×</button>
        </div>
        
        <div className="search-results">
          {searchResults.length > 0 ? (
            searchResults.map(anime => (
              <div key={anime.id} className="search-result-item">
                <img src={anime.image} alt={anime.title} />
                <div className="search-result-info">
                  <h4>{anime.title}</h4>
                  <div className="available-platforms">
                    <span className="label">Disponible en:</span>
                    <div className="platforms-list">
                      {Object.entries(anime.links).map(([platform, link]) => (
                        <a 
                          key={platform} 
                          href={link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="platform-link"
                          style={{ background: platformColors[platform] }}
                        >
                          {platformIcons[platform]} {platform}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="search-result-actions">
                  <div className="action-group">
                    <span className="action-label">Añadir a la semana:</span>
                    <select 
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedAnime({ anime, day: e.target.value });
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Seleccionar día</option>
                      {daysOfWeek.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    className="watch-later-btn"
                    onClick={() => {
                      const platform = Object.keys(anime.links)[0];
                      addToWatchLater(anime, platform);
                    }}
                  >
                    🕐 Ver más tarde
                  </button>
                </div>
                
                {selectedAnime?.anime.id === anime.id && (
                  <div className="platform-selector">
                    <span>Selecciona plataforma:</span>
                    <div className="platform-buttons">
                      {Object.keys(anime.links).map(platform => (
                        <button
                          key={platform}
                          onClick={() => {
                            addToSchedule(anime, selectedAnime.day, platform);
                            setSelectedAnime(null);
                          }}
                          style={{ background: platformColors[platform] }}
                        >
                          {platformIcons[platform]} {platform}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
              <p>Escribe el nombre de un anime para buscarlo</p>
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
              <div className="detail-genres">
                {anime.genres.map((genre, i) => (
                  <span key={i} className="genre-tag">{genre}</span>
                ))}
              </div>
              <div className="detail-ratings">
                <h4>⭐ Valoraciones:</h4>
                {Object.entries(anime.rating).map(([platform, rating]) => (
                  <div key={platform} className="rating-item">
                    <span style={{ color: platformColors[platform] }}>
                      {platformIcons[platform]} {platform}:
                    </span>
                    <span className="rating-value">{rating}/5</span>
                    <div className="rating-bar">
                      <div style={{ width: `${(rating / 5) * 100}%`, background: platformColors[platform] }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="detail-synopsis">
            <h4>📖 Sinopsis:</h4>
            <p>{anime.synopsis}</p>
          </div>
          <div className="detail-links">
            <h4>🔗 Ver en:</h4>
            <div className="link-buttons">
              {Object.entries(anime.links).map(([platform, link]) => (
                <a
                  key={platform}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="platform-btn"
                  style={{ background: platformColors[platform] }}
                >
                  {platformIcons[platform]} {platform}
                </a>
              ))}
            </div>
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
          <h3>📅 Selecciona un día para "{showDayPicker.title}"</h3>
          <div className="days-grid">
            {daysOfWeek.map(day => (
              <button
                key={day}
                className="day-btn"
                onClick={() => {
                  if (showDayPicker.selectedPlatform) {
                    moveFromWatchLaterToSchedule(showDayPicker, day);
                  } else {
                    addToSchedule(showDayPicker, day, Object.keys(showDayPicker.links)[0]);
                  }
                  setShowDayPicker(null);
                }}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="anime-tracker">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Zen+Dots&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

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
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            radial-gradient(circle at 20% 80%, rgba(255, 107, 107, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(78, 205, 196, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(168, 85, 247, 0.05) 0%, transparent 40%);
          pointer-events: none;
          z-index: 0;
        }

        .header {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(15, 15, 26, 0.95);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 1rem 2rem;
        }

        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo {
          font-family: 'Zen Dots', cursive;
          font-size: 1.8rem;
          background: linear-gradient(135deg, #ff6b6b, #4ecdc4, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: 0 0 30px rgba(168, 85, 247, 0.5);
        }

        .search-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(78, 205, 196, 0.2));
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 50px;
          color: #fff;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .search-btn:hover {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(78, 205, 196, 0.4));
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(168, 85, 247, 0.3);
        }

        .nav-tabs {
          display: flex;
          gap: 0.5rem;
          padding: 1rem 2rem;
          max-width: 1400px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        .nav-tab {
          padding: 0.75rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .nav-tab:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .nav-tab.active {
          background: linear-gradient(135deg, #a855f7, #4ecdc4);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 5px 20px rgba(168, 85, 247, 0.4);
        }

        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1rem 2rem 3rem;
          position: relative;
          z-index: 1;
        }

        .schedule-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1.5rem;
        }

        .day-column {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 20px;
          padding: 1.25rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          min-height: 400px;
        }

        .day-header {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          padding-bottom: 0.75rem;
          border-bottom: 2px solid;
          border-image: linear-gradient(90deg, #a855f7, #4ecdc4) 1;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .day-header span {
          font-size: 1.3rem;
        }

        .anime-card {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 1rem;
          cursor: pointer;
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
          position: relative;
          aspect-ratio: 3/4;
          overflow: hidden;
        }

        .anime-card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.5s ease;
        }

        .anime-card:hover .anime-card-image img {
          transform: scale(1.1);
        }

        .anime-card-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: 0.5rem;
        }

        .platform-badge {
          display: inline-block;
          padding: 0.25rem 0.6rem;
          border-radius: 20px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .anime-card-content {
          padding: 0.75rem;
        }

        .anime-card-content h3 {
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .anime-genres {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }

        .genre-tag {
          font-size: 0.65rem;
          padding: 0.2rem 0.5rem;
          background: rgba(168, 85, 247, 0.2);
          border-radius: 20px;
          color: #c4b5fd;
        }

        .status-badge {
          margin-top: 0.5rem;
          padding: 0.3rem 0.6rem;
          border-radius: 8px;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .status-badge.finished {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
        }

        .status-badge.dropped {
          background: rgba(251, 191, 36, 0.2);
          color: #fcd34d;
        }

        .anime-card-actions {
          display: flex;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem 0.75rem;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .anime-card:hover .anime-card-actions {
          opacity: 1;
        }

        .action-btn {
          flex: 1;
          padding: 0.5rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.2s ease;
        }

        .action-btn.finish {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
        }

        .action-btn.finish:hover {
          background: rgba(34, 197, 94, 0.4);
        }

        .action-btn.drop {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }

        .action-btn.drop:hover {
          background: rgba(239, 68, 68, 0.4);
        }

        .action-btn.schedule, .action-btn.resume {
          background: rgba(168, 85, 247, 0.2);
          color: #c4b5fd;
        }

        .action-btn.schedule:hover, .action-btn.resume:hover {
          background: rgba(168, 85, 247, 0.4);
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .section-header h2 {
          font-size: 1.5rem;
          font-weight: 700;
          background: linear-gradient(135deg, #fff, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .section-header .count {
          background: rgba(168, 85, 247, 0.3);
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          font-size: 0.85rem;
        }

        .anime-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 4rem 2rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .empty-state span {
          font-size: 4rem;
          display: block;
          margin-bottom: 1rem;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .search-modal {
          width: 100%;
          max-width: 700px;
          max-height: 85vh;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .search-header {
          display: flex;
          gap: 1rem;
          padding: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .search-header input {
          flex: 1;
          padding: 1rem 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50px;
          color: #fff;
          font-size: 1rem;
          font-family: inherit;
        }

        .search-header input:focus {
          outline: none;
          border-color: rgba(168, 85, 247, 0.5);
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.2);
        }

        .search-header input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .close-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #fff;
          font-size: 1.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .close-btn:hover {
          background: rgba(239, 68, 68, 0.3);
        }

        .search-results {
          flex: 1;
          overflow-y: auto;
          padding: 1rem;
        }

        .search-result-item {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 16px;
          margin-bottom: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          flex-wrap: wrap;
        }

        .search-result-item img {
          width: 80px;
          height: 110px;
          object-fit: cover;
          border-radius: 12px;
        }

        .search-result-info {
          flex: 1;
          min-width: 200px;
        }

        .search-result-info h4 {
          font-size: 1.1rem;
          margin-bottom: 0.5rem;
        }

        .available-platforms .label {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
          display: block;
          margin-bottom: 0.5rem;
        }

        .platforms-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .platform-link {
          padding: 0.3rem 0.6rem;
          border-radius: 8px;
          font-size: 0.75rem;
          color: #fff;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .platform-link:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }

        .search-result-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          width: 100%;
          margin-top: 0.5rem;
        }

        .action-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .action-label {
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .action-group select {
          padding: 0.5rem;
          background: rgba(168, 85, 247, 0.2);
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
          cursor: pointer;
        }

        .watch-later-btn {
          padding: 0.5rem 1rem;
          background: rgba(251, 191, 36, 0.2);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 8px;
          color: #fcd34d;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .watch-later-btn:hover {
          background: rgba(251, 191, 36, 0.4);
        }

        .platform-selector {
          width: 100%;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          margin-top: 0.5rem;
        }

        .platform-selector span {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.6);
          display: block;
          margin-bottom: 0.5rem;
        }

        .platform-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .platform-buttons button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 8px;
          color: #fff;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .platform-buttons button:hover {
          transform: translateY(-2px);
        }

        .no-results, .search-placeholder {
          text-align: center;
          padding: 3rem;
          color: rgba(255, 255, 255, 0.4);
        }

        .no-results span, .search-placeholder span {
          font-size: 3rem;
          display: block;
          margin-bottom: 1rem;
        }

        .detail-modal {
          width: 100%;
          max-width: 600px;
          max-height: 85vh;
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow-y: auto;
          position: relative;
          padding: 2rem;
        }

        .detail-modal .close-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
        }

        .detail-header {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .detail-header img {
          width: 150px;
          height: 220px;
          object-fit: cover;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        .detail-info h2 {
          font-size: 1.5rem;
          margin-bottom: 1rem;
          background: linear-gradient(135deg, #fff, #a855f7);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .detail-genres {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .detail-ratings h4 {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 0.5rem;
        }

        .rating-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
          font-size: 0.85rem;
        }

        .rating-value {
          font-weight: 600;
          color: #fcd34d;
        }

        .rating-bar {
          flex: 1;
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }

        .rating-bar > div {
          height: 100%;
          border-radius: 3px;
        }

        .detail-synopsis {
          margin-bottom: 1.5rem;
        }

        .detail-synopsis h4 {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 0.5rem;
        }

        .detail-synopsis p {
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.8);
        }

        .detail-links h4 {
          font-size: 0.9rem;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 0.75rem;
        }

        .link-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .platform-btn {
          padding: 0.75rem 1.25rem;
          border-radius: 12px;
          color: #fff;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .platform-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
        }

        .day-picker-modal {
          background: linear-gradient(135deg, #1a1a2e, #16213e);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2rem;
          max-width: 400px;
          width: 100%;
        }

        .day-picker-modal h3 {
          text-align: center;
          margin-bottom: 1.5rem;
          font-size: 1.1rem;
        }

        .days-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .day-btn {
          padding: 1rem;
          background: rgba(168, 85, 247, 0.15);
          border: 1px solid rgba(168, 85, 247, 0.3);
          border-radius: 12px;
          color: #fff;
          font-family: inherit;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .day-btn:hover {
          background: rgba(168, 85, 247, 0.4);
          transform: scale(1.02);
        }

        .day-btn:last-child {
          grid-column: 1 / -1;
        }

        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }

        ::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.3);
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: rgba(168, 85, 247, 0.5);
        }

        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            gap: 1rem;
          }

          .schedule-grid {
            grid-template-columns: 1fr;
          }

          .detail-header {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .detail-genres {
            justify-content: center;
          }
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
        <button 
          className={`nav-tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          📅 Mi Semana
        </button>
        <button 
          className={`nav-tab ${activeTab === 'watchLater' ? 'active' : ''}`}
          onClick={() => setActiveTab('watchLater')}
        >
          🕐 Ver más tarde ({watchLater.length})
        </button>
        <button 
          className={`nav-tab ${activeTab === 'watched' ? 'active' : ''}`}
          onClick={() => setActiveTab('watched')}
        >
          ✓ Series vistas ({watchedList.length})
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'schedule' && (
          <div className="schedule-grid">
            {daysOfWeek.map(day => (
              <div key={day} className="day-column">
                <h3 className="day-header">
                  <span>{['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'][daysOfWeek.indexOf(day)]}</span>
                  {day}
                </h3>
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
              {watchLater.length > 0 ? (
                watchLater.map(anime => (
                  <AnimeCard key={anime.id} anime={anime} isWatchLater={true} />
                ))
              ) : (
                <div className="empty-state">
                  <span>📺</span>
                  <p>No tienes animes guardados para ver más tarde</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Busca un anime y añádelo aquí</p>
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
              {watchedList.length > 0 ? (
                watchedList.map(anime => (
                  <AnimeCard key={anime.id} anime={anime} isWatched={true} />
                ))
              ) : (
                <div className="empty-state">
                  <span>🎬</span>
                  <p>Aún no has marcado ningún anime como visto</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showSearch && <SearchModal />}
      {showAnimeDetail && <AnimeDetailModal />}
      {showDayPicker && <DayPickerModal />}
    </div>
  );
}
