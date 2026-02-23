import React from 'react';

const Highlight = ({ text, query }) => {
    if (!query || query.length < 2 || !text) return <>{text}</>;
    const qNorm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Construir mapa de posiciones: para cada char en la versión stripped, guardar su índice original
    const lower = text.toLowerCase();
    const nfd = lower.normalize('NFD');
    const origIdx = []; // origIdx[i] = índice en text original del i-ésimo char stripped
    let stripped = '';
    for (let i = 0, origPos = 0; i < nfd.length; i++) {
        if (!/[\u0300-\u036f]/.test(nfd[i])) {
            stripped += nfd[i];
            origIdx.push(origPos);
        }
        // Avanzar origPos al siguiente char NFC cuando terminamos un cluster NFD
        const nextIsBase = i + 1 >= nfd.length || !/[\u0300-\u036f]/.test(nfd[i + 1]);
        if (nextIsBase && !/[\u0300-\u036f]/.test(nfd[i])) origPos++;
        if (/[\u0300-\u036f]/.test(nfd[i]) && nextIsBase) origPos++;
    }
    const matchStart = stripped.indexOf(qNorm);
    if (matchStart === -1) return <>{text}</>;
    const matchEnd = matchStart + qNorm.length;
    const start = origIdx[matchStart];
    const end = matchEnd < origIdx.length ? origIdx[matchEnd] : text.length;
    return <>{text.slice(0, start)}<mark className="search-highlight">{text.slice(start, end)}</mark>{text.slice(end)}</>;
};

const SearchModal = ({ setShowSearch, searchQuery, handleSearch, searchResults, isSearching, searchPartial = [], setSearchResults, setSearchQuery, setShowDayPicker, addToWatchLater, markAsWatchedFromSearch }) => (
    <div className="modal-overlay" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-header">
          <input type="text" placeholder="🔍 Buscar anime o serie..." value={searchQuery} onChange={e => handleSearch(e.target.value)} autoFocus />
          <button className="close-btn" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>×</button>
        </div>
        <div className="search-results">
          {isSearching ? <div className="skeleton-search-list">{Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-search-item">
              <div className="skeleton skeleton-search-img"></div>
              <div className="skeleton-search-body">
                <div className="skeleton skeleton-line-lg w75"></div>
                <div className="skeleton skeleton-line w50"></div>
                <div className="skeleton skeleton-line w30"></div>
              </div>
            </div>
          ))}</div>
          : searchResults.length > 0 ? <>
            {searchPartial.length > 0 && (
              <div className="search-partial-notice">
                Algunos resultados pueden faltar ({searchPartial.join(', ')} no respondió)
              </div>
            )}
            {searchResults.map(anime => (
            <div key={anime.id} className="search-result-item fade-in">
              <img src={anime.imageSm || anime.image} alt={anime.title} />
              <div className="search-result-info">
                <div className="search-result-title-row"><h4><Highlight text={anime.title} query={searchQuery} /></h4><span className="source-badge">{anime.source}</span></div>
                {anime.altTitles?.length > 0 && <p className="alt-titles">También: {anime.altTitles.slice(0, 3).map((t, i) => <React.Fragment key={i}>{i > 0 && ' · '}<Highlight text={t} query={searchQuery} /></React.Fragment>)}</p>}
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
          ))}</>
          : searchQuery.length > 1 ? <div className="no-results"><span>😢</span><p>Sin resultados para "{searchQuery}"</p></div>
          : <div className="search-placeholder"><span>🎌</span><p>Buscá anime, series o películas</p><p className="search-hint">MAL · Kitsu · AniList · TVMaze · iTunes</p></div>}
        </div>
      </div>
    </div>
);

export default SearchModal;
