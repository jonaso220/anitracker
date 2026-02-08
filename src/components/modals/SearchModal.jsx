import React from 'react';

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

export default SearchModal;
