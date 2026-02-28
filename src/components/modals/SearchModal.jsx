import React, { useState, useMemo } from 'react';

const Highlight = ({ text, query }) => {
    if (!query || query.length < 2 || !text) return <>{text}</>;
    const qNorm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const lower = text.toLowerCase();
    const nfd = lower.normalize('NFD');
    const origIdx = [];
    let stripped = '';
    for (let i = 0, origPos = 0; i < nfd.length; i++) {
        if (!/[\u0300-\u036f]/.test(nfd[i])) {
            stripped += nfd[i];
            origIdx.push(origPos);
        }
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

const TYPE_OPTIONS = ['Todos', 'TV', 'Película', 'OVA', 'ONA', 'Special', 'TV Short', 'Serie'];
const SCORE_OPTIONS = [
    { label: 'Cualquiera', min: 0 },
    { label: '7+', min: 7 },
    { label: '8+', min: 8 },
    { label: '9+', min: 9 },
];

const SearchModal = ({ setShowSearch, searchQuery, handleSearch, searchResults, isSearching, searchPartial = [], setSearchResults, setSearchQuery, setShowDayPicker, addToWatchLater, markAsWatchedFromSearch }) => {
    const [showFilters, setShowFilters] = useState(false);
    const [filterType, setFilterType] = useState('Todos');
    const [filterYearFrom, setFilterYearFrom] = useState('');
    const [filterYearTo, setFilterYearTo] = useState('');
    const [filterScore, setFilterScore] = useState(0);

    const hasActiveFilters = filterType !== 'Todos' || filterYearFrom || filterYearTo || filterScore > 0;

    const filteredResults = useMemo(() => {
        if (!hasActiveFilters) return searchResults;
        return searchResults.filter(anime => {
            // Type filter
            if (filterType !== 'Todos') {
                const animeType = (anime.type || '').toLowerCase();
                const target = filterType.toLowerCase();
                if (animeType !== target) return false;
            }
            // Year filter
            if (filterYearFrom) {
                const year = parseInt(anime.year);
                if (!year || year < parseInt(filterYearFrom)) return false;
            }
            if (filterYearTo) {
                const year = parseInt(anime.year);
                if (!year || year > parseInt(filterYearTo)) return false;
            }
            // Score filter
            if (filterScore > 0) {
                if (!anime.rating || anime.rating < filterScore) return false;
            }
            return true;
        });
    }, [searchResults, filterType, filterYearFrom, filterYearTo, filterScore, hasActiveFilters]);

    const clearFilters = () => {
        setFilterType('Todos');
        setFilterYearFrom('');
        setFilterYearTo('');
        setFilterScore(0);
    };

    return (
    <div className="modal-overlay" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="bottom-sheet-handle"></div>
        <div className="search-header">
          <input type="text" placeholder="Buscar anime o serie..." value={searchQuery} onChange={e => handleSearch(e.target.value)} autoFocus />
          <button className={`filter-toggle-btn ${hasActiveFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)} title="Filtros">
            {hasActiveFilters ? '⚙ Filtros activos' : '⚙'}
          </button>
          <button className="close-btn" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>x</button>
        </div>

        {showFilters && (
          <div className="search-filters fade-in">
            <div className="search-filters-row">
              <div className="search-filter-group">
                <label>Tipo</label>
                <div className="filter-chips">
                  {TYPE_OPTIONS.map(t => (
                    <button key={t} className={`filter-chip ${filterType === t ? 'active' : ''}`} onClick={() => setFilterType(t)}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="search-filter-group">
                <label>Año</label>
                <div className="filter-year-range">
                  <input type="number" placeholder="Desde" value={filterYearFrom} onChange={e => setFilterYearFrom(e.target.value)} min="1960" max="2030" />
                  <span>—</span>
                  <input type="number" placeholder="Hasta" value={filterYearTo} onChange={e => setFilterYearTo(e.target.value)} min="1960" max="2030" />
                </div>
              </div>
              <div className="search-filter-group">
                <label>Puntuación</label>
                <div className="filter-chips">
                  {SCORE_OPTIONS.map(s => (
                    <button key={s.min} className={`filter-chip ${filterScore === s.min ? 'active' : ''}`} onClick={() => setFilterScore(s.min)}>{s.label}</button>
                  ))}
                </div>
              </div>
            </div>
            {hasActiveFilters && (
              <button className="clear-filters-btn" onClick={clearFilters}>Limpiar filtros</button>
            )}
          </div>
        )}

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
          : filteredResults.length > 0 ? <>
            {searchPartial.length > 0 && (
              <div className="search-partial-notice">
                Algunos resultados pueden faltar ({searchPartial.join(', ')} no respondió)
              </div>
            )}
            {hasActiveFilters && (
              <div className="search-filter-count">
                Mostrando {filteredResults.length} de {searchResults.length} resultados
              </div>
            )}
            {filteredResults.map(anime => (
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
          : searchResults.length > 0 && hasActiveFilters ? <div className="no-results"><span>🔍</span><p>Ningún resultado coincide con los filtros</p><button className="clear-filters-btn" onClick={clearFilters}>Limpiar filtros</button></div>
          : searchQuery.length > 1 ? <div className="no-results"><span>😢</span><p>Sin resultados para "{searchQuery}"</p></div>
          : <div className="search-placeholder"><span>🎌</span><p>Buscá anime, series o películas</p><p className="search-hint">MAL · Kitsu · AniList · TVMaze · iTunes</p></div>}
        </div>
      </div>
    </div>
    );
};

export default SearchModal;
