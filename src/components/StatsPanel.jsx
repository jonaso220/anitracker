import React from 'react';

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

export default React.memo(StatsPanel);
